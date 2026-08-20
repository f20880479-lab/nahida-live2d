// 测试 upload-bbs.miyoushe.com:可达性 + OSS 缩放参数
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };

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
  return null;
}

(async () => {
  const urls = readFileSync('tools/mys_bg_urls.txt', 'utf8').split('\n').filter(Boolean);
  console.log('total urls:', urls.length);
  // 取前 6 个 URL 做测试
  for (const u of urls.slice(0, 6)) {
    // 原图
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
      const buf = Buffer.from(await r.arrayBuffer());
      const d = dims(buf);
      console.log('ORIG', r.status, u.slice(-60), '->', d ? d.w + 'x' + d.h : '?', (buf.length / 1048576).toFixed(2) + 'MB');
    } catch (e) { console.log('ORIG FAIL', u.slice(-50), e.message); continue; }
    // OSS 缩放参数
    for (const q of ['?x-oss-process=image/resize,w_1280', '?x-oss-process=image/resize,w_1280/quality,q_85']) {
      try {
        const r = await fetch(u + q, { headers: UA, signal: AbortSignal.timeout(20000) });
        const buf = Buffer.from(await r.arrayBuffer());
        const d = dims(buf);
        console.log('  RESIZE', r.status, q.slice(30, 60), '->', d ? d.w + 'x' + d.h : '?', (buf.length / 1048576).toFixed(2) + 'MB');
        break;
      } catch (e) { console.log('  RESIZE FAIL', q, e.message); }
    }
  }
})();
