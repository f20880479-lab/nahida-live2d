// 下载 MediaPipe 官方手势识别模型(gesture_recognizer + hand_landmarker)
import fs from 'node:fs';

fs.mkdirSync('public/vendor/mediapipe', { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function dl(url, out) {
  // 先 HEAD 拿大小
  const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0' } });
  const total = parseInt(head.headers.get('content-length') || '0');
  console.log(out.split('/').pop(), '总大小:', total);
  if (!total) return false;
  // Range 分块下载(整包容易超时)
  const buf = Buffer.alloc(total);
  const CHUNK = 512 * 1024;
  let done = 0;
  for (let start = 0; start < total; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, total - 1);
    let ok = false;
    for (let a = 0; a < 8 && !ok; a++) {
      try {
        const r = await fetch(url, { headers: { 'Range': 'bytes=' + start + '-' + end, 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(60000) });
        if (r.status !== 206 && r.status !== 200) { console.log('HTTP', r.status, 'chunk', start); await sleep(1500); continue; }
        const chunk = Buffer.from(await r.arrayBuffer());
        chunk.copy(buf, start);
        done += chunk.length;
        ok = true;
      } catch (e) { await sleep(1500); }
    }
    if (!ok) { console.log('CHUNK FAILED at', start); return false; }
  }
  fs.writeFileSync(out, buf);
  console.log('OK', out.split('/').pop(), (buf.length / 1024 / 1024).toFixed(1) + 'MB');
  return true;
}

const G = 'https://storage.googleapis.com/mediapipe-models/';
await dl(G + 'gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task', 'public/vendor/mediapipe/gesture_recognizer.task');
await dl(G + 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', 'public/vendor/mediapipe/hand_landmarker.task');
console.log('done');
