// 下载 wallpapercave 预览图(mwp, 小尺寸)用于分类
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const OUT = fileURLToPath(new URL('./tmp_bg/thumbs/', import.meta.url));
mkdirSync(OUT, { recursive: true });

(async () => {
  const list = readFileSync('tools/wp_all_list.txt', 'utf8').split('\n').filter(Boolean);
  console.log('total', list.length);
  let ok = 0, fail = 0;
  for (let i = 0; i < list.length; i++) {
    const full = list[i];
    const id = full.match(/wp(\d+)\./)[1];
    const ext = full.match(/\.(jpg|png|webp)$/)[1];
    const murl = `https://wallpapercave.com/mwp/wp${id}.${ext}`;
    const file = `${OUT}${id}.${ext}`;
    try {
      const r = await fetch(murl, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (!r.ok) { console.log('SKIP', i, murl, r.status); fail++; continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(file, buf);
      ok++;
      if (i % 15 === 0) console.log('  ...', i, 'done, ok', ok);
    } catch (e) { console.log('FAIL', i, murl, e.message); fail++; }
  }
  console.log('DONE ok:', ok, 'fail:', fail);
})();
