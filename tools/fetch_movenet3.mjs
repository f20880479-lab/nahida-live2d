// 多方式重试 MoveNet 模型
import fs from 'node:fs';

fs.mkdirSync('public/vendor/pose/movenet', { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1) storage.googleapis.com + 浏览器头(之前 403 可能是缺 UA)
async function tryStorage(path, out) {
  const url = 'https://storage.googleapis.com/tfhub-tfjs-modules/google/tfjs-model/movenet/singlepose/lightning/4/' + path;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(40000), headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' } });
      if (!r.ok) { console.log('storage HTTP', r.status, path); break; }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(out, buf);
      console.log('OK', (buf.length / 1024).toFixed(0) + 'KB', path);
      return buf;
    } catch (e) { await sleep(1500); }
  }
  return null;
}
const mj = await tryStorage('model.json', 'public/vendor/pose/movenet/model.json');
if (mj) {
  const j = JSON.parse(mj.toString('utf8'));
  console.log('shards:', j.weightsManifest[0].paths.join(', '));
  for (const s of j.weightsManifest[0].paths) await tryStorage(s, 'public/vendor/pose/movenet/' + s);
  console.log('done via storage');
  process.exit(0);
}

// 2) jsDelivr 包搜索 movenet 权重镜像
const r = await fetch('https://data.jsdelivr.com/v1/packages/npm?query=movenet&limit=10');
const j = await r.json();
console.log('jsDelivr movenet 包:', j.results ? j.results.map(x => x.name + '@' + x.latest).join(', ') : '无');
process.exit(1);
