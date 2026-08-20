// 对比 cubism4.min.js 需要的核心 API vs 3.3.0 核心实际导出的 API
import fs from 'node:fs';
import vm from 'node:vm';

// 1) cubism4.min.js 调用了哪些 Live2DCubismCore 成员
const l2d = fs.readFileSync('public/vendor/live2d/pixi-live2d-display-cubism4.min.js', 'utf8');
const called = [...l2d.matchAll(/Live2DCubismCore\.(\w+)/g)].map(m => m[1]);
const uniqueCalled = [...new Set(called)];
console.log('cubism4.min.js 调用的核心成员:');
console.log(uniqueCalled.join(', '));

// 2) 3.3.0 核心实际导出了什么
const sandbox = {
  console, globalThis: null, self: null, window: null,
  document: { createElement: () => ({ getContext: () => null, width: 0, height: 0, style: {}, addEventListener() {} }), addEventListener() {}, head: { appendChild() {} } },
  navigator: { userAgent: 'node', platform: 'Node' },
};
sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('public/vendor/live2d/live2dcubismcore.min.js', 'utf8'), sandbox);
const exports = vm.runInContext('Object.keys(Live2DCubismCore)', sandbox);
console.log('\n3.3.0 核心导出:');
console.log(exports.join(', '));

// 3) 缺失的成员
const missing = uniqueCalled.filter(x => !exports.includes(x));
console.log('\n库需要但核心缺失的:', missing.length ? missing.join(', ') : '无 ✓');
