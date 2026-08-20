// 检查官方核心是否内嵌 wasm(base64),并在带 atob/fetch/WebAssembly 的沙箱里完整验证
import fs from 'node:fs';
import vm from 'node:vm';

// 重新下载官方核心
const coreUrl = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';
let buf;
for (let a = 0; a < 5; a++) {
  try {
    const r = await fetch(coreUrl, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) { console.log('HTTP', r.status); break; }
    buf = Buffer.from(await r.arrayBuffer());
    break;
  } catch (e) { await new Promise(r => setTimeout(r, 1500)); }
}
if (!buf) process.exit(1);
const js = buf.toString('utf8');
fs.writeFileSync('public/vendor/live2d/live2dcubismcore.min.js', buf);
console.log('官方核心:', (buf.length / 1024).toFixed(0) + 'KB');
console.log('内嵌 wasm base64:', js.includes('data:application/octet-stream;base64'));
console.log('引用外部 wasm 名:', (js.match(/"(_em_module\.wasm)"/) || [])[1] || '无');

// 带齐浏览器环境的沙箱
const sandbox = {
  console, globalThis: null, self: null, window: null,
  document: { currentScript: { src: 'http://localhost/vendor/live2d/live2dcubismcore.min.js' }, createElement: () => ({ getContext: () => null, width: 0, height: 0, style: {}, addEventListener() {} }), addEventListener() {}, head: { appendChild() {} } },
  navigator: { userAgent: 'node', platform: 'Node' },
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  WebAssembly,
  fetch: (url) => {
    const key = String(url).split('?')[0];
    if (/\.wasm/.test(key)) {
      const data = fs.existsSync('public/vendor/live2d/live2dcubismcore.wasm') ? fs.readFileSync('public/vendor/live2d/live2dcubismcore.wasm') : Buffer.from([]);
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) });
    }
    return Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.reject(new Error('404')) });
  },
};
sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);
try {
  vm.runInContext(js, sandbox);
  const exports = vm.runInContext('Object.keys(Live2DCubismCore)', sandbox);
  console.log('导出:', exports.join(', '));
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
  console.log('moc3 解析:', JSON.stringify(fn(ab)));
} catch (e) {
  console.log('核心加载失败:', e.message);
}
