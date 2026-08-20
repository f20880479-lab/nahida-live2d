// 检查 pixi-live2d-display cubism4 构建的核心版本最低要求
import fs from 'node:fs';

const l2d = fs.readFileSync('public/vendor/live2d/pixi-live2d-display-cubism4.min.js', 'utf8');
// 找版本检查/断言相关代码
const patterns = [
  /[Cc]ore[^;]{0,80}[Vv]ersion[^;]{0,120}/g,
  /[Vv]ersion[^;]{0,60}(>=|<=|>|<)[^;]{0,80}/g,
  /assert[^;]{0,150}/gi,
];
for (const p of patterns) {
  const m = [...l2d.matchAll(p)].slice(0, 6);
  if (m.length) {
    console.log('--- pattern ---');
    m.forEach(x => console.log(' ', x[0].slice(0, 160)));
  }
}
// 找 3.x / 4.x 相关常量
const verRefs = [...l2d.matchAll(/[34]\.[0-9]\.[0-9]|CSM_VERSION/g)];
console.log('版本常量引用:', verRefs.slice(0, 5).map(x => x[0]).join(', '));
