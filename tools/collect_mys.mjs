// 收集米游社须弥壁纸帖的全部图片直链
import { writeFileSync } from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const uniq = a => [...new Set(a)];

async function search(kw, n = 10) {
  const u = 'https://bbs-api.miyoushe.com/post/wapi/searchPosts?gids=2&keyword=' + encodeURIComponent(kw) + `&page_size=${n}&page_num=1`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  return (j.data?.posts || []).map(p => p.post).filter(Boolean);
}

async function main() {
  const all = new Map(); // url -> {post, kw}
  const kws = ['须弥 地理志', '须弥壁纸', '原神 官方壁纸', '须弥 观景点', 'Sumeru wallpaper', '原神 4K 壁纸 场景'];
  for (const kw of kws) {
    try {
      const posts = await search(kw, 10);
      for (const p of posts) {
        const imgs = (p.images || []).filter(x => /^https?:/.test(x));
        if (imgs.length) console.log(`  [${p.post_id}] ${(p.subject || '').slice(0, 40)} -> ${imgs.length} imgs`);
        for (const x of imgs) if (!all.has(x)) all.set(x, { post: p.post_id, kw });
      }
    } catch (e) { console.log('ERR', kw, e.message); }
  }
  // 固定取几个已知好帖(直接按 post 拉)
  for (const pid of ['74598410', '74598434', '61417529', '61452165', '77268932', '76873211']) {
    const u = `https://bbs-api.miyoushe.com/post/wapi/getPostFull?post_id=${pid}`;
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      const p = j.data?.post;
      if (p) {
        for (const x of (p.images || [])) if (!all.has(x)) all.set(x, { post: pid, kw: 'direct' });
        console.log(`  direct [${pid}] ${(p.subject || '').slice(0, 40)} -> ${(p.images || []).length} imgs`);
      }
    } catch (e) { console.log('ERR direct', pid, e.message); }
  }
  const urls = [...all.keys()];
  writeFileSync('tools/mys_bg_urls.txt', urls.join('\n'));
  console.log('\nTOTAL unique imgs:', urls.length);
  console.log('sample hosts:', uniq(urls.map(u => new URL(u).host)).join(', '));
}

main();
