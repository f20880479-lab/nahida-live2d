// 沙箱内实际执行 Live2DModel.from(),验证模型能被解析(WebGL 相关步骤预期会失败,看失败点在哪)
import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = {
  console, globalThis: null, self: null, window: null,
  navigator: { userAgent: 'node', platform: 'Node' },
  document: { createElement: () => ({ style: {}, getContext: () => null, addEventListener() {} }), addEventListener() {}, head: { appendChild() {} } },
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  performance: { now: () => Date.now() },
  Image: function () {},
  fetch: (url) => {
    const map = {
      '/live2d/mingshi/mingshi.model3.json': 'public/live2d/mingshi/mingshi.model3.json',
      '/live2d/mingshi/mingshi.moc3': 'public/live2d/mingshi/mingshi.moc3',
      '/live2d/mingshi/textures/texture_00.png': 'public/live2d/mingshi/textures/texture_00.png',
      '/live2d/mingshi/mingshi.physics3.json': 'public/live2d/mingshi/mingshi.physics3.json',
      '/live2d/mingshi/motions/idle.motion3.json': 'public/live2d/mingshi/motions/idle.motion3.json',
    };
    const key = url.split('?')[0];
    const file = map[key];
    if (!file || !fs.existsSync(file)) {
      console.log('  [fetch 404]', key);
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')), arrayBuffer: () => Promise.reject(new Error('404')), text: () => Promise.reject(new Error('404')) });
    }
    const data = fs.readFileSync(file);
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(JSON.parse(data.toString('utf8'))),
      arrayBuffer: () => Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
      text: () => Promise.resolve(data.toString('utf8')),
    });
  },
};
sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);

for (const p of ['public/vendor/live2d/live2dcubismcore.min.js', 'public/vendor/live2d/pixi.min.js', 'public/vendor/live2d/pixi-live2d-display-cubism4.min.js']) {
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: p }); }
  catch (e) { console.log('FAIL', p.split('/').pop(), e.message); process.exit(1); }
}

console.log('技术栈加载 OK,尝试 Live2DModel.from()...');
const t0 = Date.now();
const timeout = setTimeout(() => { console.log('超时(可能卡在纹理/WebGL 步骤)'); process.exit(0); }, 15000);
try {
  const model = await vm.runInContext(`
    (async () => {
      const m = await PIXI.live2d.Live2DModel.from('/live2d/mingshi/mingshi.model3.json', { autoUpdate: false });
      return { ok: true, w: m.width, h: m.height, motions: m.internalModel ? Object.keys(m.internalModel.motionManager.motions || {}) : [] };
    })()
  `, sandbox);
  clearTimeout(timeout);
  console.log('模型加载成功!', JSON.stringify(model), '耗时', Date.now() - t0 + 'ms');
} catch (e) {
  clearTimeout(timeout);
  console.log('模型加载失败:', e && e.message, '| 耗时', Date.now() - t0 + 'ms');
}
