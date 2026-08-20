// 下载官方 Cubism4 核心的 .wasm 伴侣文件,并在沙箱里完整验证 WASM 核心可用
import fs from 'node:fs';
import vm from 'node:vm';

// 1) 下载 wasm
const wasmUrl = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.wasm';
let ok = false;
for (let a = 0; a < 5 && !ok; a++) {
  try {
    const r = await fetch(wasmUrl, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) { console.log('HTTP', r.status, 'wasm'); break; }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync('public/vendor/live2d/live2dcubismcore.wasm', buf);
    console.log('wasm 下载:', (buf.length / 1024).toFixed(0) + 'KB, 魔数:', buf.slice(0, 4).toString('hex'));
    ok = buf.length > 1000;
  } catch (e) { await new Promise(r => setTimeout(r, 1500)); }
}
if (!ok) { console.log('wasm 下载失败'); process.exit(1); }

// 2) 重新下载官方核心 JS(刚才被覆盖成 3.3.0 了)
const coreUrl = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';
ok = false;
for (let a = 0; a < 5 && !ok; a++) {
  try {
    const r = await fetch(coreUrl, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) { console.log('HTTP', r.status, 'core'); break; }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync('public/vendor/live2d/live2dcubismcore.min.js', buf);
    console.log('官方核心 JS:', (buf.length / 1024).toFixed(0) + 'KB');
    ok = buf.length > 50000;
  } catch (e) { await new Promise(r => setTimeout(r, 1500)); }
}
if (!ok) process.exit(1);

// 3) 沙箱验证 WASM 核心:导出 + moc3 解析
const sandbox = {
  console, globalThis: null, self: null, window: null,
  document: { currentScript: { src: '/vendor/live2d/live2dcubismcore.min.js' }, createElement: () => ({ getContext: () => null, width: 0, height: 0, style: {}, addEventListener() {} }), addEventListener() {}, head: { appendChild() {} } },
  navigator: { userAgent: 'node', platform: 'Node' },
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  WebAssembly,
  fetch: (url) => {
    const key = String(url).split('?')[0];
    if (key.endsWith('.wasm') || key.includes('live2dcubismcore.wasm') || key === 'live2dcubismcore.wasm') {
      const data = fs.readFileSync('public/vendor/live2d/live2dcubismcore.wasm');
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) });
    }
    return Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.reject(new Error('404')) });
  },
};
sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('public/vendor/live2d/live2dcubismcore.min.js', 'utf8'), sandbox);
const exports = vm.runInContext('Object.keys(Live2DCubismCore)', sandbox);
console.log('WASM 核心导出:', exports.join(', '));
const mocBuf = fs.readFileSync('public/live2d/mingshi/mingshi.moc3');
const ab = mocBuf.buffer.slice(mocBuf.byteOffset, mocBuf.byteOffset + mocBuf.byteLength);
const fn = vm.runInContext(`(function (ab) {
  try {
    var m = Live2DCubismCore.Moc.fromArrayBuffer(ab);
    if (!m) return { ok: false, why: 'Moc null' };
    var model = Live2DCubismCore.Model.fromMoc(m);
    if (!model) return { ok: false, why: 'Model null' };
    model.update();
    return { ok: true, params: model.parameters.count, drawables: model.drawables.count };
  } catch (e) { return { ok: false, why: e.message }; }
})`, sandbox);
console.log('WASM 核心解析 moc3:', JSON.stringify(fn(ab)));
