/**
 * update-data.mjs — fx-dashboard 静态数据更新脚本
 *
 * 生成/更新 data/ 目录下的静态 JSON 文件（供前端 data-adapters.js 消费）:
 *   safe-rmb-rates.json      人民币汇率（Frankfurter/ECB 参考汇率，见下方说明）
 *   treasury-us-*.json       美国国债收益率（FRED）
 *   index-*.json             全球股市指数（A 股走东方财富，其余 Yahoo Finance）
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
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 允许用 FX_DATA_DIR 指向别处：测试脚本靠它把写入引到临时目录，不碰真实 data/
const DATA_DIR = process.env.FX_DATA_DIR || join(__dirname, '..', 'data');
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

/** 按 date 去重合并（新数据覆盖同日旧值），保持升序。多字段条目（如汇率）也不会丢字段 */
function mergeByDate(oldArr, incoming) {
  const map = new Map();
  for (const it of oldArr) if (it && it.date) map.set(it.date, it);
  for (const it of incoming) {
    if (!it || !it.date) continue;
    const prev = map.get(it.date);
    map.set(it.date, prev ? { ...prev, ...it } : it);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 读回已落盘的序列条数（日志用：源条数 ≠ 落盘条数，窗口裁剪后会变少） */
function storedSeriesLen(filename) {
  const p = join(DATA_DIR, filename);
  if (!existsSync(p)) return 0;
  try {
    const arr = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(arr) ? arr.length : 0;
  } catch { return 0; }
}

/**
 * 带「缩水保护」的序列写入。
 *
 * 背景: 数据源会间歇性"退化"——Yahoo 对 A 股指数（如 000300.SS）时不时只返回
 * 1 个点（最新快照），旧写法直接覆盖，于是 index-csi300.json 从 443 条被写成
 * 1 条，并连续三周多没人察觉（看板上表现为该标的曲线空白）。
 *
 * 策略: 新数据条数不足旧文件一半、且旧文件本身够长时，判定为源退化，
 *       只接受比旧文件更新的日期，绝不覆盖任何历史点位；其余情况正常合并。
 */
function writeSeriesGuarded(filename, incoming, opts = {}) {
  const { minOld = 60, minRatio = 0.5, trim = true } = opts;
  const path = join(DATA_DIR, filename);
  let old = [];
  if (existsSync(path)) {
    try { old = JSON.parse(readFileSync(path, 'utf8')); } catch { old = []; }
  }
  if (!Array.isArray(old)) old = [];
  if (!Array.isArray(incoming) || incoming.length === 0) {
    console.warn(`  ! ${filename} 无新数据，保留旧文件`);
    return false;
  }

  let payload = incoming;
  if (old.length >= minOld && incoming.length < old.length * minRatio) {
    const lastOldDate = old[old.length - 1]?.date || '';
    const fresh = incoming.filter(it => it.date > lastOldDate);
    console.warn(
      `  ! ${filename} 数据源仅返回 ${incoming.length} 条（已有 ${old.length} 条），判定源退化：` +
      `只追加 ${fresh.length} 条新日期，历史点位全部保留`,
    );
    payload = fresh;
  }

  const merged = mergeByDate(old, payload);
  const finalArr = trim ? trimSeries(merged) : merged;
  if (finalArr.length === 0) {
    console.warn(`  ! ${filename} 合并后为空，保留旧文件`);
    return false;
  }
  writeJsonIfChanged(filename, finalArr);
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
  writeSeriesGuarded('safe-rmb-rates.json', entries);
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

// cn 字段 = 东方财富 secid：沪市前缀 1. / 深市前缀 0.
// tx 字段 = 腾讯行情代码：沪市 sh / 深市 sz
// A 股指数按 东财 → 腾讯 → Yahoo 顺序取，前两个是国内源、数据完整，
// Yahoo 对 000300.SS 之类会间歇性只回 1 个点，只当最后兜底。
// 实测 GitHub Runner 访问不到东财（fetch failed），所以腾讯这一级是必需的，不是锦上添花。
const INDEX_MAP = {
  'index-gspc.json': { yahoo: '^GSPC' },                        // 标普500
  'index-ixic.json': { yahoo: '^IXIC' },                        // 纳斯达克综合
  'index-dji.json': { yahoo: '^DJI' },                          // 道琼斯工业
  'index-rut.json': { yahoo: '^RUT' },                          // 罗素2000
  'index-ssec.json': { yahoo: '000001.SS', cn: '1.000001', tx: 'sh000001' },    // 上证综指
  'index-szse.json': { yahoo: '399001.SZ', cn: '0.399001', tx: 'sz399001' },    // 深证成指
  'index-csi300.json': { yahoo: '000300.SS', cn: '1.000300', tx: 'sh000300' },  // 沪深300
  'index-hsi.json': { yahoo: '^HSI' },                          // 恒生指数
  'index-ftse.json': { yahoo: '^FTSE' },                        // 富时100
  'index-gdaxi.json': { yahoo: '^GDAXI' },                      // 德国DAX
  'index-fchi.json': { yahoo: '^FCHI' },                        // 法国CAC 40
  'index-n225.json': { yahoo: '^N225' },                        // 日经225
  'index-ks11.json': { yahoo: '^KS11' },                        // 韩国KOSPI
  'index-vix.json': { yahoo: '^VIX' },                          // VIX波动率
};

/** 2 年窗口下的正常条数下限；低于它说明数据源退化了 */
const INDEX_MIN_OK = 120;

/**
 * 东方财富日 K（A 股指数权威源）。
 * Yahoo 对 A 股指数会间歇性只回 1 个点——index-csi300.json 就这样被写成 1 条并连续
 * 三周多无人察觉。东财返回格式最省：klines: ["日期,收盘", ...]（升序）。
 */
async function fetchEastmoneyDaily(secid, limit = 500) {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get`
    + `?secid=${secid}&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=1&end=20500101&lmt=${limit}`;
  const data = await (await fetchWithRetry(url)).json();
  const klines = data?.data?.klines;
  if (!Array.isArray(klines) || klines.length === 0) throw new Error('东财无数据');
  return klines.map((k) => {
    const [date, close] = k.split(',');
    return { date, value: parseFloat(close) };
  });
}

/**
 * 腾讯行情日 K（A 股指数第二源）。
 * 存在的理由：实测 GitHub Runner 访问不到东财（fetch failed），而 Yahoo 对
 * 000300.SS 只回 1 个点。没有这一级，沪深300 在 CI 里就永远补不上新数据。
 * 返回 data[symbol].day（或 qfqday）：[[日期, 开, 收, 高, 低, 量], ...]（升序）。
 */
async function fetchTencentDaily(txSymbol, limit = 500) {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get`
    + `?param=${txSymbol},day,,,${limit},`;
  const data = await (await fetchWithRetry(url, { headers: { Referer: 'https://gu.qq.com/' } })).json();
  const node = data?.data?.[txSymbol];
  const rows = node?.day || node?.qfqday;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('腾讯无数据');
  return rows.map((r) => ({ date: String(r[0]), value: parseFloat(r[2]) }));
}

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
  console.log('[3/5] 股市指数 (A 股走东财→腾讯, 其余 Yahoo Finance)...');
  let ok = 0, fail = 0;
  for (const [filename, cfg] of Object.entries(INDEX_MAP)) {
    try {
      let series = [];
      let source = '';

      // A 股指数：依次尝试国内源（数据完整），Yahoo 只当最后兜底
      const cnSources = [];
      if (cfg.cn) cnSources.push({ name: `东财 ${cfg.cn}`, run: () => fetchEastmoneyDaily(cfg.cn) });
      if (cfg.tx) cnSources.push({ name: `腾讯 ${cfg.tx}`, run: () => fetchTencentDaily(cfg.tx) });

      for (const s of cnSources) {
        if (series.length >= INDEX_MIN_OK) break;
        try {
          const got = normalizeSeries(await s.run());
          if (got.length >= INDEX_MIN_OK) {
            series = got;
            source = s.name;
          } else {
            console.warn(`  ! ${s.name} 仅 ${got.length} 条，换下一个源`);
          }
        } catch (e) {
          console.warn(`  ! ${s.name} 不可用: ${e.message}，换下一个源`);
        }
      }

      // Yahoo：非 A 股指数的主源，也是 A 股指数退化时的兜底
      if (series.length < INDEX_MIN_OK) {
        try {
          const yh = normalizeSeries(await fetchYahooDaily(cfg.yahoo));
          if (yh.length > series.length) {
            if (series.length > 0) console.log(`  → ${filename} 改用 Yahoo ${cfg.yahoo} 的 ${yh.length} 条`);
            else source = `Yahoo ${cfg.yahoo}`;
            series = yh;
          }
        } catch (e) {
          console.warn(`  ! Yahoo ${cfg.yahoo} 失败: ${e.message}`);
        }
      }

      if (series.length === 0) throw new Error('空数据');
      writeSeriesGuarded(filename, series);
      const last = series[series.length - 1];
      const stored = storedSeriesLen(filename);
      const note = stored === series.length ? '' : ` → 文件 ${stored} 条(窗口裁剪)`;
      console.log(`  ${filename} (${source || cfg.yahoo}): 源 ${series.length} 条${note}, 最新: ${last.date} = ${last.value}`);
      ok++;
    } catch (e) {
      console.warn(`  ! ${filename} (${cfg.yahoo}) 获取失败: ${e.message}，保留旧文件`);
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
      writeSeriesGuarded(filename, series);
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

// 直接 `node scripts/update-data.mjs` 才跑主流程；被 import 时只导出纯函数，
// 这样 scripts/test-update-data.mjs 能直接测「缩水保护」而不复刻一份实现。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  DATA_DIR,
  writeSeriesGuarded,
  writeJsonIfChanged,
  mergeByDate,
  normalizeSeries,
  trimSeries,
  fetchEastmoneyDaily,
  fetchTencentDaily,
  INDEX_MAP,
};
