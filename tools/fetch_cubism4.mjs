// 下载 cubism4 专用构建并沙箱验证
import fs from 'node:fs';
import vm from 'node:vm';

const url = 'https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js';
let ok = false;
for (let a = 0; a < 5 && !ok; a++) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) { console.log('HTTP', r.status); break; }
    fs.writeFileSync('public/vendor/live2d/pixi-live2d-display-cubism4.min.js', Buffer.from(await r.arrayBuffer()));
    console.log('下载 OK');
    ok = true;
  } catch (e) { await new Promise(r => setTimeout(r, 1200)); }
}
if (!ok) process.exit(1);

// 沙箱验证(只带 Cubism4 核心,不带 Cubism2)
const sandbox = {
  console, globalThis: null, self: null, window: null,
  navigator: { userAgent: 'node', platform: 'Node' },
  document: { createElement: () => ({ style: {}, getContext: () => null }), addEventListener() {}, head: { appendChild() {} } },
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  performance: { now: () => Date.now() },
};
sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);
const run = (p) => {
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: p }); console.log('OK  ', p.split('/').pop()); }
  catch (e) { console.log('FAIL', p.split('/').pop(), '→', e.message); }
};
run('public/vendor/live2d/live2dcubismcore.min.js');
run('public/vendor/live2d/pixi.min.js');
run('public/vendor/live2d/pixi-live2d-display-cubism4.min.js');
console.log('PIXI.live2d:', typeof (sandbox.PIXI && sandbox.PIXI.live2d));
console.log('Live2DModel:', typeof (sandbox.PIXI && sandbox.PIXI.live2d && sandbox.PIXI.live2d.Live2DModel));
