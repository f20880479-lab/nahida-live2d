// 米游社搜索:须弥/雨林/场景壁纸帖,提取图片直链
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const uniq = a => [...new Set(a)];

async function search(kw) {
  const u = 'https://bbs-api.miyoushe.com/post/wapi/searchPosts?gids=2&keyword=' + encodeURIComponent(kw) + '&page_size=12&page_num=1';
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  if (j.retcode !== 0) { console.log('  retcode', j.retcode, j.message); return; }
  const posts = j.data?.posts || [];
  console.log(`== "${kw}" -> ${posts.length} posts`);
  for (const p of posts.slice(0, 12)) {
    const post = p.post || {};
    const content = post.content || '';
    const imgs = uniq([...content.matchAll(/https?:\/\/[^"'\\\s\])]+\.(?:jpg|jpeg|png|webp)/gi)].map(m => m[0]))
      .filter(x => !/\.(css|js|svg)/i.test(x));
    console.log(`  [${post.post_id}] ${(post.subject || '').slice(0, 44)} | imgs: ${imgs.length}`);
    imgs.slice(0, 4).forEach(x => console.log('      ', x.slice(0, 130)));
  }
}

(async () => {
  for (const kw of ['须弥 壁纸', '须弥 场景', '原神 雨林 壁纸', '须弥 官方 壁纸', 'Sumeru wallpaper']) {
    try { await search(kw); } catch (e) { console.log('ERR', kw, e.message); }
  }
})();
