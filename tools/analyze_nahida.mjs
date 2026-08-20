// 用 3.3.0 核心(仅分析用)解析纳西妲 moc3,列出参数 ID
import fs from 'node:fs';
import vm from 'node:vm';

// 下载 3.3.0 核心到 tools(不服务,只用于解析)
let core = null;
for (let a = 0; a < 5 && !core; a++) {
  try {
    const r = await fetch('https://cdn.jsdelivr.net/gh/imuncle/live2d@master/live2d_3/js/live2dcubismcore.min.js', { signal: AbortSignal.timeout(30000) });
    if (r.ok) core = Buffer.from(await r.arrayBuffer());
    else await new Promise(r2 => setTimeout(r2, 1200));
  } catch (e) { await new Promise(r2 => setTimeout(r2, 1200)); }
}
if (!core) { console.log('核心获取失败'); process.exit(1); }

const sandbox = {
  console, globalThis: null, self: null, window: null,
  document: { createElement: () => ({ getContext: () => null, width: 0, height: 0, style: {}, addEventListener() {} }), addEventListener() {}, head: { appendChild() {} } },
  navigator: { userAgent: 'node', platform: 'Node' },
};
sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(core.toString('utf8'), sandbox);

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
const r = fn(ab);
console.log('纳西妲 moc3 解析:', r.ok ? 'OK ' + r.params.length + ' 个参数' : JSON.stringify(r));
if (r.ok) {
  const interesting = r.params.filter(p => /Angle|Brow|Mouth|Eye|Cheek|Body|Breath/i.test(p));
  console.log('表情/姿态相关参数:', interesting.join(', '));
}
