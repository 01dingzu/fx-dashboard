/**
 * _diag.mjs — 汇率台「没数据」现场诊断
 * 用干净档案（空 localStorage）打开站点，抓：报错 / 失败请求 / 列表卡片取值 / 数据文件可达性
 * 用法：node _diag.mjs [URL]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_ = process.argv[2] || process.env.PAGE_URL || 'https://01dingzu.github.io/fx-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SHOTS = path.join(ROOT, '_shots');
fs.mkdirSync(SHOTS, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fxdiag-'));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  userDataDir: profile,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();

const errs = [];
const fails = [];
const reqs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 220)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 220)); });
page.on('response', (r) => {
  const u = r.url();
  const st = r.status();
  if (st >= 400) fails.push(`${st} ${u}`);
  // 应用自身对 data/*.json 的请求（第三方 API 的 URL 不以 .json 结尾，天然不计入）
  if (/\/data\/[^/]+\.json(\?|$)/.test(u) && !/_probe=1/.test(u)) reqs.push(`${st} ${u.slice(0, 220)}`);
});
page.on('requestfailed', (r) => fails.push(`REQFAIL ${r.failure()?.errorText} ${r.url()}`));

await page.setViewport({ width: 1280, height: 900 });
const t0 = Date.now();
await page.goto(URL_, { waitUntil: 'networkidle2', timeout: 60000 });
const loadMs = Date.now() - t0;
await sleep(7000);   // 等首屏数据并行加载完

const state = await page.evaluate(async () => {
  const cards = [...document.querySelectorAll('#pair-list .pair-card')].map((n) => ({
    title: n.querySelector('.pair-card-title')?.textContent.replace(/\s+/g, ' ').trim(),
    rate: n.querySelector('.pair-card-rate')?.textContent.trim(),
    id: n.dataset.id,
  }));
  const ls = (k) => { try { return localStorage.getItem(k); } catch (e) { return 'ERR ' + e.message; } };
  let assets = null;
  try { assets = JSON.parse(localStorage.getItem('fx_workbench_assets_v2') || 'null'); } catch (e) { assets = 'ERR'; }

  // 从页面源直接探数据文件（浏览器视角）
  // 注意：带 _probe=1 标记，避免被下面的「重复请求检查」误当成应用发出的请求
  const probe = {};
  for (const f of ['data/metals-current.json', 'data/index-gspc.json', 'data/safe-rmb-rates.json', 'data/index-csi300.json']) {
    try {
      const r = await fetch(f + (f.includes('?') ? '&' : '?') + '_probe=1', { cache: 'no-store' });
      probe[f] = r.ok ? `OK ${(await r.text()).length}B` : `HTTP ${r.status}`;
    } catch (e) { probe[f] = 'THROW ' + e.message; }
  }

  return {
    title: document.title,
    lastUpdate: document.querySelector('#last-update')?.textContent.trim() || '',
    pairCount: document.querySelector('#pair-count')?.textContent ?? null,
    pairDetailDisplay: document.querySelector('#pair-detail')?.style.display ?? null,
    emptyShown: !!document.querySelector('#empty-state')?.classList.contains('show'),
    cardCount: cards.length,
    cards: cards.slice(0, 14),
    detailRate: document.querySelector('#detail-rate-value')?.textContent.trim() || '',
    detailChange: document.querySelector('#detail-change')?.textContent.trim() || '',
    toast: document.querySelector('#toast')?.textContent.trim() || '',
    canvas: !!document.querySelector('#main-chart, canvas'),
    lsAssetsCount: Array.isArray(assets) ? assets.length : String(assets).slice(0, 80),
    lsAssetTypes: Array.isArray(assets) ? [...new Set(assets.map((a) => a.type))].join(',') : '',
    lsSettings: ls('fx_workbench_settings'),
    probe,
  };
});

console.log('URL        :', URL_);
console.log('加载耗时   :', loadMs + 'ms');
console.log('最后更新   :', state.lastUpdate || '(空)');
console.log('标的计数   :', state.pairCount, '| 卡片数:', state.cardCount, '| 空状态:', state.emptyShown);
console.log('详情区显示 :', JSON.stringify(state.pairDetailDisplay), '| 当前值:', state.detailRate, '| 涨跌:', state.detailChange);
console.log('图表 canvas:', state.canvas, '| toast:', state.toast || '(无)');
console.log('localStorage 标的:', state.lsAssetsCount, '类型:', state.lsAssetTypes, '| settings:', state.lsSettings);
console.log('页面内探数据文件:', JSON.stringify(state.probe, null, 2));
console.log('--- 卡片明细 ---');
for (const c of state.cards) console.log(`  ${String(c.rate).padEnd(14)} ${c.title}   [${c.id}]`);
console.log('--- 失败请求 (' + fails.length + ') ---');
fails.slice(0, 20).forEach((f) => console.log('  ' + f));
console.log('--- 页面报错 (' + errs.length + ') ---');
errs.slice(0, 12).forEach((e) => console.log('  ' + e));
console.log('--- data/*.json 请求 (' + reqs.length + ') ---');
reqs.forEach((r) => console.log('  ' + r));

// 同一静态文件的并发次数：>1 说明缓存被击穿（慢网络下会互相抢带宽、一起超时）。
// 带 ?_t= 的是「失败重试」重发，不算击穿，单独统计。
const tally = new Map();
const retries = new Map();
for (const r of reqs) {
  const u = r.replace(/^\d+\s+/, '');
  const bare = u.split('?')[0];
  if (/[?&]_t=/.test(u)) retries.set(bare, (retries.get(bare) || 0) + 1);
  else tally.set(bare, (tally.get(bare) || 0) + 1);
}
const dupes = [...tally.entries()].filter(([, n]) => n > 1);
console.log('--- 重复请求检查（首轮并发）---');
if (!dupes.length) console.log('  ✓ 无同一文件被并发重复拉取');
else dupes.forEach(([u, n]) => console.log(`  ✗ ${u} 被请求 ${n} 次`));
if (retries.size) {
  console.log('--- 失败重试重发（?_t=）---');
  [...retries.entries()].forEach(([u, n]) => console.log(`  · ${u} 重发 ${n} 次`));
}
console.log(`  ⇒ 重复并发 ${dupes.length} 处（期望 0）| 首轮请求 ${[...tally.values()].reduce((a, b) => a + b, 0)} 次 / 去重后 ${tally.size} 个文件`);

fs.mkdirSync(SHOTS, { recursive: true });
await page.screenshot({ path: path.join(SHOTS, 'diag.png') });
await browser.close();
fs.rmSync(profile, { recursive: true, force: true });
