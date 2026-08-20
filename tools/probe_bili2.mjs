// bilibili 动态详情 API:提取官方壁纸合集图片
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36', 'Referer': 'https://www.bilibili.com/' };
const uniq = a => [...new Set(a)];

async function tryApi(url) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { console.log('   non-json', r.status, t.slice(0, 150)); return; }
    const items = [];
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (typeof o === 'string') { if (/^https?:\/\/(i0|i1|i2)\.hdslb\.com\/bfs\//.test(o)) items.push(o); return; }
      if (Array.isArray(o)) { o.forEach(walk); return; }
      Object.values(o).forEach(walk);
    };
    walk(j);
    console.log('==', url.slice(0, 80), '-> code', j.code, 'imgs', items.length);
    for (const x of uniq(items).slice(0, 12)) console.log('   ', x);
    return uniq(items);
  } catch (e) { console.log('ERR', url.slice(0, 60), e.message); }
}

(async () => {
  const ids = ['733966712280449026', '644455109789483013', 'cv20128070'];
  for (const id of ids) {
    await tryApi(`https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?id=${id}`);
    await tryApi(`https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/get_dynamic_detail?dynamic_id=${id}`);
  }
  // 文章 API
  try {
    const r = await fetch('https://api.bilibili.com/x/article/view?id=20128070', { headers: UA, signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    const imgs = [];
    if (j?.data?.content) {
      const re = /https:\/\/i0\.hdslb\.com\/bfs\/article\/[^"'\\\s]+/g;
      let m; while ((m = re.exec(j.data.content))) imgs.push(m[0]);
    }
    console.log('== article cv20128070 -> imgs', imgs.length);
    for (const x of imgs.slice(0, 15)) console.log('   ', x);
  } catch (e) { console.log('ERR article', e.message); }
})();
