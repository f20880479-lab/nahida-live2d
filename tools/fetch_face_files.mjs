// 下载 face-api.js UMD + 模型文件,并重试参考项目 script.js
import fs from 'node:fs';
import path from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function dl(url, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  for (let a = 0; a < 6; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(40000) });
      if (!r.ok) { console.log('HTTP', r.status, url.split('/').pop()); break; }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(out, buf);
      console.log('OK', (buf.length / 1024).toFixed(0) + 'KB', out.split('/').pop());
      return true;
    } catch (e) { await sleep(1500); }
  }
  console.log('FAIL', url.split('/').pop());
  return false;
}

// 1) face-api.js UMD 构建
await dl('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.js', 'public/vendor/face-api/face-api.js');
// 2) 模型文件(jsDelivr GitHub 镜像)
const BASE = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/';
const models = [
  'tiny_face_detector_model-weights_manifest.json', 'tiny_face_detector_model-shard1',
  'face_landmark_68_model-weights_manifest.json', 'face_landmark_68_model-shard1',
  'face_expression_model-weights_manifest.json', 'face_expression_model-shard1',
];
for (const m of models) await dl(BASE + m, 'public/vendor/face-api/models/' + m);
// 3) 参考项目 script.js(重试)
await dl('https://raw.githubusercontent.com/BaseMax/face-emotion-detection-web-live/main/script.js', 'tools/ref/camera/ref-script.js');
console.log('all done');
