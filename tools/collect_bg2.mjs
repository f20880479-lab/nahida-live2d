// AC 定向搜索:纯风景词,自动下载并报尺寸
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const OUT = fileURLToPath(new URL('./tmp_bg/ac2/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const uniq = a => [...new Set(a)];

function dims(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const l = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + l;
    }
  }
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
    const tag = buf.slice(12, 16).toString();
    if (tag === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (tag === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (tag === 'VP8L') return { w: 1 + (buf.readUInt16LE(21) & 0x3fff), h: 1 + (buf.readUInt16LE(23) & 0x3fff) };
  }
  return null;
}

const QUERIES = [
  'genshin+scenery',
  'genshin+impact+scenery',
  'genshin+sumeru',
  'anime+scenery',
  'anime+landscape',
  'forest+sunbeams',
  'fantasy+landscape',
  'genshin+landscape',
];

(async () => {
  const cands = [];
  for (const q of QUERIES) {
    const u = `https://wall.alphacoders.com/search.php?search=${q}`;
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000) });
      const t = await r.text();
      const full = uniq([...t.matchAll(/https:\/\/images\.alphacoders\.com\/\d+\/\d+\.(?:jpg|png|jpeg|webp)/gi)].map(m => m[0]))
        .filter(x => !x.includes('thumb-'));
      console.log(`== ${q} -> ${full.length} full-size`);
      cands.push(...full.map(x => ({ q, url: x })));
    } catch (e) { console.log('ERR', q, e.message); }
  }
  const seen = new Set();
  const list = cands.filter(c => (seen.has(c.url) ? false : (seen.add(c.url), true))).slice(0, 30);
  console.log('\n== unique candidates:', list.length);
  let idx = 0;
  for (const c of list) {
    const ext = c.url.match(/\.(jpg|png|jpeg|webp)$/i)?.[1] || 'jpg';
    const file = `${OUT}${String(idx).padStart(2, '0')}.${ext}`;
    try {
      const rr = await fetch(c.url, { headers: UA, signal: AbortSignal.timeout(90000) });
      if (!rr.ok) { console.log('  SKIP', idx, rr.status, c.url); idx++; continue; }
      const buf = Buffer.from(await rr.arrayBuffer());
      writeFileSync(file, buf);
      const d = dims(buf);
      console.log(`  [${idx}] ${c.q} :: ${d ? d.w + 'x' + d.h : '?'} ${(buf.length / 1048576).toFixed(1)}MB :: ${c.url}`);
    } catch (e) { console.log('  FAIL', idx, c.url, e.message); }
    idx++;
  }
  console.log('DONE');
})();
