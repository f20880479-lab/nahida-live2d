// 尝试多种来源获取 MoveNet 模型
import fs from 'node:fs';

fs.mkdirSync('public/vendor/pose/movenet', { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tryFetch(url, out, expectJson = false) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(40000), redirect: 'follow' });
      if (!r.ok) { console.log('HTTP', r.status, url.slice(0, 90)); return null; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (expectJson) {
        try { return JSON.parse(buf.toString('utf8')); } catch { console.log('非JSON', url.slice(0, 90)); return null; }
      }
      fs.writeFileSync(out, buf);
      console.log('OK', (buf.length / 1024).toFixed(0) + 'KB', out.split('/').pop());
      return buf;
    } catch (e) { await sleep(1500); }
  }
  return null;
}

// 1) tfhub.dev 重定向
const mj = await tryFetch('https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4?tfjs-format=file', null, true);
if (mj) {
  fs.writeFileSync('public/vendor/pose/movenet/model.json', JSON.stringify(mj));
  console.log('tfhub model.json OK, shards:', mj.weightsManifest[0].paths.join(', '));
  for (const shard of mj.weightsManifest[0].paths) {
    const r = await fetch('https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4/' + shard + '?tfjs-format=file', { signal: AbortSignal.timeout(60000), redirect: 'follow' });
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync('public/vendor/pose/movenet/' + shard, buf);
      console.log('OK', (buf.length / 1024 / 1024).toFixed(1) + 'MB', shard);
    } else console.log('HTTP', r.status, shard);
  }
  console.log('完成(方式1: tfhub)');
  process.exit(0);
}
console.log('方式1 失败,尝试 jsDelivr npm 镜像...');
// 2) jsDelivr:有些 npm 包镜像了 movenet 权重
const mj2 = await tryFetch('https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/package.json', null, true);
console.log('pose-detection npm 包不包含模型权重(需从 tfhub 获取)');
process.exit(1);
