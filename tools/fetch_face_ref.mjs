// 拉取参考项目源码 + face-api.js 模型清单
import fs from 'node:fs';

// 1) 参考项目主文件
const refs = [
  ['https://raw.githubusercontent.com/BaseMax/face-emotion-detection-web-live/main/script.js', 'tools/ref/camera/ref-script.js'],
  ['https://raw.githubusercontent.com/BaseMax/face-emotion-detection-web-live/main/index.html', 'tools/ref/camera/ref-index.html'],
];
fs.mkdirSync('tools/ref/camera', { recursive: true });
for (const [url, out] of refs) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) { console.log('HTTP', r.status, url); continue; }
    fs.writeFileSync(out, await r.text());
    console.log('OK', out);
  } catch (e) { console.log('fail', url, e.message); }
}

// 2) face-api.js 模型文件清单(weights 目录)
const r = await fetch('https://api.github.com/repos/justadudewhohacks/face-api.js/git/trees/master?recursive=1', { headers: { 'User-Agent': 'research' } });
const j = await r.json();
if (j.tree) {
  const weights = j.tree.map(t => t.path).filter(p => p.startsWith('weights/') && /tiny_face_detector|face_landmark_68|face_expression/.test(p));
  console.log('需要的模型文件:');
  weights.forEach(w => {
    const t = j.tree.find(x => x.path === w);
    console.log(' ', w, t ? (t.size / 1024).toFixed(0) + 'KB' : '');
  });
} else console.log('tree err:', j.message);
