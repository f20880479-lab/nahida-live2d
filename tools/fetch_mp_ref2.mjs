// jsDelivr 拉取参考项目源码
import fs from 'node:fs';
fs.mkdirSync('tools/ref/mediapipe', { recursive: true });

const files = [
  ['https://cdn.jsdelivr.net/gh/CRPRPO/MediaPipe_Diagnostic_Lab@main/app.js', 'tools/ref/mediapipe/ref-app.js'],
];
for (const [url, out] of files) {
  for (let a = 0; a < 5; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) { console.log('HTTP', r.status); await new Promise(r2 => setTimeout(r2, 1500)); continue; }
      fs.writeFileSync(out, await r.text());
      console.log('OK', out);
      process.exit(0);
    } catch (e) { await new Promise(r2 => setTimeout(r2, 1500)); }
  }
}
console.log('FAIL');
process.exit(1);
