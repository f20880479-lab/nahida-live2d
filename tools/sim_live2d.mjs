// 沙箱模拟浏览器加载 Live2D 技术栈,验证全局挂载是否正常
import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = {
  console,
  globalThis: null, // 下面设
  self: null,
  window: null,
  navigator: { userAgent: 'node', platform: 'Node' },
  document: {
    createElement: () => ({ style: {}, getContext: () => null, addEventListener() {}, appendChild() {} }),
    addEventListener() {},
    head: { appendChild() {} },
  },
  WebGLRenderingContext: undefined,
  WebGL2RenderingContext: undefined,
  Image: function () {},
  HTMLCanvasElement: function () {},
  OffscreenCanvas: undefined,
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  performance: { now: () => Date.now() },
  fetch: (url) => {
    // 从本地磁盘读,模拟网络
    const map = {
      '/live2d/mingshi/mingshi.model3.json': 'public/live2d/mingshi/mingshi.model3.json',
      '/live2d/mingshi/mingshi.moc3': 'public/live2d/mingshi/mingshi.moc3',
      '/live2d/mingshi/textures/texture_00.png': 'public/live2d/mingshi/textures/texture_00.png',
      '/live2d/mingshi/mingshi.physics3.json': 'public/live2d/mingshi/mingshi.physics3.json',
    };
    const key = url.split('?')[0];
    const file = map[key] || map[Object.keys(map).find(k => url.endsWith(k.split('/').pop()))];
    if (!file || !fs.existsSync(file)) return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(), arrayBuffer: () => Promise.reject() });
    const data = fs.readFileSync(file);
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(JSON.parse(data.toString('utf8'))),
      arrayBuffer: () => Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
    });
  },
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

function loadScript(path) {
  const code = fs.readFileSync(path, 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: path });
    console.log('OK  加载', path.split('/').pop());
    return true;
  } catch (e) {
    console.log('FAIL加载', path.split('/').pop(), '→', e.message);
    return false;
  }
}

// 按 index.html 顺序加载
loadScript('public/vendor/live2d/live2dcubismcore.min.js');
loadScript('public/vendor/live2d/pixi.min.js');
loadScript('public/vendor/live2d/pixi-live2d-display.min.js');
loadScript('public/live2d.js');

console.log('--- 全局检查 ---');
console.log('window.PIXI:', typeof sandbox.PIXI);
console.log('window.PIXI.live2d:', typeof (sandbox.PIXI && sandbox.PIXI.live2d));
console.log('Live2DCubismCore:', typeof sandbox.Live2DCubismCore);
console.log('window.TaffyLive2D:', typeof sandbox.TaffyLive2D);
