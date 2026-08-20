// 下载拉菲(lafei)模型全部文件 via jsDelivr
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://cdn.jsdelivr.net/gh/imuncle/live2d@master/live2d_3/model/Azue%20Lane(JP)/lafei/';
const files = ['lafei.moc3', 'lafei.model3.json', 'lafei.physics3.json'];
const motions = ['complete', 'home', 'idle', 'login', 'mail', 'main_1', 'main_2', 'main_3', 'mission', 'mission_complete', 'touch_body', 'touch_head', 'touch_special', 'wedding'];
for (const m of motions) files.push('motions/' + m + '.motion3.json');
for (let i = 0; i <= 5; i++) files.push('textures/texture_0' + i + '.png');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, fail = 0;
for (const f of files) {
  const out = 'public/live2d/lafei/' + f;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let done = false;
  for (let a = 0; a < 6 && !done; a++) {
    try {
      const r = await fetch(BASE + encodeURIComponent(f).replace(/%2F/g, '/'), { signal: AbortSignal.timeout(30000) });
      if (!r.ok) { console.log('HTTP', r.status, f); break; }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(out, buf);
      ok++;
      if (f.includes('moc3') || f.includes('model3') || f.includes('texture_00')) console.log('OK', (buf.length / 1024).toFixed(0) + 'KB', f);
      done = true;
    } catch (e) { await sleep(1200); }
  }
  if (!done) { fail++; console.log('FAIL', f); }
}
console.log('done: ok=' + ok + ' fail=' + fail);
