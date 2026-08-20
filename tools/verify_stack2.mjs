// 用官方核心(内嵌 wasm)验证:1) _isStarted 调用是否带保护 2) cubism4 全栈挂载
import fs from 'node:fs';
import vm from 'node:vm';

// _isStarted / Logging / Version 在 cubism4.min.js 里的使用上下文
const l2d = fs.readFileSync('public/vendor/live2d/pixi-live2d-display-cubism4.min.js', 'utf8');
for (const name of ['_isStarted', 'Logging', 'Version']) {
  const i = l2d.indexOf('Live2DCubismCore.' + name);
  if (i >= 0) console.log(`--- ${name} 使用上下文 ---\n`, l2d.slice(Math.max(0, i - 60), i + 90));
}

// 全栈挂载(官方核心 + pixi + cubism4)
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
console.log('\n全栈挂载: PIXI.live2d.Live2DModel =', typeof (sandbox.PIXI && sandbox.PIXI.live2d && sandbox.PIXI.live2d.Live2DModel));
console.log('核心导出 Logging/Version:', typeof (sandbox.Live2DCubismCore && sandbox.Live2DCubismCore.Logging), typeof (sandbox.Live2DCubismCore && sandbox.Live2DCubismCore.Version));
