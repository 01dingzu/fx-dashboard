/**
 * update-data.mjs — fx-dashboard 静态数据更新脚本
 *
 * 生成/更新 data/ 目录下的静态 JSON 文件（供前端 data-adapters.js 消费）:
 *   safe-rmb-rates.json      人民币汇率（Frankfurter/ECB 参考汇率，见下方说明）
 *   treasury-us-*.json       美国国债收益率（FRED）
 *   index-*.json             全球股市指数（Yahoo Finance）
 *   metals-*.json            贵金属历史（Yahoo Finance + gold-api 最新价）
 *   metals-current.json      贵金属现价（gold-api.com）
 *
 * 说明: 原设计的数据源为中国外汇交易中心(SAFE)官方中间价，但其接口
 * 反爬严格且对海外 IP 不稳定（GitHub Actions runner 在海外），
 * 故改用 Frankfurter(ECB 参考汇率)作为 CNY 数据源，数值与官方
 * 中间价偏差通常 < 0.3%，对观察用途足够。
 *
 * 运行: node scripts/update-data.mjs   （Node >= 18，无第三方依赖）
 * 每个数据源独立处理，单个失败不影响其他文件，已有旧文件保留不覆盖。
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const HISTORY_DAYS = 730; // 2 年历史（看板最长 1 年 + 余量）

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

mkdirSync(DATA_DIR, { recursive: true });

// ---------- 工具函数 ----------

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmtDate(d);
}

async function fetchWithRetry(url, opts = {}, retries = 3, timeoutMs = 30000) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        ...opts,
        signal: controller.signal,
        headers: { 'User-Agent': UA, ...(opts.headers || {}) },
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

/** 写入 JSON（仅当内容有变化时），返回是否写入 */
function writeJsonIfChanged(filename, data) {
  const path = join(DATA_DIR, filename);
  const newContent = JSON.stringify(data);
  if (existsSync(path) && readFileSync(path, 'utf8') === newContent) {
    console.log(`  = ${filename} 无变化`);
    return false;
  }
  writeFileSync(path, newContent);
  const size = (Buffer.byteLength(newContent) / 1024).toFixed(1);
  console.log(`  + ${filename} 已写入 (${size} KB)`);
  return true;
}

/** 去重 + 按日期升序 */
function normalizeSeries(arr) {
  const map = new Map();
  for (const item of arr) {
    if (item && item.date && item.value != null && isFinite(item.value)) {
      map.set(item.date, item.value);
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}

// ---------- 1. 人民币汇率 (safe-rmb-rates.json) ----------
// 格式: [{date, USD: 6.72, EUR: 7.85, ...}]  含义: 1 外币 = X CNY

const CNY_CURRENCIES = ['USD', 'EUR', 'GBP', 'HKD', 'JPY', 'AUD', 'NZD', 'SGD', 'CHF', 'CAD', 'KRW', 'THB', 'MYR', 'ZAR'];

async function updateRmbRates() {
  console.log('[1/5] 人民币汇率 (Frankfurter ECB 参考汇率)...');
  const start = daysAgo(HISTORY_DAYS);
  const end = fmtDate(new Date());
  const to = CNY_CURRENCIES.join(',');
  const url = `https://api.frankfurter.dev/v1/${start}..${end}?from=CNY&to=${to}`;
  const data = await (await fetchWithRetry(url)).json();

  const entries = [];
  for (const [date, rates] of Object.entries(data.rates || {})) {
    const entry = { date };
    let hasAny = false;
    for (const c of CNY_CURRENCIES) {
      const r = rates[c];
      if (r != null && r > 0) {
        entry[c] = parseFloat((1 / r).toFixed(6)); // 1 CNY = r 外币 => 1 外币 = 1/r CNY
        hasAny = true;
      }
    }
    if (hasAny) entries.push(entry);
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));

  if (entries.length === 0) throw new Error('无有效数据');
  writeJsonIfChanged('safe-rmb-rates.json', entries);
  console.log(`  共 ${entries.length} 天, 最新: ${entries[entries.length - 1].date}`);
}

// ---------- 2. 美国国债收益率 (treasury-us-*.json) ----------
// 格式: [{date, value}]  value 单位 %
// 主源: 美国财政部官方每日收益率曲线 CSV（含 2Y/10Y/30Y，覆盖整年，可回填缺口）
// 备源: FRED fredgraph.csv（2026-08 起对本客户端静默封锁返回空体，仅作兜底）

const TREASURY_MAP = {
  'treasury-us-10y.json': { fred: 'DGS10', column: '10 Yr' },
  'treasury-us-2y.json': { fred: 'DGS2', column: '2 Yr' },
  'treasury-us-30y.json': { fred: 'DGS30', column: '30 Yr' },
};

/** 裁剪序列到最近 N 天 */
function trimSeries(arr, days = HISTORY_DAYS) {
  const cutoff = daysAgo(days);
  return arr.filter(item => item.date >= cutoff);
}

/** 拉取美国财政部官方收益率曲线指定列序列（当年 + 上一年，可回填缺口） */
async function fetchTreasurySeries(columnName) {
  const years = [new Date().getFullYear(), new Date().getFullYear() - 1];
  const out = [];
  for (const year of years) {
    try {
      const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
      const csv = await (await fetchWithRetry(url)).text();
      if (!csv.trim()) throw new Error('空响应');
      const lines = csv.trim().split('\n');
      const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const colIdx = header.indexOf(columnName);
      if (colIdx < 0) throw new Error(`缺少列 ${columnName}`);
      for (const line of lines.slice(1)) {
        if (!line.trim()) continue;
        const cells = line.split(',');
        const [m, d, y] = cells[0].trim().split('/');
        if (!m || !d || !y) continue;
        const v = parseFloat(cells[colIdx]);
        if (isNaN(v)) continue;
        out.push({ date: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, value: v });
      }
    } catch (e) {
      console.warn(`  ! treasury.gov ${year} 年数据获取失败: ${e.message}`);
    }
  }
  if (out.length === 0) throw new Error('treasury.gov 两年均无有效数据');
  return out;
}

async function updateTreasury() {
  console.log('[2/5] 美国国债收益率 (treasury.gov 官方, FRED 兜底)...');
  for (const [filename, cfg] of Object.entries(TREASURY_MAP)) {
    let series = [];
    let source = '';
    try {
      // 主源: treasury.gov 官方 CSV（覆盖整年，可回填断更缺口）
      series = await fetchTreasurySeries(cfg.column);
      source = 'treasury.gov';
    } catch (e) {
      console.warn(`  ! treasury.gov 不可用 (${e.message})，尝试 FRED 兜底`);
      try {
        const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${cfg.fred}`;
        const csv = await (await fetchWithRetry(url)).text();
        const lines = csv.trim().split('\n').slice(1);
        series = trimSeries(normalizeSeries(
          lines.map(line => {
            const [date, raw] = line.split(',');
            const value = parseFloat(raw);
            return { date, value: isNaN(value) ? null : value };
          })
        ));
        source = 'FRED';
      } catch (e2) {
        console.warn(`  ! FRED 也不可用: ${e2.message}`);
        series = [];
      }
    }

    // 合并已有文件的历史数据（保留 2 年窗口）
    if (series.length > 0 && existsSync(join(DATA_DIR, filename))) {
      try {
        const old = JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8'));
        series = [...old, ...series];
        if (source !== 'FRED') source += '+已有文件合并';
      } catch {}
    }

    series = trimSeries(normalizeSeries(series));
    if (series.length === 0) {
      console.warn(`  ! ${filename} 无有效数据，保留旧文件`);
      continue;
    }
    writeJsonIfChanged(filename, series);
    const last = series[series.length - 1];
    console.log(`  ${filename} (${source}): ${series.length} 条, 最新: ${last.date} = ${last.value}`);
  }
}

// ---------- 3. 股市指数 (index-*.json) ----------
// 格式: [{date, value}]

const INDEX_MAP = {
  'index-gspc.json': '^GSPC',    // 标普500
  'index-ixic.json': '^IXIC',    // 纳斯达克综合
  'index-dji.json': '^DJI',      // 道琼斯工业
  'index-rut.json': '^RUT',      // 罗素2000
  'index-ssec.json': '000001.SS', // 上证综指
  'index-szse.json': '399001.SZ', // 深证成指
  'index-csi300.json': '000300.SS', // 沪深300
  'index-hsi.json': '^HSI',      // 恒生指数
  'index-ftse.json': '^FTSE',    // 富时100
  'index-gdaxi.json': '^GDAXI',  // 德国DAX
  'index-fchi.json': '^FCHI',    // 法国CAC 40
  'index-n225.json': '^N225',    // 日经225
  'index-ks11.json': '^KS11',    // 韩国KOSPI
  'index-vix.json': '^VIX',      // VIX波动率
};

async function fetchYahooDaily(symbol, range = '2y') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const data = await (await fetchWithRetry(url)).json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo 返回无效数据: ${symbol}`);
  const stamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const series = [];
  for (let i = 0; i < stamps.length; i++) {
    if (closes[i] == null) continue;
    series.push({ date: fmtDate(new Date(stamps[i] * 1000)), value: closes[i] });
  }
  return series;
}

async function updateIndices() {
  console.log('[3/5] 股市指数 (Yahoo Finance)...');
  let ok = 0, fail = 0;
  for (const [filename, symbol] of Object.entries(INDEX_MAP)) {
    try {
      const series = normalizeSeries(await fetchYahooDaily(symbol));
      if (series.length === 0) throw new Error('空数据');
      writeJsonIfChanged(filename, series);
      const last = series[series.length - 1];
      console.log(`  ${symbol}: ${series.length} 条, 最新: ${last.date} = ${last.value}`);
      ok++;
    } catch (e) {
      console.warn(`  ! ${filename} (${symbol}) 获取失败: ${e.message}，保留旧文件`);
      fail++;
    }
  }
  console.log(`  指数结果: ${ok} 成功 / ${fail} 失败`);
}

// ---------- 4. 贵金属历史 (metals-*.json) ----------
// 格式: [{date, value}]  value 单位 USD/oz
// 主源: Yahoo (XAUUSD=X 现货, 回退期货); 最新一天用 gold-api 现货价覆盖/补充

const METALS_MAP = {
  'metals-xau.json': { yahooSpot: 'XAUUSD=X', yahooFutures: 'GC=F', api: 'XAU', tdSymbol: 'XAU/USD' },
  'metals-xag.json': { yahooSpot: 'XAGUSD=X', yahooFutures: 'SI=F', api: 'XAG', tdSymbol: 'XAG/USD' },
  'metals-xpt.json': { yahooSpot: 'XPTUSD=X', yahooFutures: 'PL=F', api: 'XPT', tdSymbol: 'XPT/USD' },
  'metals-xpd.json': { yahooSpot: 'XPDUSD=X', yahooFutures: 'PA=F', api: 'XPD', tdSymbol: 'XPD/USD' },
};

const TD_API_KEY = '4f4e965acd514b20b30af066c1830ffa';

async function fetchTwelveDataHistory(tdSymbol, outputsize = 500) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=1day&outputsize=${outputsize}&apikey=${TD_API_KEY}`;
  const data = await (await fetchWithRetry(url)).json();
  if (data.code === 404 || data.status === 'error') {
    throw new Error(`Twelve Data: ${data.message || '不可用'}`);
  }
  if (!data.values || !Array.isArray(data.values)) {
    throw new Error('Twelve Data: 无数据');
  }
  return data.values.map(v => ({
    date: v.datetime,
    value: parseFloat(v.close)
  })).reverse(); // Twelve Data 返回最新在前，反转为升序
}

async function fetchGoldApiPrice(symbol) {
  const data = await (await fetchWithRetry(`https://api.gold-api.com/price/${symbol}`)).json();
  if (data?.price == null) throw new Error(`gold-api 无价格: ${symbol}`);
  return { price: data.price, updatedAt: data.updatedAt || new Date().toISOString() };
}

async function updateMetalsHistory() {
  console.log('[4/5] 贵金属历史 (Yahoo + gold-api)...');
  for (const [filename, cfg] of Object.entries(METALS_MAP)) {
    try {
      let series = [];
      let source = '';
      try {
        series = await fetchYahooDaily(cfg.yahooSpot);
        source = `Yahoo 现货 ${cfg.yahooSpot}`;
      } catch {
        try {
          series = await fetchYahooDaily(cfg.yahooFutures);
          source = `Yahoo 期货 ${cfg.yahooFutures}`;
        } catch (e) {
          console.warn(`  ! Yahoo 不可用 (${e.message})，改用增量模式`);
          series = [];
        }
      }
      series = normalizeSeries(series);

      // Yahoo 不可用时尝试 Twelve Data
      if (series.length === 0 && cfg.tdSymbol) {
        try {
          series = await fetchTwelveDataHistory(cfg.tdSymbol);
          source = `Twelve Data ${cfg.tdSymbol}`;
          console.log(`  → ${cfg.api} 从 Twelve Data 获取 ${series.length} 条历史`);
        } catch (e) {
          console.warn(`  ! Twelve Data ${cfg.tdSymbol} 不可用: ${e.message}`);
        }
      }

      // Yahoo 完全失败时，读取旧文件做增量（每日追加 gold-api 现价）
      if (series.length === 0 && existsSync(join(DATA_DIR, filename))) {
        try {
          series = JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8'));
          source = '已有文件增量';
        } catch {}
      }

      // 用 gold-api 实时现货价覆盖/补充最新一天
      try {
        const spot = await fetchGoldApiPrice(cfg.api);
        const today = spot.updatedAt.split('T')[0];
        const last = series[series.length - 1];
        if (!last || last.date < today) {
          series.push({ date: today, value: spot.price });
        } else if (last && last.date === today) {
          last.value = spot.price;
        }
      } catch (e) {
        console.warn(`  ! gold-api ${cfg.api} 现价获取失败: ${e.message}`);
      }

      if (series.length === 0) throw new Error('空数据');
      writeJsonIfChanged(filename, trimSeries(series));
      const last = series[series.length - 1];
      console.log(`  ${cfg.api}: ${series.length} 条 (${source}), 最新: ${last.date} = ${last.value}`);
    } catch (e) {
      console.warn(`  ! ${filename} 获取失败: ${e.message}，保留旧文件`);
    }
  }
}

// ---------- 5. 贵金属现价 (metals-current.json) ----------
// 格式: { XAU: {price, updatedAt}, ... }

async function updateMetalsCurrent() {
  console.log('[5/5] 贵金属现价 (gold-api.com)...');
  const result = {};
  for (const symbol of ['XAU', 'XAG', 'XPT', 'XPD']) {
    try {
      const { price, updatedAt } = await fetchGoldApiPrice(symbol);
      result[symbol] = { price, updatedAt };
      console.log(`  ${symbol}: $${price}`);
    } catch (e) {
      console.warn(`  ! ${symbol} 获取失败: ${e.message}`);
    }
  }
  if (Object.keys(result).length === 0) throw new Error('全部贵金属现价获取失败');
  writeJsonIfChanged('metals-current.json', result);
}

// ---------- 主流程 ----------

async function main() {
  console.log(`数据更新开始: ${new Date().toISOString()}`);
  console.log(`数据目录: ${DATA_DIR}\n`);

  const tasks = [
    ['人民币汇率', updateRmbRates],
    ['国债收益率', updateTreasury],
    ['股市指数', updateIndices],
    ['贵金属历史', updateMetalsHistory],
    ['贵金属现价', updateMetalsCurrent],
  ];

  const failures = [];
  for (const [name, fn] of tasks) {
    try {
      await fn();
    } catch (e) {
      console.error(`!! ${name} 整体失败: ${e.message}`);
      failures.push(name);
    }
    console.log('');
  }

  // 仅当全部任务失败时才以非零退出；部分失败时正常退出，
  // 让 Actions 的 commit 步骤仍能提交成功更新的数据源（否则一个源挂掉全看板断更）。
  if (failures.length === tasks.length) {
    console.error('全部数据源更新失败');
    process.exitCode = 1;
  } else {
    if (failures.length > 0) console.warn(`部分数据源失败(已跳过): ${failures.join(', ')}`);
    console.log('数据更新完成');
  }
}

main();
