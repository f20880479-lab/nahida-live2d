// 沙箱 + XHR stub:深入验证 Live2DModel.from() 的完整加载链路
import fs from 'node:fs';
import vm from 'node:vm';

const files = {
  '/live2d/mingshi/mingshi.model3.json': 'public/live2d/mingshi/mingshi.model3.json',
  '/live2d/mingshi/mingshi.moc3': 'public/live2d/mingshi/mingshi.moc3',
  '/live2d/mingshi/textures/texture_00.png': 'public/live2d/mingshi/textures/texture_00.png',
  '/live2d/mingshi/mingshi.physics3.json': 'public/live2d/mingshi/mingshi.physics3.json',
};
// 动作文件按 model3.json 引用补齐
const m3 = JSON.parse(fs.readFileSync(files['/live2d/mingshi/mingshi.model3.json'], 'utf8'));
for (const g of Object.values(m3.FileReferences.Motions)) for (const el of g) {
  files['/live2d/mingshi/' + el.File] = 'public/live2d/mingshi/' + el.File;
}

class XHRStub {
  open(method, url) { this.url = url; this.method = method; }
  setRequestHeader() {}
  send() {
    const key = this.url.split('?')[0];
    const file = files[key];
    if (!file || !fs.existsSync(file)) {
      console.log('  [XHR 404]', key);
      this.status = 404;
      this.readyState = 4;
      this.onreadystatechange && this.onreadystatechange();
      return;
    }
    const data = fs.readFileSync(file);
    this.status = 200;
    this.response = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.responseText = data.toString('utf8');
    this.responseType = '';
    this.readyState = 4;
    this.onreadystatechange && this.onreadystatechange();
  }
  addEventListener(ev, fn) { if (ev === 'load') this.onload = fn; if (ev === 'error') this.onerror = fn; }
}

const sandbox = {
  console, globalThis: null, self: null, window: null,
  XMLHttpRequest: XHRStub,
  navigator: { userAgent: 'node', platform: 'Node' },
  document: { createElement: () => ({ style: {}, getContext: () => null, addEventListener() {} }), addEventListener() {}, head: { appendChild() {} } },
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  performance: { now: () => Date.now() },
  Image: function () {},
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
};
sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);

for (const p of ['public/vendor/live2d/live2dcubismcore.min.js', 'public/vendor/live2d/pixi.min.js', 'public/vendor/live2d/pixi-live2d-display-cubism4.min.js']) {
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: p }); }
  catch (e) { console.log('FAIL', p.split('/').pop(), e.message); process.exit(1); }
}

console.log('技术栈 OK,执行 Live2DModel.from()...');
const timeout = setTimeout(() => { console.log('→ 超时(卡在某步,通常是无 WebGL 的纹理加载)'); process.exit(0); }, 20000);
try {
  const result = await vm.runInContext(`
    (async () => {
      const m = await PIXI.live2d.Live2DModel.from('/live2d/mingshi/mingshi.model3.json', { autoUpdate: false });
      const mm = m.internalModel && m.internalModel.motionManager;
      return {
        width: m.width, height: m.height,
        motionGroups: mm ? Object.keys(mm.motions || {}) : [],
        motionCount: mm ? Object.values(mm.motions || {}).reduce((a, v) => a + v.length, 0) : 0,
      };
    })()
  `, sandbox);
  clearTimeout(timeout);
  console.log('✅ 模型完整加载成功:', JSON.stringify(result));
} catch (e) {
  clearTimeout(timeout);
  console.log('❌ 模型加载失败:', e && e.message);
}
