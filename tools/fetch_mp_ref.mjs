// 拉取参考项目(CRPRPO MediaPipe Pose Landmarker Web)源码
import fs from 'node:fs';
fs.mkdirSync('tools/ref/mediapipe', { recursive: true });

const files = [
  ['https://raw.githubusercontent.com/CRPRPO/MediaPipe_Diagnostic_Lab/main/app.js', 'tools/ref/mediapipe/ref-app.js'],
  ['https://raw.githubusercontent.com/CRPRPO/MediaPipe_Diagnostic_Lab/main/index.html', 'tools/ref/mediapipe/ref-index.html'],
];
for (const [url, out] of files) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) { console.log('HTTP', r.status); await new Promise(r2 => setTimeout(r2, 1200)); continue; }
      fs.writeFileSync(out, await r.text());
      console.log('OK', out);
      break;
    } catch (e) { await new Promise(r2 => setTimeout(r2, 1200)); }
  }
}
