// 下载 LW4F Sumeru 相关缩略帧 + 网彼岸搜索测试
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const OUT = fileURLToPath(new URL('./tmp_bg/lw4f/', import.meta.url));
mkdirSync(OUT, { recursive: true });

(async () => {
  const ids = ['lmwpr3cx8qq127aa', 'lo50yy0kjzoy0gb5', 'hcimb6nlxcyfn69r', 'tst0u1yt0boyyiha'];
  for (const id of ids) {
    const u = `https://livewallpapers4free.com/wp-content/uploads/2024/06/${id}.mp4_thumbnail.jpg`;
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (!r.ok) { console.log('SKIP', id, r.status); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(`${OUT}${id}.jpg`, buf);
      console.log('OK', id, (buf.length / 1048576).toFixed(2) + 'MB');
    } catch (e) { console.log('FAIL', id, e.message); }
  }

  // netbian 搜索(POST /e/search/index.php)
  const body = new URLSearchParams();
  body.set('keyboard', '原神');
  body.set('tempid', '1');
  body.set('tbname', 'pic');
  body.set('show', 'pic');
  body.set('Submit', '搜索');
  try {
    const r = await fetch('https://pic.netbian.com/e/search/index.php', {
      method: 'POST',
      headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(25000),
      redirect: 'follow',
    });
    const t = await r.text();
    console.log('== netbian search ->', r.status, 'len', t.length, 'url', r.url);
    const imgs = [...new Set([...t.matchAll(/https?:\/\/pic\.netbian\.com\/[^"'\\\s]+\.(?:jpg|png|jpeg)/gi)].map(m => m[0]))];
    console.log('  imgs:', imgs.slice(0, 10).join('\n    '));
  } catch (e) { console.log('ERR netbian search', e.message); }
})();
