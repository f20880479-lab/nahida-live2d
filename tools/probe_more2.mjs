// 再探: fandom wiki / reddit / bing 实际响应
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };

(async () => {
  const probes = [
    ['fandom', 'https://genshin-impact.fandom.com/wiki/Sumeru'],
    ['fandom-img', 'https://static.wikia.nocookie.net/gensin-impact/images/'],
    ['reddit', 'https://old.reddit.com/r/Genshin_Impact/search?q=sumeru+wallpaper&restrict_sr=1&sort=top&t=all'],
    ['reddit-img', 'https://i.redd.it/'],
    ['bing-img', 'https://www.bing.com/images/search?q=' + encodeURIComponent('genshin sumeru rainforest wallpaper')],
  ];
  for (const [tag, u] of probes) {
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000), redirect: 'follow' });
      const t = await r.text();
      console.log('==', tag, r.status, 'len', t.length, 'url', r.url.slice(0, 90));
      if (tag === 'bing-img') console.log('   bing snippet:', t.slice(0, 400).replace(/\s+/g, ' '));
      if (tag === 'fandom') {
        const imgs = [...new Set([...t.matchAll(/https:\/\/static\.wikia\.nocookie\.net\/[^"'\\\s]+\.(?:jpg|png|webp)/gi)].map(m => m[0]))];
        console.log('   wiki imgs:', imgs.slice(0, 6).join('\n    '));
      }
      if (tag === 'reddit') {
        const links = [...new Set([...t.matchAll(/href="(https:\/\/i\.redd\.it\/[^"]+)"/g)].map(m => m[1]))].slice(0, 10);
        console.log('   reddit imgs:', links.join('\n    '));
      }
    } catch (e) { console.log('ERR', tag, (e.cause && e.cause.code) || e.message); }
  }
})();
