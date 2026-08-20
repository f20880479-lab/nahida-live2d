// 直接用 Cubism 核心解析 moc3,验证核心与模型兼容性
import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = {
  console, globalThis: null, self: null, window: null,
  document: {
    createElement: () => ({ getContext: () => null, width: 0, height: 0, style: {}, addEventListener() {} }),
  },
  navigator: { userAgent: 'node', platform: 'Node' },
};
sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('public/vendor/live2d/live2dcubismcore.min.js', 'utf8'), sandbox);

const mocBuf = fs.readFileSync('public/live2d/mingshi/mingshi.moc3');
const ab = mocBuf.buffer.slice(mocBuf.byteOffset, mocBuf.byteOffset + mocBuf.byteLength);
const fn = vm.runInContext(`(function (ab) {
  try {
    var m = Live2DCubismCore.Moc.fromArrayBuffer(ab);
    if (!m) return { ok: false, why: 'Moc null' };
    var model = Live2DCubismCore.Model.fromMoc(m);
    if (!model) return { ok: false, why: 'Model null' };
    return { ok: true, params: model.parameters.count, parts: model.parts.count, drawables: model.drawables.count };
  } catch (e) { return { ok: false, why: e.message }; }
})`, sandbox);
console.log('核心解析 moc3:', JSON.stringify(fn(ab)));
