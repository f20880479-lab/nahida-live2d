// 用官方 Cubism4 核心(内嵌 wasm)解析纳西妲 moc3 v4,轮询等待 wasm 就绪
import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = {
  console, globalThis: null, self: null, window: null,
  document: {
    currentScript: { src: '/vendor/live2d/live2dcubismcore.min.js' },
    createElement: () => ({ getContext: () => null, width: 0, height: 0, style: {}, addEventListener() {} }),
    addEventListener() {}, head: { appendChild() {} },
  },
  navigator: { userAgent: 'node', platform: 'Node' },
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  WebAssembly,
  fetch: () => Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.reject(new Error('404')) }),
};
sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('public/vendor/live2d/live2dcubismcore.min.js', 'utf8'), sandbox);
console.log('核心导出:', vm.runInContext('Object.keys(Live2DCubismCore).slice(0,10).join(",")', sandbox));

const mocBuf = fs.readFileSync('public/live2d/nahida/Nahida_1080.moc3');
const ab = mocBuf.buffer.slice(mocBuf.byteOffset, mocBuf.byteOffset + mocBuf.byteLength);
const fn = vm.runInContext(`(function (ab) {
  try {
    var m = Live2DCubismCore.Moc.fromArrayBuffer(ab);
    if (!m) return { ok: false, why: 'Moc null' };
    var model = Live2DCubismCore.Model.fromMoc(m);
    if (!model) return { ok: false, why: 'Model null' };
    model.update();
    var ids = [];
    for (var i = 0; i < model.parameters.count; i++) ids.push(model.parameters.ids[i]);
    return { ok: true, params: ids };
  } catch (e) { return { ok: false, why: e.message }; }
})`, sandbox);

// 轮询等待 wasm 就绪(模拟浏览器里 live2d.js 的 _waitForCore)
let result = null;
for (let i = 0; i < 40; i++) {
  result = fn(ab);
  if (result.ok) break;
  await new Promise(r => setTimeout(r, 100));
}
console.log('纳西妲 moc3 v4 解析:', result.ok ? 'OK ' + result.params.length + ' 参数' : JSON.stringify(result));
if (result.ok) {
  const interesting = result.params.filter(p => /Angle|Brow|Mouth|Eye|Cheek|Body|Breath/i.test(p));
  console.log('表情/姿态参数:', interesting.join(', '));
}
