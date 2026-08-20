// 拉取参考项目源码并提取 Live2D 关键实现
import fs from 'node:fs';

fs.mkdirSync('tools/ref/l2d', { recursive: true });

const jobs = [
  {
    name: 'anime-desktop-pet-Live2D引擎.js',
    url: 'https://cdn.jsdelivr.net/gh/SherlockYzz/anime-desktop-pet@main/%E6%A0%B8%E5%BF%83%E9%80%9A%E7%94%A8%E4%BB%A3%E7%A0%81/%E6%A0%B8%E5%BF%83/Live2D%E5%BC%95%E6%93%8E.js',
  },
  {
    name: 'anime-desktop-pet-chat.js',
    url: 'https://cdn.jsdelivr.net/gh/SherlockYzz/anime-desktop-pet@main/%E6%A0%B8%E5%BF%83%E9%80%9A%E7%94%A8%E4%BB%A3%E7%A0%81/%E6%A0%B8%E5%BF%83/%E6%99%BA%E8%83%BD%E8%81%8A%E5%A4%A9.js',
  },
];

for (const j of jobs) {
  try {
    const r = await fetch(j.url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) { console.log('FAIL', r.status, j.name); continue; }
    const txt = await r.text();
    fs.writeFileSync('tools/ref/l2d/' + j.name, txt);
    console.log('saved', j.name, txt.length, 'bytes');
  } catch (e) { console.log('ERR', j.name, e.message); }
}
