// 分析 Bing 图片结果页中的图片 URL 形态
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };

(async () => {
  const q = 'genshin sumeru rainforest wallpaper';
  const u = `https://cn.bing.com/images/search?q=${encodeURIComponent(q)}`;
  const r = await fetch(u, { headers: { ...UA, 'Accept-Language': 'zh-CN,zh;q=0.9' }, signal: AbortSignal.timeout(25000) });
  const t = await r.text();
  console.log('len', t.length);
  // 查找各种 URL 形态
  const patterns = {
    murl: /"murl":"([^"]+)"/g,
    imgurl: /imgurl:&quot;([^&]+)/g,
    mediaurl: /mediaurl=([^&"]+)/g,
    thurl: /"turl":"([^"]+)"/g,
    pageurl: /"purl":"([^"]+)"/g,
    murlEsc: /murl\\":\\"([^\\"]+)/g,
  };
  for (const [k, re] of Object.entries(patterns)) {
    const found = [...t.matchAll(re)].map(m => m[1]).slice(0, 5);
    console.log('---', k, found.length);
    found.forEach(x => console.log('   ', x.slice(0, 140)));
  }
  // 是否 JS 跳转?
  console.log('has murl string:', t.includes('murl'));
  console.log('has class mimg:', t.includes('mimg'));
})();
