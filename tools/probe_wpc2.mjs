// 查看 wallpapercave 图库页的图片 URL 结构
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };

(async () => {
  const r = await fetch('https://wallpapercave.com/genshin-impact-wallpapers', { headers: UA, signal: AbortSignal.timeout(25000) });
  const t = await r.text();
  // 所有含 wp 的 URL 片段
  const frags = [...new Set([...t.matchAll(/[^"'\s\\]*wp[^"'\s\\]*/g)].map(m => m[0]))].filter(x => /wp\d/i.test(x));
  console.log('wp-related fragments:', frags.slice(0, 40).join('\n'));
  console.log('\n--- data-src / srcset / lazy patterns ---');
  const patterns = [...new Set([...t.matchAll(/(?:data-src|data-lazy-src|src|data-original|data-srcset)="([^"]+)"/g)].map(m => m[1]))];
  console.log(patterns.slice(0, 30).join('\n'));
})();
