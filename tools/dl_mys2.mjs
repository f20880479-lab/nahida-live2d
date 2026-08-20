// 只收集观景点 4K 壁纸帖(拍照模式纯净图)的图片,下载预览
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const OUT = fileURLToPath(new URL('./tmp_mys2/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const TARGET = new Set(['74598410', '74598434', '75114684', '68840425', '68840502', '57323116']);

async function search(kw, n = 10) {
  const u = 'https://bbs-api.miyoushe.com/post/wapi/searchPosts?gids=2&keyword=' + encodeURIComponent(kw) + `&page_size=${n}&page_num=1`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  return (j.data?.posts || []).map(p => p.post).filter(Boolean);
}

(async () => {
  const perPost = new Map();
  for (const kw of ['须弥 地理志', '须弥 观景点', '须弥 4K', '须弥 壁纸']) {
    try {
      const posts = await search(kw, 10);
      for (const p of posts) {
        if (!TARGET.has(String(p.post_id))) continue;
        if (!perPost.has(p.post_id)) perPost.set(p.post_id, { subject: p.subject, images: [] });
        perPost.get(p.post_id).images.push(...(p.images || []));
      }
    } catch (e) { console.log('ERR', kw, e.message); }
  }
  for (const [pid, info] of perPost) {
    info.images = [...new Set(info.images)];
    console.log(`[${pid}] ${info.subject.slice(0, 36)} -> ${info.images.length} imgs`);
  }
  // 下载预览
  let ok = 0;
  for (const [pid, info] of perPost) {
    for (const u of info.images) {
      const m = u.match(/([a-f0-9]{32})_(\d+)\.(png|jpg|jpeg)/i);
      if (!m) continue;
      const name = `${m[2]}.${m[3]}`;
      const file = `${OUT}${name}`;
      if (existsSync(file)) { ok++; continue; }
      try {
        const r = await fetch(u + '?x-oss-process=image/resize,w_960', { headers: UA, signal: AbortSignal.timeout(30000) });
        if (!r.ok) { console.log('SKIP', name, r.status); continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        writeFileSync(file, buf);
        ok++;
      } catch (e) { console.log('FAIL', name, e.message); }
    }
  }
  console.log('DONE previews:', ok);
})();
