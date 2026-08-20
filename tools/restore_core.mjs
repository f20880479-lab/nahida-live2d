// 恢复免疫 3.3.0 纯 JS 核心(无需 wasm),并完整验证 栈挂载 + moc3 解析
import fs from 'node:fs';
import vm from 'node:vm';

// 1) 重新下载 3.3.0 核心
const url = 'https://cdn.jsdelivr.net/gh/imuncle/live2d@master/live2d_3/js/live2dcubismcore.min.js';
let ok = false;
for (let a = 0; a < 5 && !ok; a++) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) { console.log('HTTP', r.status); break; }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync('public/vendor/live2d/live2dcubismcore.min.js', buf);
    console.log('3.3.0 核心已恢复:', (buf.length / 1024).toFixed(0) + 'KB');
    ok = true;
  } catch (e) { await new Promise(r => setTimeout(r, 1200)); }
}
if (!ok) process.exit(1);

// 2) 沙箱验证
const sandbox = {
  console, globalThis: null, self: null, window: null,
  document: { createElement: () => ({ getContext: () => null, width: 0, height: 0, style: {}, addEventListener() {} }), addEventListener() {}, head: { appendChild() {} } },
  navigator: { userAgent: 'node', platform: 'Node' },
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  performance: { now: () => Date.now() },
  Image: function () {},
};
sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);

for (const p of ['public/vendor/live2d/live2dcubismcore.min.js', 'public/vendor/live2d/pixi.min.js', 'public/vendor/live2d/pixi-live2d-display-cubism4.min.js']) {
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: p }); }
  catch (e) { console.log('FAIL', p.split('/').pop(), e.message); process.exit(1); }
}
console.log('技术栈挂载: PIXI.live2d.Live2DModel =', typeof (sandbox.PIXI && sandbox.PIXI.live2d && sandbox.PIXI.live2d.Live2DModel));

// 3) moc3 解析
const mocBuf = fs.readFileSync('public/live2d/mingshi/mingshi.moc3');
const ab = mocBuf.buffer.slice(mocBuf.byteOffset, mocBuf.byteOffset + mocBuf.byteLength);
const fn = vm.runInContext(`(function (ab) {
  try {
    var m = Live2DCubismCore.Moc.fromArrayBuffer(ab);
    if (!m) return { ok: false, why: 'Moc null' };
    var model = Live2DCubismCore.Model.fromMoc(m);
    if (!model) return { ok: false, why: 'Model null' };
    model.update();
    return { ok: true, params: model.parameters.count, drawables: model.drawables.count, param0: model.parameters.ids[0] };
  } catch (e) { return { ok: false, why: e.message }; }
})`, sandbox);
console.log('moc3 解析 + update:', JSON.stringify(fn(ab)));
