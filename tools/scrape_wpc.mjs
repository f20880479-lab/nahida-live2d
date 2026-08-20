// wallpapercave Genshin Impact 图库:提取全部 /wp/wpNNN. 原图链接
import { writeFileSync } from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };

(async () => {
  const all = new Map(); // id -> {urls:Set, ext}
  for (let page = 1; page <= 25; page++) {
    const u = page === 1 ? 'https://wallpapercave.com/genshin-impact-wallpapers' : `https://wallpapercave.com/genshin-impact-wallpapers?page=${page}`;
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000), redirect: 'follow' });
      const t = await r.text();
      const m = [...t.matchAll(/\/wp\/(wp\d+)\.(jpg|png|webp)/g)];
      let added = 0;
      for (const mm of m) {
        const id = mm[1], ext = mm[2];
        if (!all.has(id)) { all.set(id, { ext }); added++; }
      }
      console.log('page', page, '->', r.status, 'items:', m.length, 'new:', added, 'total:', all.size);
      if (m.length === 0 && page > 3) break;
    } catch (e) { console.log('ERR page', page, e.message); }
  }
  const arr = [...all.entries()].map(([id, v]) => `https://wallpapercave.com/wp/${id}.${v.ext}`);
  writeFileSync('tools/wp_genshin_list.txt', arr.join('\n'));
  console.log('\nTOTAL:', arr.length, '-> saved tools/wp_genshin_list.txt');
})();
