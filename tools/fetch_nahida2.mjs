// 用 jsDelivr 重试纳西妲模型下载(比 raw.githubusercontent 稳)
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://cdn.jsdelivr.net/gh/Alex-jam-lab/Genshin-Impact-AI@main/frontend/public/models/Nahida_1080/';
const files = ['Nahida_1080.moc3', 'Nahida_1080.1024/texture_00.png', 'Nahida_1080.1024/texture_01.png', 'Nahida_1080.1024/texture_02.png'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, fail = 0;
for (const f of files) {
  const dest = 'public/live2d/nahida/' + f;
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) { ok++; console.log('已有', f); continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let done = false;
  for (let a = 0; a < 6 && !done; a++) {
    try {
      const r = await fetch(BASE + encodeURIComponent(f).replace(/%2F/g, '/'), { signal: AbortSignal.timeout(30000) });
      if (!r.ok) { console.log('HTTP', r.status, f); break; }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(dest, buf);
      ok++;
      console.log('OK', (buf.length / 1024).toFixed(0) + 'KB', f);
      done = true;
    } catch (e) { await sleep(1200); }
  }
  if (!done) { fail++; console.log('FAIL', f); }
}
console.log('done: ok=' + ok + ' fail=' + fail);
