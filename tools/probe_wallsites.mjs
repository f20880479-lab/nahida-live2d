// 多图站探查:wallpapercave / wallpapers.com / pixiewall / livewallpapers4free
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const uniq = a => [...new Set(a)];

async function get(u) {
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000), redirect: 'follow' });
  return { status: r.status, text: await r.text(), url: r.url };
}

(async () => {
  // 1) wallpapercave
  for (const u of [
    'https://wallpapercave.com/search?q=genshin+sumeru',
    'https://wallpapercave.com/genshin-impact-wallpapers',
    'https://wallpapercave.com/search?q=anime+forest',
  ]) {
    try {
      const { status, text, url } = await get(u);
      console.log('== WPC', status, url, 'len', text.length);
      const imgs = uniq([...text.matchAll(/https:\/\/wallpapercave\.com\/wp\/wp\d+\.(?:jpg|png|jpeg)/g)].map(m => m[0]));
      console.log('   imgs:', imgs.slice(0, 8).join('\n      '));
      const pages = uniq([...text.matchAll(/href="\/([^"\/]+\.html)"/g)].map(m => m[1])).slice(0, 8);
      console.log('   pages:', pages.join(', '));
    } catch (e) { console.log('ERR WPC', u, e.message); }
  }
  // 2) wallpapers.com
  for (const u of [
    'https://wallpapers.com/search?q=genshin+sumeru',
    'https://wallpapers.com/search?q=anime+forest',
  ]) {
    try {
      const { status, text, url } = await get(u);
      console.log('== WP.COM', status, url, 'len', text.length);
      const imgs = uniq([...text.matchAll(/https:\/\/images\.wallpapers\.com\/[^\s"'\\]+\.(?:jpg|png|jpeg|webp)/gi)].map(m => m[0]));
      console.log('   imgs:', imgs.slice(0, 8).join('\n      '));
    } catch (e) { console.log('ERR WP.COM', u, e.message); }
  }
  // 3) pixiewall Nahida 页面
  try {
    const { status, text } = await get('https://www.pixiewall.com/wallpaper/nahida-genshin-impact-forest-sumeru-5k-16369');
    console.log('== PIXIEWALL', status, 'len', text.length);
    const imgs = uniq([...text.matchAll(/https?:\/\/[^"'\\\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\\s]*)?/gi)].map(m => m[0]))
      .filter(x => !/\.(css|js|svg|ico)/.test(x));
    console.log('   imgs:', imgs.slice(0, 10).join('\n      '));
  } catch (e) { console.log('ERR pixiewall', e.message); }
  // 4) livewallpapers4free
  try {
    const { status, text } = await get('https://livewallpapers4free.com/sumeru-landscape-genshin-impact-4k-quality/');
    console.log('== LW4F', status, 'len', text.length);
    const imgs = uniq([...text.matchAll(/https?:\/\/[^"'\\\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\\s]*)?/gi)].map(m => m[0]))
      .filter(x => !/\.(css|js|svg|ico|woff)/.test(x));
    console.log('   imgs:', imgs.slice(0, 10).join('\n      '));
  } catch (e) { console.log('ERR lw4f', e.message); }
})();
