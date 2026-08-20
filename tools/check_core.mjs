// 检查 cubism4 构建的核心版本要求,并尝试下载官方最新核心
import fs from 'node:fs';

const l2d = fs.readFileSync('public/vendor/live2d/pixi-live2d-display-cubism4.min.js', 'utf8');
// 找版本检查逻辑
const checks = [...l2d.matchAll(/[Cc]ore.{0,30}?[Vv]ersion.{0,60}/g)].slice(0, 5);
console.log('=== cubism4 构建里的核心版本相关代码 ===');
checks.forEach(c => console.log(' ', c[0].slice(0, 100)));
const vchk = l2d.match(/3\.\d\.\d|4\.\d\.\d|version\s*[<>=]/gi);
console.log('版本数字/比较:', vchk ? vchk.slice(0, 8).join(', ') : '无');

// 尝试下载官方 Cubism4 核心(多源)
const sources = [
  'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
  'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display@master/test/integration/live2dcubismcore.min.js',
];
for (const u of sources) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) { console.log('HTTP', r.status, u.split('/')[2]); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    const ver = buf.toString('utf8', 0, Math.min(buf.length, 400)).match(/Version ([0-9.]+)/);
    console.log('来源', u.split('/')[2], '→', buf.length, 'bytes, 版本标记:', ver ? ver[1] : '?');
    if (buf.length > 100000) {
      fs.writeFileSync('public/vendor/live2d/live2dcubismcore.min.js', buf);
      console.log('已替换核心文件!');
      break;
    }
  } catch (e) { console.log('fail', u.split('/')[2], e.cause?.code || e.message); }
}
