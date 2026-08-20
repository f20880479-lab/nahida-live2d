// 打印 Bing 结果页中 murl 周边文本
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };

(async () => {
  const u = `https://cn.bing.com/images/search?q=${encodeURIComponent('原神 须弥 雨林 壁纸')}`;
  const r = await fetch(u, { headers: { ...UA, 'Accept-Language': 'zh-CN,zh;q=0.9' }, signal: AbortSignal.timeout(25000) });
  const t = await r.text();
  let idx = 0, n = 0;
  while ((idx = t.indexOf('murl', idx)) !== -1 && n < 6) {
    console.log('--- offset', idx, ':', t.slice(idx - 30, idx + 200).replace(/\s+/g, ' '));
    idx += 4; n++;
  }
})();
