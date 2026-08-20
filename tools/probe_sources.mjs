// 探查官方原神站的新闻/壁纸结构与网彼岸搜索
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const uniq = a => [...new Set(a)];

async function get(u) {
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000), redirect: 'follow' });
  return { status: r.status, text: await r.text(), url: r.url };
}

(async () => {
  // 1) 官方新闻列表
  for (const u of ['https://genshin.hoyoverse.com/en/news', 'https://genshin.hoyoverse.com/zh-cn/news']) {
    try {
      const { status, text } = await get(u);
      console.log('==', u, '->', status, 'len', text.length);
      const ids = uniq([...text.matchAll(/news\/detail\/(\d+)/g)].map(m => m[1])).slice(0, 10);
      console.log('   news ids:', ids.join(', '));
      const imgs = uniq([...text.matchAll(/https:\/\/[^"'\\]+\.(?:png|jpg|jpeg|webp)/gi)].map(m => m[0])).slice(0, 8);
      console.log('   imgs:', imgs.join('  '));
    } catch (e) { console.log('ERR', u, e.message); }
  }
  // 2) 网彼岸搜索
  for (const u of [
    'https://pic.netbian.com/sousuo/%E5%8E%9F%E7%A5%9E.html',
    'https://pic.netbian.com/sousuo/%E9%A1%BB%E5%BC%A5.html',
    'https://pic.netbian.com/e/search/index.php',
  ]) {
    try {
      const { status, text } = await get(u);
      console.log('==', u, '->', status, 'len', text.length);
      const imgs = uniq([...text.matchAll(/https?:\/\/[^"'\\]+\.(?:jpg|jpeg|png)(?!_small)/gi)].map(m => m[0])).slice(0, 8);
      console.log('   imgs:', imgs.join('  '));
    } catch (e) { console.log('ERR', u, e.message); }
  }
})();
