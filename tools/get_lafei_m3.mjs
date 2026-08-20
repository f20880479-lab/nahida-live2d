// 单独获取 lafei.model3.json(jsDelivr 403,改用 GitHub contents API)
import fs from 'node:fs';

const p = encodeURIComponent('live2d_3/model/Azue Lane(JP)/lafei/lafei.model3.json');
let got = null;
for (let a = 0; a < 5 && !got; a++) {
  try {
    const r = await fetch('https://api.github.com/repos/imuncle/live2d/contents/' + p, {
      headers: { 'User-Agent': 'research', 'Accept': 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) { console.log('HTTP', r.status); await new Promise(r2 => setTimeout(r2, 2000)); continue; }
    const j = await r.json();
    got = Buffer.from(j.content, 'base64');
    fs.writeFileSync('public/live2d/lafei/lafei.model3.json', got);
    console.log('model3.json 获取成功', got.length, 'bytes');
  } catch (e) { console.log('fail', e.message); await new Promise(r2 => setTimeout(r2, 2000)); }
}
if (!got) process.exit(1);

// 查看动作/参数结构
const m3 = JSON.parse(got.toString('utf8'));
console.log('Motions 组:', Object.keys(m3.FileReferences.Motions || {}));
console.log('Textures:', JSON.stringify(m3.FileReferences.Textures));
// 从动作文件里提取参数 ID
const dir = 'public/live2d/lafei/motions/';
const ids = new Set();
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.motion3.json')) continue;
  try {
    const m = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
    for (const c of (m.Curves || [])) ids.add(c.Target + ':' + (c.Id || ''));
  } catch (e) { console.log('parse err', f, e.message); }
}
const interesting = [...ids].filter(s => /MOUTH|BROW|CHEEK|SMILE|ANGRY|EYE_L|EYE_R/i.test(s));
console.log('表情相关参数:', interesting.join(', '));
