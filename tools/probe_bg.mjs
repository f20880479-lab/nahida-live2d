// 背景图探测脚本:在可直连的图站里找"须弥雨林/森林/精致二次元风景"
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };

const uniq = (a) => [...new Set(a)];

async function main() {
  // 1) Alpha Coders 搜索页
  for (const q of ['sumeru', 'genshin+impact', 'genshin+nahida', 'genshin+scenery']) {
    const u = `https://wall.alphacoders.com/search.php?search=${q}`;
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000) });
      const t = await r.text();
      console.log('== AC:', q, '->', r.status, 'len', t.length);
      const pages = uniq([...t.matchAll(/href="(\d+)\.html"/g)].map(m => m[1])).slice(0, 8);
      console.log('   pages:', pages.join(', '));
      const imgs = uniq([...t.matchAll(/https:\/\/images\.alphacoders\.com\/[^\s"'<>]+\.(?:jpg|png|jpeg|webp)/gi)].map(m => m[0]));
      console.log('   imgs:', imgs.slice(0, 6).join('  '));
    } catch (e) { console.log('ERR AC', q, e.message); }
  }
}

main();
