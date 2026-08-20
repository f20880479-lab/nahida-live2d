// 拉取 anime-desktop-pet 的 CDN 配置,看它们用哪个 pixi-live2d-display 构建
import fs from 'node:fs';

const url = 'https://cdn.jsdelivr.net/gh/SherlockYzz/anime-desktop-pet@main/%E6%A0%B8%E5%BF%83%E9%80%9A%E7%94%A8%E4%BB%A3%E7%A0%81/%E6%A0%B8%E5%BF%83/CDN%E9%85%8D%E7%BD%AE.js';
try {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) { console.log('HTTP', r.status); process.exit(1); }
  const txt = await r.text();
  fs.writeFileSync('tools/ref/l2d/CDN配置.js', txt);
  console.log(txt.slice(0, 3000));
} catch (e) { console.error('ERR', e.message); process.exit(1); }
