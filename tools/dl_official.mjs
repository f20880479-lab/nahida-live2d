// 官方壁纸帖/官方账号帖的图片字段
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const OUT = fileURLToPath(new URL('./tmp_official/', import.meta.url));
mkdirSync(OUT, { recursive: true });

async function search(kw, n = 12) {
  const u = 'https://bbs-api.miyoushe.com/post/wapi/searchPosts?gids=2&keyword=' + encodeURIComponent(kw) + `&page_size=${n}&page_num=1`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  return (j.data?.posts || []).map(p => p.post).filter(Boolean);
}

(async () => {
  const posts = [];
  for (const kw of ['原神 官方壁纸', '官方壁纸 分享 多尺寸', '电脑官方壁纸 版本', '官方 4K 壁纸']) {
    try {
      const ps = await search(kw, 12);
      for (const p of ps) {
        const subj = p.subject || '';
        const imgs = (p.images || []).filter(x => /^https?:/.test(x));
        if (imgs.length) {
          console.log(`[${p.post_id}] ${subj.slice(0, 44)} -> ${imgs.length} imgs`);
          posts.push({ post_id: p.post_id, subject: subj, images: imgs, kw });
        }
      }
    } catch (e) { console.log('ERR', kw, e.message); }
  }
  // 下载预览(w_960)
  let ok = 0, fail = 0;
  for (const p of posts) {
    for (const u of p.images) {
      const m = u.match(/([a-f0-9]{32})_(\d+)\.(png|jpg|jpeg)/i);
      if (!m) continue;
      const name = `${m[2]}.${m[3]}`;
      const file = `${OUT}${name}`;
      try {
        const r = await fetch(u + '?x-oss-process=image/resize,w_960', { headers: UA, signal: AbortSignal.timeout(30000) });
        if (!r.ok) { fail++; continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        writeFileSync(file, buf);
        ok++;
      } catch (e) { fail++; }
    }
  }
  console.log('DONE official previews ok:', ok, 'fail:', fail);
})();
