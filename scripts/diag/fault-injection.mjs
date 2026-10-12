/**
 * _diag2.mjs — 故障注入：定位「完全没有数据」的成因
 * 逐个屏蔽外部依赖（jsdelivr CDN / frankfurter API / data 静态 JSON），看页面退化成什么样
 * 用法：node _diag2.mjs [URL]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_ = process.argv[2] || 'https://01dingzu.github.io/fx-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SHOTS = path.join(ROOT, '_shots');
fs.mkdirSync(SHOTS, { recursive: true });

const SCENARIOS = [
  { name: '基线（全通）', block: [] },
  { name: '屏蔽 jsdelivr（Chart.js/xlsx CDN）', block: [/cdn\.jsdelivr\.net/] },
  { name: '屏蔽 frankfurter（外汇实时 API）', block: [/api\.frankfurter\.dev/] },
  { name: '屏蔽 data/*.json（静态数据）', block: [/\/data\/[^/]+\.json/] },
  { name: '全挂（CDN+API+静态）', block: [/cdn\.jsdelivr\.net/, /api\.frankfurter\.dev/, /\/data\/[^/]+\.json/] },
];

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fxdiag2-'));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: profile,
  args: ['--no-sandbox', '--disable-gpu'],
});

const report = [];
for (const sc of SCENARIOS) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (sc.block.some((re) => re.test(req.url()))) req.abort('failed').catch(() => {});
    else req.continue().catch(() => {});
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(9000);

  const st = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#pair-list .pair-card')];
    const rates = cards.map((c) => c.querySelector('.pair-card-rate')?.textContent.trim() || '');
    return {
      cardCount: cards.length,
      stuck: rates.filter((r) => r === '加载中...').length,
      empty: rates.filter((r) => r === '--' || r === '').length,
      ok: rates.filter((r) => r && r !== '加载中...' && r !== '--').length,
      sample: cards.slice(0, 4).map((c) => `${c.querySelector('.pair-card-title')?.textContent.replace(/\s+/g, ' ').trim()} = ${c.querySelector('.pair-card-rate')?.textContent.trim()}`),
      emptyStateShown: !!document.querySelector('#empty-state')?.classList.contains('show'),
      listHtml: (document.querySelector('#pair-list')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      detailRate: document.querySelector('#detail-rate-value')?.textContent.trim() || '',
      chart: !!document.querySelector('#fx-chart'),
      toast: document.querySelector('#toast')?.textContent.trim() || '',
      hasChartLib: typeof window.Chart !== 'undefined',
      hasXlsx: typeof window.XLSX !== 'undefined',
    };
  });
  report.push({ ...sc, ...st, errs: errs.slice(0, 5) });
  await page.screenshot({ path: path.join(SHOTS, `diag2-${SCENARIOS.indexOf(sc)}.png`) }).catch(() => {});
  await page.close();
}

for (const r of report) {
  console.log(`\n===== ${r.name} =====`);
  console.log(`卡片数 ${r.cardCount} | 有值 ${r.ok} | 卡在加载中 ${r.stuck} | 空/-- ${r.empty}`);
  console.log(`详情值: ${r.detailRate || '(空)'} | 图表canvas: ${r.chart} | Chart.js: ${r.hasChartLib} | XLSX: ${r.hasXlsx}`);
  console.log(`空状态显示: ${r.emptyStateShown} | 列表文字: ${r.listHtml}`);
  console.log(`toast: ${r.toast || '(无)'}`);
  r.sample.forEach((s) => console.log('   · ' + s));
  r.errs.forEach((e) => console.log('   ! ' + e));
}

await browser.close();
fs.rmSync(profile, { recursive: true, force: true });
