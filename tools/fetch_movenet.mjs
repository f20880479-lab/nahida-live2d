// 下载 MoveNet SinglePose Lightning 模型到本地
import fs from 'node:fs';

const BASE = 'https://storage.googleapis.com/tfhub-tfjs-modules/google/tfjs-model/movenet/singlepose/lightning/4/';
fs.mkdirSync('public/vendor/pose/movenet', { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1) model.json(确认 shard 文件名)
let mj = null;
for (let a = 0; a < 6 && !mj; a++) {
  try {
    const r = await fetch(BASE + 'model.json?tfjs-format=file', { signal: AbortSignal.timeout(40000) });
    if (r.ok) { mj = await r.json(); fs.writeFileSync('public/vendor/pose/movenet/model.json', JSON.stringify(mj)); console.log('model.json OK, shards:', mj.weightsManifest[0].paths.join(', ')); }
    else { console.log('HTTP', r.status); await sleep(1500); }
  } catch (e) { await sleep(1500); }
}
if (!mj) { console.log('model.json 失败'); process.exit(1); }

// 2) 下载所有 shard
for (const shard of mj.weightsManifest[0].paths) {
  const out = 'public/vendor/pose/movenet/' + shard;
  let done = false;
  for (let a = 0; a < 6 && !done; a++) {
    try {
      const r = await fetch(BASE + shard, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) { console.log('HTTP', r.status, shard); break; }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(out, buf);
      console.log('OK', (buf.length / 1024 / 1024).toFixed(1) + 'MB', shard);
      done = true;
    } catch (e) { await sleep(2000); }
  }
  if (!done) console.log('FAIL', shard);
}
console.log('MoveNet 下载完成');
