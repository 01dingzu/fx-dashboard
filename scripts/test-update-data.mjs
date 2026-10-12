/**
 * test-update-data.mjs — scripts/update-data.mjs 的回归测试（零依赖，不联网）
 *
 * 重点锁死 2026-10 的事故：Yahoo 对 A 股指数（000300.SS）间歇性只返回 1 个点，
 * 旧脚本不合并、不设闸，直接把 data/index-csi300.json 从 443 条覆盖成 1 条，
 * 看板上该标的曲线空白，并且连续三周多没人发现。
 *
 * 这里直接 import 生产实现来测（不自己复刻一份逻辑，否则主代码改了测试照样绿）。
 *
 * 运行: node scripts/test-update-data.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fxdata-test-'));
process.env.FX_DATA_DIR = TMP;   // 必须早于 import：DATA_DIR 在模块加载时求值

const { writeSeriesGuarded, mergeByDate, normalizeSeries, fetchEastmoneyDaily } =
  await import('./update-data.mjs');

let passed = 0, failed = 0;
function t(name, ok, extra = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}

const DAY = 86400000;
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/**
 * 生成 n 条连续日线。endAgo = 最后一条距今天几天（0=今天）。
 * 注意要显式指定结束日：新旧序列若都到今天，日期集合完全重叠，
 * 合并结果条数就等于其中一条的条数，测不出「新的一天有没有加进去」。
 */
function series(n, valueBase = 100, endAgo = 0) {
  const last = new Date(new Date().getTime() - endAgo * DAY);
  const out = [];
  // value 随日期递增：最老 = valueBase，最新 = valueBase + n - 1
  for (let i = 0; i < n; i++) out.push({ date: fmt(new Date(last.getTime() - (n - 1 - i) * DAY)), value: valueBase + i });
  return out;
}
const T0 = fmt(new Date());
const write = (file, arr) => fs.writeFileSync(path.join(TMP, file), JSON.stringify(arr));
const read = (file) => JSON.parse(fs.readFileSync(path.join(TMP, file), 'utf8'));

console.log('— mergeByDate —');
{
  const m = mergeByDate(
    [{ date: '2026-01-01', v: 1 }, { date: '2026-01-02', v: 2 }],
    [{ date: '2026-01-02', v: 9 }, { date: '2026-01-03', v: 3 }],
  );
  t('同日取新值', m.length === 3 && m[1].v === 9, JSON.stringify(m));
  t('按日期升序', m.map(x => x.date).join() === '2026-01-01,2026-01-02,2026-01-03');
  const multi = mergeByDate([{ date: '2026-01-01', USD: 7, EUR: 8 }], [{ date: '2026-01-02', USD: 9 }]);
  t('多字段条目不丢字段', multi[0].EUR === 8 && multi[1].USD === 9, JSON.stringify(multi));
}

console.log('— 缩水保护（本次事故的直接回归）—');
{
  const file = 'guard.json';
  const old = series(500, 100, 1);   // 全部历史到昨天为止
  write(file, old);

  // 数据源只回了 1 个点（Yahoo 对 000300.SS 的真实表现），且是新的一天
  writeSeriesGuarded(file, [{ date: T0, value: 999 }]);
  const after = read(file);
  t('源只回 1 条时历史不被覆盖', after.length === old.length + 1, `${old.length} → ${after.length}`);
  t('首条仍是两年前的老点位', after[0].date === old[0].date && after[0].value === old[0].value);
  t('新点位被追加进去', after[after.length - 1].date === T0 && after[after.length - 1].value === 999);

  // 退化的源还报了个老日期 → 连追加都不该发生
  writeSeriesGuarded(file, [{ date: old[0].date, value: 1 }]);
  const after2 = read(file);
  t('退化源不能改写历史点位', after2[0].value === old[0].value && after2.length === after.length,
    `len=${after2.length} first=${after2[0].value}`);
}

console.log('— 正常合并与边界 —');
{
  const file = 'ok.json';
  const old = series(300, 200, 1);   // 到昨天
  write(file, old);

  // 健康数据：300 条到今天就来了（与前 299 天重叠）
  writeSeriesGuarded(file, series(300, 300, 0));
  const after = read(file);
  t('健康数据正常合并（重叠日顺延）', after.length === 301, `${old.length} → ${after.length}`);
  // 旧的「昨天」= 200+298 = 498，新的「昨天」= 300+298 = 598：重叠日必须取新值
  t('重叠日采用新值', after[after.length - 2].value === 598, String(after[after.length - 2].value));
  t('最新一天取新值', after[after.length - 1].value === 599, String(after[after.length - 1].value));

  const sizeBefore = fs.statSync(path.join(TMP, file)).size;
  const ret = writeSeriesGuarded(file, []);
  t('空数据不写文件并返回 false', ret === false && fs.statSync(path.join(TMP, file)).size === sizeBefore);
}

console.log('— 窗口裁剪 —');
{
  const file = 'trim.json';
  write(file, series(900, 100, 1));
  writeSeriesGuarded(file, [{ date: T0, value: 1 }]);
  const after = read(file);
  t('超出 730 天的旧点位被裁掉', after.length <= 731 && after.length >= 725, String(after.length));
}

console.log('— normalizeSeries —');
{
  const n = normalizeSeries([
    { date: '2026-01-02', value: 2 },
    { date: '2026-01-01', value: 1 },
    { date: '2026-01-01', value: 5 },
    { date: '2026-01-03', value: null },
    { date: '', value: 7 },
  ]);
  t('去重 + 升序 + 过滤空值', n.length === 2 && n[0].value === 5 && n[1].date === '2026-01-02', JSON.stringify(n));
}

console.log('— 东财响应解析（替身，不联网）—');
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: { klines: ['2026-10-10,4000.5', '2026-10-12,4287.98'] } }),
  });
  try {
    const parsed = await fetchEastmoneyDaily('1.000300', 2);
    t('klines "日期,收盘" 被正确解析', parsed.length === 2 && parsed[1].date === '2026-10-12' && parsed[1].value === 4287.98,
      JSON.stringify(parsed));
  } finally {
    globalThis.fetch = realFetch;
  }

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: null }) });
  try {
    let threw = false;
    try { await fetchEastmoneyDaily('0.000000', 2); } catch { threw = true; }
    t('东财无数据时抛错（走兜底而不是写空文件）', threw);
  } finally {
    globalThis.fetch = realFetch;
  }
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
