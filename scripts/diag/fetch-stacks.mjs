/**
 * _diag5.mjs — 抓「同一静态文件被拉第二次」的调用栈
 * 通过 evaluateOnNewDocument 包装 window.fetch，对 data/*.json 打印调用栈。
 * 用法：node _diag5.mjs [URL]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:8892/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fxdiag5-'));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: profile,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.text()));

await page.evaluateOnNewDocument(() => {
  const orig = window.fetch;
  let n = 0;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (/(^|\/)data\/[^/]+\.json/.test(url)) {
      const seq = ++n;
      const stack = (new Error().stack || '').split('\n').slice(1, 6).join('\n      ');
      console.log(`[FXFETCH #${seq}] ${url}\n      ${stack}`);
    }
    return orig.apply(this, arguments);
  };
});

await page.setViewport({ width: 1280, height: 900 });
await page.goto(URL_, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(12000);

const fx = logs.filter((l) => l.startsWith('[FXFETCH'));
const other = logs.filter((l) => !l.startsWith('[FXFETCH') && !/Failed to load resource/.test(l));
console.log(`data/*.json 实际发起 ${fx.length} 次请求\n`);
fx.forEach((l) => console.log(l + '\n'));
if (other.length) { console.log('--- 其他控制台输出 ---'); other.slice(0, 10).forEach((l) => console.log('  ' + l)); }

await browser.close();
fs.rmSync(profile, { recursive: true, force: true });
