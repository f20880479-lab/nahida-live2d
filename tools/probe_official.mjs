// 探:官方新闻详情页 SSR 是否含图片 + 米游社 API
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const uniq = a => [...new Set(a)];

async function get(u, hdrs = {}) {
  const r = await fetch(u, { headers: { ...UA, ...hdrs }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
  return { status: r.status, text: await r.text(), url: r.url };
}

(async () => {
  // 1) 官方新闻详情页 SSR 测试(拿几个可能的须弥壁纸新闻 id)
  for (const id of ['107348', '24881', '24170', '24206']) {
    try {
      const { status, text, url } = await get(`https://genshin.hoyoverse.com/en/news/detail/${id}`);
      console.log('== news', id, '->', status, 'len', text.length, url.slice(0, 80));
      const imgs = uniq([...text.matchAll(/https:\/\/upload-static\.hoyoverse\.com\/hk4e\/[^"'\\\s]+\.(?:jpg|png|webp)/gi)].map(m => m[0]));
      console.log('   upload-static:', imgs.slice(0, 8).join('\n      '));
      const og = text.match(/property="og:image" content="([^"]+)"/);
      console.log('   og:image:', og ? og[1] : 'none');
    } catch (e) { console.log('ERR news', id, e.message); }
  }
  // 2) 米游社文章 API
  for (const u of [
    'https://bbs-api.miyoushe.com/post/wapi/getPostFull?post_id=41821593',
    'https://bbs-api.miyoushe.com/post/wapi/searchPosts?gids=2&keyword=' + encodeURIComponent('须弥 壁纸') + '&page_size=10&page_num=1',
  ]) {
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(15000) });
      const t = await r.text();
      console.log('== miyoushe', r.status, 'len', t.length, u.slice(0, 70));
      console.log('   ', t.slice(0, 200).replace(/\s+/g, ' '));
    } catch (e) { console.log('ERR miyoushe', e.message); }
  }
})();
