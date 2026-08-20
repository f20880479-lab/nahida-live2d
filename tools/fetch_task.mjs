// 下载 pose_landmarker_lite.task(后台重试)
import fs from 'node:fs';

const url = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
for (let a = 0; a < 12; a++) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) { console.log('HTTP', r.status, 'attempt', a + 1); await new Promise(r2 => setTimeout(r2, 3000)); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync('public/vendor/mediapipe/pose_landmarker_lite.task', buf);
    console.log('姿态模型 OK', (buf.length / 1024 / 1024).toFixed(1) + 'MB');
    process.exit(0);
  } catch (e) { console.log('fail', a + 1, e.cause?.code || e.message); await new Promise(r2 => setTimeout(r2, 3000)); }
}
console.log('FAILED');
process.exit(1);
