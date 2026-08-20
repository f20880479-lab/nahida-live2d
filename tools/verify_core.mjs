// 用新核心重新验证:moc3 解析 + 技术栈挂载
import fs from 'node:fs';
import vm from 'node:vm';

function mkSandbox() {
  const s = {
    console, globalThis: null, self: null, window: null,
    document: { createElement: () => ({ getContext: () => null, width: 0, height: 0, style: {}, addEventListener() {} }), addEventListener() {}, head: { appendChild() {} } },
    navigator: { userAgent: 'node', platform: 'Node' },
    requestAnimationFrame: (fn) => setTimeout(fn, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    performance: { now: () => Date.now() },
    Image: function () {},
  };
  s.globalThis = s; s.self = s; s.window = s;
  vm.createContext(s);
  return s;
}

// 1) 新核心版本
{
  const s = mkSandbox();
  vm.runInContext(fs.readFileSync('public/vendor/live2d/live2dcubismcore.min.js', 'utf8'), s);
  const ver = vm.runInContext('Live2DCubismCore.Version.csmGetVersion ? (function(){ var v = Live2DCubismCore.Version.csmGetVersion(); return ((4278190080&v)>>24) + "." + ((16711680&v)>>16) + "." + (65535&v); })() : "n/a"', s);
  console.log('新核心版本:', ver);
  // 2) moc3 解析
  const mocBuf = fs.readFileSync('public/live2d/mingshi/mingshi.moc3');
  const ab = mocBuf.buffer.slice(mocBuf.byteOffset, mocBuf.byteOffset + mocBuf.byteLength);
  const fn = vm.runInContext('(function(ab){ try { var m = Live2DCubismCore.Moc.fromArrayBuffer(ab); if (!m) return {ok:false,why:"Moc null"}; var model = Live2DCubismCore.Model.fromMoc(m); if (!model) return {ok:false,why:"Model null"}; return {ok:true, params: model.parameters.count, parts: model.parts.count, drawables: model.drawables.count}; } catch(e){ return {ok:false, why:e.message}; } })', s);
  console.log('新核心解析 moc3:', JSON.stringify(fn(ab)));
}

// 3) 技术栈挂载(新核心 + cubism4 构建)
{
  const s = mkSandbox();
  for (const p of ['public/vendor/live2d/live2dcubismcore.min.js', 'public/vendor/live2d/pixi.min.js', 'public/vendor/live2d/pixi-live2d-display-cubism4.min.js']) {
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), s, { filename: p }); }
    catch (e) { console.log('FAIL', p.split('/').pop(), e.message); process.exit(1); }
  }
  console.log('PIXI.live2d.Live2DModel:', typeof (s.PIXI && s.PIXI.live2d && s.PIXI.live2d.Live2DModel));
}
