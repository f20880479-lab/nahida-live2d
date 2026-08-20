// 发现更多 wallpapercave genshin 相关图库
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };

async function grab(u, all) {
  try {
    const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000), redirect: 'follow' });
    const t = await r.text();
    const m = [...t.matchAll(/\/wp\/(wp\d+)\.(jpg|png|webp)/g)];
    let n = 0;
    for (const mm of m) {
      const id = mm[1], ext = mm[2];
      if (!all.has(id)) { all.set(id, { ext }); n++; }
    }
    console.log('  ', r.status, u.split('/').pop(), '-> items', m.length, 'new', n, 'total', all.size);
  } catch (e) { console.log('  ERR', u, e.message); }
}

(async () => {
  const all = new Map();
  const urls = [
    'https://wallpapercave.com/genshin-impact-wallpapers',
    'https://wallpapercave.com/genshin-impact-4k-wallpapers',
    'https://wallpapercave.com/search?q=genshin',
    'https://wallpapercave.com/search?q=sumeru',
    'https://wallpapercave.com/search?q=nahida',
    'https://wallpapercave.com/search?q=anime+forest',
    'https://wallpapercave.com/search?q=fantasy+forest',
  ];
  for (const u of urls) await grab(u, all);
  const arr = [...all.entries()].map(([id, v]) => `https://wallpapercave.com/wp/${id}.${v.ext}`);
  writeFileSync('tools/wp_all_list.txt', arr.join('\n'));
  console.log('\nTOTAL:', arr.length, '-> tools/wp_all_list.txt');
})();
