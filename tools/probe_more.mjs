// 更多图源:AC 分类 / 原神官网首页 hero / LW4F 大图 / netbian 搜索结构 / gamersky
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const uniq = a => [...new Set(a)];

async function get(u, hdrs = {}) {
  const r = await fetch(u, { headers: { ...UA, ...hdrs }, signal: AbortSignal.timeout(25000), redirect: 'follow' });
  return { status: r.status, text: await r.text(), url: r.url };
}

(async () => {
  // 1) Alpha Coders 分类页结构
  try {
    const { status, text } = await get('https://wall.alphacoders.com/by_category.php');
    console.log('== AC categories', status, 'len', text.length);
    const cats = [...text.matchAll(/by_category\.php\?id=(\d+)[^>]*>([^<]{2,40})</g)].map(m => `${m[1]}=${m[2].trim()}`);
    console.log('  cats:', uniq(cats).slice(0, 30).join('  '));
    const subs = [...text.matchAll(/by_sub_category\.php\?id=(\d+)[^>]*>([^<]{2,40})</g)].map(m => `${m[1]}=${m[2].trim()}`);
    console.log('  subs:', uniq(subs).slice(0, 20).join('  '));
  } catch (e) { console.log('ERR AC cats', e.message); }

  // 2) 原神官网首页 hero 图
  for (const u of ['https://genshin.hoyoverse.com/en/home', 'https://genshin.hoyoverse.com/zh-cn/home']) {
    try {
      const { status, text } = await get(u);
      console.log('== hoyo home', status, 'len', text.length);
      const imgs = uniq([...text.matchAll(/https:\/\/upload-static\.hoyoverse\.com\/hk4e\/[^"'\\\s]+\.(?:jpg|png|webp)/gi)].map(m => m[0]));
      console.log('  upload-static imgs:', imgs.slice(0, 10).join('\n    '));
      const imgs2 = uniq([...text.matchAll(/https:\/\/[^"'\\\s]+\.(?:jpg|png|webp)(?:\?[^"'\\\s]*)?/gi)].map(m => m[0])).filter(x => !/\.(js|css)/.test(x));
      console.log('  other imgs:', imgs2.slice(0, 8).join('\n    '));
    } catch (e) { console.log('ERR hoyo home', e.message); }
  }

  // 3) LW4F Sumeru 页所有图片 + 原图尺寸变体
  try {
    const { status, text } = await get('https://livewallpapers4free.com/sumeru-landscape-genshin-impact-4k-quality/');
    console.log('== LW4F page', status, 'len', text.length);
    const imgs = uniq([...text.matchAll(/https:\/\/livewallpapers4free\.com\/wp-content\/uploads\/[^"'\\\s]+\.(?:jpg|png|webp)/gi)].map(m => m[0]));
    console.log('  imgs:', imgs.slice(0, 20).join('\n    '));
  } catch (e) { console.log('ERR LW4F', e.message); }

  // 4) netbian 搜索表单
  try {
    const { status, text } = await get('https://pic.netbian.com/');
    console.log('== netbian home', status, 'len', text.length);
    const forms = [...text.matchAll(/<form[^>]*action="([^"]+)"[^>]*>/g)].map(m => m[1]);
    console.log('  forms:', forms.join(' | '));
    const inputs = [...text.matchAll(/<input[^>]*name="([^"]+)"[^>]*>/g)].map(m => m[1]);
    console.log('  inputs:', uniq(inputs).join(', '));
    // 首页样例图
    const imgs = uniq([...text.matchAll(/https?:\/\/pic\.netbian\.com\/[^"'\\\s]+\.(?:jpg|png|jpeg)/gi)].map(m => m[0])).slice(0, 5);
    console.log('  imgs:', imgs.join('\n    '));
  } catch (e) { console.log('ERR netbian', e.message); }

  // 5) gamersky 带 referer
  try {
    const { status, text } = await get('https://so.gamersky.com/all?q=' + encodeURIComponent('原神 须弥 壁纸'));
    console.log('== gamersky search', status, 'len', text.length);
    const links = uniq([...text.matchAll(/href="(https?:\/\/www\.gamersky\.com\/[^"]+\.html)"/g)].map(m => m[1])).slice(0, 8);
    console.log('  links:', links.join('\n    '));
  } catch (e) { console.log('ERR gamersky', e.message); }
})();
