/**
 * data-stats.mjs — 统计 data/ 下各文件记录数
 * 用途：排查数据文件有没有被「源退化」写坏。
 * 历史事故：Yahoo 对 A 股指数偶发只返回 1 个点，无守卫的写入把 index-csi300.json
 * 从 443 条覆盖成 1 条 —— 卡片的当前值仍有数，但整条历史曲线没了。
 * 少于 SUSPECT 条即判可疑并以非 0 退出码结束，方便挂进 CI / 手工巡检。
 * 用法：node scripts/data-stats.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const dir = path.join(ROOT, 'data');
const SUSPECT = 50;

const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const p = path.join(dir, f);
  let n = '-', last = '-', size = fs.statSync(p).size;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (Array.isArray(j)) { n = j.length; last = j[j.length - 1]?.date || '-'; }
    else if (j && typeof j === 'object') {
      const arr = j.series || j.data || j.rates || null;
      if (Array.isArray(arr)) { n = arr.length; last = arr[arr.length - 1]?.date || '-'; }
      else { n = 'obj'; last = j.date || j.updated || j.timestamp || '-'; }
    }
  } catch { n = 'PARSE_ERR'; }
  rows.push({ f, n, last, size: (size / 1024).toFixed(1) + 'KB' });
}

const w = Math.max(...rows.map((r) => r.f.length));
let suspects = 0;
for (const r of rows) {
  const num = Number(r.n);
  const bad = Number.isFinite(num) && num < SUSPECT;
  if (bad) suspects++;
  console.log(`${bad ? '✗' : ' '} ${r.f.padEnd(w)}  ${String(r.n).padStart(6)}  ${String(r.last).padEnd(12)} ${r.size}`);
}
console.log(`\n共 ${rows.length} 个文件，可疑（<${SUSPECT} 条）${suspects} 个`);
process.exit(suspects ? 1 : 0);
