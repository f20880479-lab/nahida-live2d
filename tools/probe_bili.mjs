// 从 bilibili opus 页面提取官方壁纸图(i0.hdslb.com)
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const uniq = a => [...new Set(a)];

(async () => {
  // 先测 bilibili 图片 CDN 可达性
  for (const h of ['https://i0.hdslb.com', 'https://i1.hdslb.com', 'https://m.bilibili.com', 'https://www.bilibili.com']) {
    try {
      const r = await fetch(h, { headers: UA, signal: AbortSignal.timeout(12000), redirect: 'follow' });
      console.log('OK', r.status, h, r.url !== h ? '->' + r.url : '');
    } catch (e) { console.log('ERR', h, (e.cause && e.cause.code) || e.message); }
  }
  // 官方壁纸合集 opus
  for (const id of ['733966712280449026', '644455109789483013']) {
    try {
      const r = await fetch(`https://m.bilibili.com/opus/${id}`, { headers: UA, signal: AbortSignal.timeout(20000), redirect: 'follow' });
      const t = await r.text();
      console.log('== opus', id, '->', r.status, 'len', t.length);
      const imgs = uniq([...t.matchAll(/https:\/\/i0\.hdslb\.com\/bfs\/[^"'\\\s]+\.(?:jpg|png|jpeg|webp)/gi)].map(m => m[0]));
      console.log('   imgs:', imgs.length);
      for (const x of imgs.slice(0, 15)) console.log('   ', x);
      // 可能还有 @ 尺寸变体
    } catch (e) { console.log('ERR opus', id, e.message); }
  }
})();
