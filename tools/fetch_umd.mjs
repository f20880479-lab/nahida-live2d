// 下载 pixi v7 + pixi-live2d-display UMD 构建(anime-desktop-pet 同款)
import fs from 'node:fs';

const files = [
  ['https://cdn.jsdelivr.net/npm/pixi.js@7.3.3/dist/pixi.min.js', 'public/vendor/live2d/pixi.min.js'],
  ['https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/index.min.js', 'public/vendor/live2d/pixi-live2d-display.min.js'],
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [url, out] of files) {
  let done = false;
  for (let a = 0; a < 5 && !done; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) { console.log('HTTP', r.status, url); break; }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(out, buf);
      console.log('OK', out, (buf.length / 1024).toFixed(0) + 'KB');
      done = true;
    } catch (e) { await sleep(1200); }
  }
  if (!done) console.log('FAIL', url);
}
// 验证 UMD 的浏览器分支引用(确认它期待 global.PIXI 的哪些子命名空间)
const umd = fs.readFileSync('public/vendor/live2d/pixi-live2d-display.min.js', 'utf8');
const m = umd.match(/globalThis[^)]{0,200}?PIXI[^)]{0,100}/);
console.log('UMD 全局分支:', m ? m[0].slice(0, 200) : '未找到');
