// 读取图片尺寸(简易头解析,支持 PNG/JPEG/WebP)
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./tmp_bg/', import.meta.url));

function dims(buf) {
  if (buf.length < 24) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) { // PNG
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) { // JPEG
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') { // WebP
    const tag = buf.slice(12, 16).toString();
    if (tag === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (tag === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (tag === 'VP8L') return { w: 1 + buf.readUInt16LE(21) & 0x3fff, h: 1 + buf.readUInt16LE(23) & 0x3fff };
  }
  return null;
}

for (const f of readdirSync(DIR).sort()) {
  const buf = readFileSync(DIR + f);
  const d = dims(buf);
  console.log(f.padEnd(12), d ? `${d.w}x${d.h}` : '?', (buf.length / 1048576).toFixed(2) + 'MB');
}
