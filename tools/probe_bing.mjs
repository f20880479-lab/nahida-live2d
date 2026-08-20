// Bing 图片搜索抓取:提取 murl(原图直链),按主机过滤
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const uniq = a => [...new Set(a)];

async function bing(q) {
  const u = `https://cn.bing.com/images/search?q=${encodeURIComponent(q)}&qft=+filterui:imagesize-wallpaper&form=IRFLTR&first=1&count=50`;
  const r = await fetch(u, { headers: { ...UA, 'Accept-Language': 'zh-CN,zh;q=0.9' }, signal: AbortSignal.timeout(25000), redirect: 'follow' });
  const t = await r.text();
  const murls = uniq([...t.matchAll(/"murl":"([^"]+)"/g)].map(m => m[1]))
    .map(s => s.replace(/\\u002f/gi, '/').replace(/\\\//g, '/'))
    .filter(s => /^https?:/i.test(s));
  return murls;
}

(async () => {
  for (const q of [
    '原神 须弥 雨林 官方 壁纸',
    '原神 须弥 场景 壁纸 4K',
    'genshin sumeru rainforest official wallpaper',
    'genshin sumeru city wallpaper 4K',
    '原神 雨林 高清壁纸',
  ]) {
    try {
      const m = await bing(q);
      console.log('==', q, '->', m.length, 'murls');
      const hoyo = m.filter(x => /mihoyo|hoyoverse/i.test(x));
      console.log('   hoyo-host:', hoyo.slice(0, 6).join('\n      '));
      const others = m.filter(x => !/mihoyo|hoyoverse/i.test(x));
      console.log('   others:', others.slice(0, 8).join('\n      '));
    } catch (e) { console.log('ERR', q, e.message); }
  }
})();
