// 探查 hoyoverse 资源 CDN 与新闻 API
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };

(async () => {
  const probes = [
    ['CDN', 'https://upload-static.hoyoverse.com/hk4e/upload/fb/common.jpg'],
    ['CDN', 'https://fastcdn.hoyoverse.com'],
    ['CDN', 'https://act.hoyoverse.com'],
    ['NEWS', 'https://genshin.hoyoverse.com/content/ys_global/gamer/news/getNewsList?newsCategory=15&pageSize=10&pageNum=1&type=0&isNeedTotal=1'],
    ['NEWS', 'https://genshin.hoyoverse.com/content/ys_global/gamer/news/getNewsList?newsCategory=15&pageSize=30&pageNum=1&type=1'],
    ['NEWS', 'https://genshin.hoyoverse.com/content/ys_cn/gamer/news/getNewsList?newsCategory=15&pageSize=30&pageNum=1&type=0&isNeedTotal=1'],
  ];
  for (const [tag, u] of probes) {
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000), redirect: 'follow' });
      const t = await r.text();
      console.log('==', tag, r.status, 'len', t.length, u.slice(0, 90));
      if (tag === 'NEWS') {
        try {
          const j = JSON.parse(t);
          const list = j?.data?.list || [];
          console.log('   total:', j?.data?.total, 'got:', list.length);
          for (const it of list.slice(0, 10)) console.log('   -', (it.title || '').slice(0, 50), '| id', it.id, '| img', (it.banner || it.image || '').slice(0, 90));
        } catch (e) { console.log('   JSON fail:', t.slice(0, 300)); }
      }
    } catch (e) { console.log('ERR', tag, u.slice(0, 80), '::', (e.cause && e.cause.code) || e.message); }
  }
})();
