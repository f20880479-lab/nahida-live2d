// 背景图候选收集:Alpha Coders 多个关键词搜索 + 下载候选图到 tools/tmp_bg/
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const OUT = fileURLToPath(new URL('./tmp_bg/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const uniq = (a) => [...new Set(a)];

const QUERIES = [
  'genshin+sumeru',
  'genshin+nahida',
  'genshin+impact+landscape',
  'sumeru+rainforest',
  'anime+forest+wallpaper',
  'genshin+scenery',
  'fantasy+forest',
];

async function main() {
  const cands = [];
  for (const q of QUERIES) {
    const u = `https://wall.alphacoders.com/search.php?search=${q}`;
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000) });
      const t = await r.text();
      const full = uniq([...t.matchAll(/https:\/\/images\.alphacoders\.com\/\d+\/\d+\.(?:jpg|png|jpeg|webp)(?!-)/gi)].map(m => m[0]));
      const ok = full.filter(x => !x.includes('thumb-'));
      console.log(`== ${q} -> ${r.status} full-size: ${ok.length}`);
      cands.push(...ok.map(x => ({ q, url: x })));
    } catch (e) { console.log('ERR', q, e.message); }
  }
  // 去重 + 截取前 18 个下载
  const seen = new Set();
  const list = cands.filter(c => (seen.has(c.url) ? false : (seen.add(c.url), true))).slice(0, 18);
  console.log('\n== total candidates:', list.length);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const ext = c.url.match(/\.(jpg|png|jpeg|webp)$/i)?.[1] || 'jpg';
    const file = `${OUT}cand_${String(i).padStart(2, '0')}.${ext}`;
    try {
      const rr = await fetch(c.url, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (!rr.ok) { console.log('  SKIP', i, c.url, '->', rr.status); continue; }
      const buf = Buffer.from(await rr.arrayBuffer());
      writeFileSync(file, buf);
      console.log(`  [${i}] ${c.q} :: ${c.url} -> ${file} ${(buf.length / 1048576).toFixed(2)}MB`);
    } catch (e) { console.log('  FAIL', i, c.url, e.message); }
  }
  console.log('\nDONE');
}

main();
