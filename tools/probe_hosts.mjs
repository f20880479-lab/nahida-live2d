// 探测更多图源主机可达性
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const hosts = [
  'https://webstatic.mihoyo.com',
  'https://uploadstatic.mihoyo.com',
  'https://genshin.hoyoverse.com',
  'https://www.hoyolab.com',
  'https://bbs.mihoyo.com',
  'https://pic.netbian.com',
  'https://www.win4000.com',
  'https://uhdpaper.com',
  'https://wallpapercave.com',
  'https://w.wallpapercave.com',
  'https://www.wallpaperflare.com',
  'https://wallpaperswide.com',
  'https://www.hdwallpapers.in',
  'https://www.peakpx.com',
  'https://wallpapers.com',
  'https://www.gamersky.com',
  'https://img.gamersky.com',
  'https://tse1.mm.bing.net',
  'https://cn.bing.com',
];
(async () => {
  for (const u of hosts) {
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(12000), redirect: 'follow' });
      console.log('OK', r.status, u, r.url !== u ? '-> ' + r.url : '');
    } catch (e) { console.log('ERR', u, '::', (e.cause && e.cause.code) || e.message); }
  }
})();
