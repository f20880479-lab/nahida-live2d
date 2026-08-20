// 预览图尺寸筛选(横向优先)
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./tmp_bg/thumbs/', import.meta.url));

function dims(buf) {
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
    const tag = buf.slice(12, 16).toString();
    if (tag === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (tag === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (tag === 'VP8L') return { w: 1 + (buf.readUInt16LE(21) & 0x3fff), h: 1 + (buf.readUInt16LE(23) & 0x3fff) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
    return null;
  }
  return null;
}

const files = readdirSync(DIR);
const list = files.map(f => { const b = readFileSync(DIR + f); return { f, d: dims(b) }; });
const landscape = list.filter(x => x.d && x.d.w > x.d.h);
console.log('total', files.length, 'landscape', landscape.length);
for (const x of landscape) console.log(x.f.padEnd(16), x.d.w + 'x' + x.d.h, (x.d.w / x.d.h).toFixed(2));
