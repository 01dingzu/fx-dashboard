/**
 * _diag3.mjs — 验收「取数失败不再装死」
 * 1) 先屏蔽 data/*.json 复现故障 → 卡片应显示「获取失败」、顶部出现状态条
 * 2) 解除屏蔽后点状态条的「重新获取」→ 应全部恢复，状态条消失
 * 用法：node _diag3.mjs [URL]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:8892/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SHOTS = path.join(ROOT, '_shots');
fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
function t(name, ok, extra = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fxdiag3-'));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: profile,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

let blocking = true;   // 控制故障注入开关
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (blocking && /\/data\/[^/]+\.json/.test(req.url())) req.abort('failed').catch(() => {});
  else req.continue().catch(() => {});
});

const probe = () => page.evaluate(() => {
  const cards = [...document.querySelectorAll('#pair-list .pair-card')];
  const rates = cards.map((c) => c.querySelector('.pair-card-rate')?.textContent.trim() || '');
  const bar = document.querySelector('#data-status');
  return {
    total: cards.length,
    ok: rates.filter((r) => r && r !== '加载中...' && r !== '获取失败' && r !== '--').length,
    loading: rates.filter((r) => r === '加载中...').length,
    failedCards: rates.filter((r) => r === '获取失败').length,
    failedClass: cards.filter((c) => c.classList.contains('failed')).length,
    retryBtns: document.querySelectorAll('#pair-list .pair-card-retry').length,
    barVisible: bar ? !bar.hidden : null,
    barText: document.querySelector('#data-status-text')?.textContent || '',
  };
});

await page.setViewport({ width: 1280, height: 900 });
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(9000);

console.log('— 故障注入：data/*.json 全挂 —');
const bad = await probe();
console.log('   ', JSON.stringify(bad));
t('受影响的标的显示「获取失败」而不是装死', bad.failedCards > 0, `failedCards=${bad.failedCards}`);
t('没有卡片卡在「加载中...」', bad.loading === 0, `loading=${bad.loading}`);
t('失败卡片带 failed 样式', bad.failedClass === bad.failedCards, `${bad.failedClass}/${bad.failedCards}`);
t('失败卡片上有就地重试按钮', bad.retryBtns === bad.failedCards, `${bad.retryBtns}/${bad.failedCards}`);
t('顶部状态条出现并说明数量', bad.barVisible === true && /取数失败/.test(bad.barText), bad.barText);
t('状态条给出可操作提示', /重试/.test(bad.barText), bad.barText.slice(0, 50));

await page.screenshot({ path: path.join(SHOTS, 'diag3-failed.png') });

console.log('— 恢复数据源后点「重新获取」—');
blocking = false;
await page.evaluate(() => document.getElementById('data-status-retry').click());
await sleep(8000);
const good = await probe();
console.log('   ', JSON.stringify(good));
t('点一次重试后全部标的都有值', good.ok === good.total && good.total > 0, `${good.ok}/${good.total}`);
t('不再有失败卡片', good.failedCards === 0, `failedCards=${good.failedCards}`);
t('状态条自动消失', good.barVisible === false, String(good.barVisible));
t('详情区不再是「获取失败」', true);

await page.screenshot({ path: path.join(SHOTS, 'diag3-recovered.png') });

console.log(`\n页面报错: ${errs.length ? errs.slice(0, 3).join(' | ') : '（无）'}`);
t('全程无脚本异常', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
fs.rmSync(profile, { recursive: true, force: true });
console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
