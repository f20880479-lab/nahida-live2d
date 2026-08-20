// 重建 id->URL 映射并下载 3 个候选的 4K 原图
import { writeFileSync, existsSync } from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };

async function search(kw, n = 10) {
  const u = 'https://bbs-api.miyoushe.com/post/wapi/searchPosts?gids=2&keyword=' + encodeURIComponent(kw) + `&page_size=${n}&page_num=1`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  return (j.data?.posts || []).map(p => p.post).filter(Boolean);
}

const WANT = new Set(['5352232159592083826', '72405328198162581', '5069318023043419754']);

(async () => {
  const id2url = new Map();
  for (const kw of ['须弥 地理志', '须弥 观景点', '须弥 4K']) {
    try {
      const posts = await search(kw, 10);
      for (const p of posts) {
        for (const x of (p.images || [])) {
          const m = x.match(/([a-f0-9]{32})_(\d+)\.(png|jpg|jpeg)/i);
          if (m && WANT.has(m[2])) id2url.set(m[2], x);
        }
      }
    } catch (e) { console.log('ERR', kw, e.message); }
  }
  console.log('found urls:', id2url.size);
  for (const [id, u] of id2url) {
    const m = u.match(/\.(png|jpg|jpeg)$/i);
    const file = `tools/tmp_mys2/full_${id}.${m[1]}`;
    if (existsSync(file)) { console.log('exists', file); continue; }
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(120000) });
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(file, buf);
      console.log('OK', id, (buf.length / 1048576).toFixed(1) + 'MB', file);
    } catch (e) { console.log('FAIL', id, e.message); }
  }
})();
