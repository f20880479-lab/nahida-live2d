// Range 分块下载 pose_landmarker_lite.task(5.7MB,每块 512KB,带重试)
import fs from 'node:fs';

const URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const OUT = 'public/vendor/mediapipe/pose_landmarker_lite.task';
const CHUNK = 512 * 1024;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 先 HEAD 拿总大小
const head = await fetch(URL, { method: 'HEAD', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0' } });
const total = parseInt(head.headers.get('content-length') || '0');
console.log('总大小:', total, 'bytes');
if (!total) { console.log('无 content-length'); process.exit(1); }

const buf = Buffer.alloc(total);
let done = 0;
for (let start = 0; start < total; start += CHUNK) {
  const end = Math.min(start + CHUNK - 1, total - 1);
  let ok = false;
  for (let a = 0; a < 8 && !ok; a++) {
    try {
      const r = await fetch(URL, {
        headers: { 'Range': 'bytes=' + start + '-' + end, 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(60000),
      });
      if (r.status !== 206 && r.status !== 200) { console.log('HTTP', r.status, 'chunk', start); await sleep(1500); continue; }
      const chunk = Buffer.from(await r.arrayBuffer());
      chunk.copy(buf, start);
      done += chunk.length;
      console.log('chunk', (start / 1024 / 1024).toFixed(1) + 'MB+', '累计', (done / 1024 / 1024).toFixed(1) + 'MB');
      ok = true;
    } catch (e) { console.log('fail chunk', start, e.cause?.code || e.message); await sleep(1500); }
  }
  if (!ok) { console.log('CHUNK FAILED at', start); process.exit(1); }
}
fs.writeFileSync(OUT, buf);
console.log('姿态模型完成', (buf.length / 1024 / 1024).toFixed(1) + 'MB');
