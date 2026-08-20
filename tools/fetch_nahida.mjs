// 查看并下载纳西妲 Live2D 模型
import fs from 'node:fs';
import path from 'node:path';

// 1) 看 model3.json 结构
const m3url = 'https://raw.githubusercontent.com/Alex-jam-lab/Genshin-Impact-AI/main/frontend/public/models/Nahida_1080/Nahida_1080.model3.json';
let m3text = null;
for (let a = 0; a < 5 && !m3text; a++) {
  try {
    const r = await fetch(m3url, { signal: AbortSignal.timeout(30000) });
    if (r.ok) m3text = await r.text();
    else { console.log('HTTP', r.status); await new Promise(r2 => setTimeout(r2, 1200)); }
  } catch (e) { await new Promise(r2 => setTimeout(r2, 1200)); }
}
if (!m3text) { console.log('model3.json 获取失败'); process.exit(1); }
const m3 = JSON.parse(m3text);
console.log('=== 纳西妲 model3.json ===');
console.log('Moc:', m3.FileReferences.Moc);
console.log('Textures:', JSON.stringify(m3.FileReferences.Textures));
console.log('Motions 组:', Object.keys(m3.FileReferences.Motions || {}));
if (m3.FileReferences.Motions) {
  for (const g of Object.keys(m3.FileReferences.Motions)) {
    console.log('  [' + g + ']', m3.FileReferences.Motions[g].map(m => m.File).join(', '));
  }
}
console.log('Physics:', m3.FileReferences.Physics);
console.log('Expressions:', JSON.stringify(m3.FileReferences.Expressions || null));
console.log('Groups:', JSON.stringify(m3.Groups));

// 2) 下载全部文件
const BASE = 'https://raw.githubusercontent.com/Alex-jam-lab/Genshin-Impact-AI/main/frontend/public/models/Nahida_1080/';
const files = ['Nahida_1080.moc3', 'Nahida_1080.model3.json'];
for (let i = 0; i <= 3; i++) files.push('Nahida_1080.1024/texture_0' + i + '.png');
// 动作/物理文件(若存在)
const extra = [];
if (m3.FileReferences.Physics) extra.push(m3.FileReferences.Physics);
if (m3.FileReferences.Motions) for (const g of Object.values(m3.FileReferences.Motions)) for (const m of g) extra.push(m.File);
if (m3.FileReferences.Expressions) for (const e of m3.FileReferences.Expressions) extra.push(e.File);
for (const f of extra) files.push(f);

let ok = 0, fail = 0;
for (const f of files) {
  const out = 'public/live2d/nahida/' + f.split('/').pop();
  if (f.includes('/')) {
    // 动作/贴图在子目录,保持相对路径
    const rel = f;
    const outFull = 'public/live2d/nahida/' + rel;
    fs.mkdirSync(path.dirname(outFull), { recursive: true });
    if (fs.existsSync(outFull)) { ok++; continue; }
  } else {
    fs.mkdirSync('public/live2d/nahida', { recursive: true });
  }
  let done = false;
  for (let a = 0; a < 5 && !done; a++) {
    try {
      const r = await fetch(BASE + encodeURIComponent(f).replace(/%2F/g, '/'), { signal: AbortSignal.timeout(30000) });
      if (!r.ok) { console.log('HTTP', r.status, f); break; }
      const buf = Buffer.from(await r.arrayBuffer());
      const dest = f.includes('/') ? ('public/live2d/nahida/' + f) : ('public/live2d/nahida/' + f);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      ok++;
      console.log('OK', (buf.length / 1024).toFixed(0) + 'KB', dest.replace('public/live2d/nahida/', ''));
      done = true;
    } catch (e) { await new Promise(r2 => setTimeout(r2, 1200)); }
  }
  if (!done) { fail++; console.log('FAIL', f); }
}
console.log('done: ok=' + ok + ' fail=' + fail);
