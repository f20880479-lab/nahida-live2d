// 下载米游社须弥观景点/官方壁纸帖的预览图(w_960)用于筛选
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const OUT = fileURLToPath(new URL('./tmp_mys/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const uniq = a => [...new Set(a)];

async function search(kw, n = 10) {
  const u = 'https://bbs-api.miyoushe.com/post/wapi/searchPosts?gids=2&keyword=' + encodeURIComponent(kw) + `&page_size=${n}&page_num=1`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  return (j.data?.posts || []).map(p => p.post).filter(Boolean);
}

(async () => {
  const want = new Map(); // url -> {post, kw}
  // 1) 须弥雨林相关地理志/观景点帖
  for (const kw of ['须弥 地理志 上', '须弥 观景点', '须弥 雨林', '须弥壁纸']) {
    try {
      const posts = await search(kw, 10);
      for (const p of posts) {
        const subj = p.subject || '';
        if (!/须弥|雨林|Sumeru/i.test(subj)) continue;
        for (const x of (p.images || [])) if (!want.has(x)) want.set(x, { post: p.post_id, kw });
      }
    } catch (e) { console.log('ERR', kw, e.message); }
  }
  // 2) 官方壁纸帖
  for (const kw of ['原神 官方壁纸', '官方壁纸 多尺寸', '电脑官方壁纸']) {
    try {
      const posts = await search(kw, 10);
      for (const p of posts) {
        const subj = p.subject || '';
        if (!/壁纸|官方/i.test(subj)) continue;
        for (const x of (p.images || [])) if (!want.has(x)) want.set(x, { post: p.post_id, kw });
      }
    } catch (e) { console.log('ERR', kw, e.message); }
  }
  const urls = [...want.keys()];
  console.log('total imgs to preview:', urls.length);
  let ok = 0, fail = 0;
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    const m = u.match(/([a-f0-9]{32})_(\d+)\.(png|jpg|jpeg)/i);
    const name = m ? `${m[2]}.${m[3]}` : `img_${i}.png`;
    const file = `${OUT}${name}`;
    try {
      const r = await fetch(u + '?x-oss-process=image/resize,w_960', { headers: UA, signal: AbortSignal.timeout(30000) });
      if (!r.ok) { console.log('SKIP', i, r.status, u.slice(-50)); fail++; continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(file, buf);
      ok++;
      if (i % 20 === 0) console.log('  ...', i, 'ok', ok);
    } catch (e) { console.log('FAIL', i, u.slice(-50), e.message); fail++; }
  }
  console.log('DONE ok:', ok, 'fail:', fail);
})();
