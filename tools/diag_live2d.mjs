// 诊断:Cubism 核心版本 / moc3 版本 / display 兼容性
import fs from 'node:fs';

const core = fs.readFileSync('public/vendor/live2d/live2dcubismcore.min.js', 'utf8');
const ver = core.match(/version['"]?\s*[:=]\s*['"]([^'"]+)['"]/i);
console.log('核心版本标记:', ver ? ver[1] : '未找到');

const moc = fs.readFileSync('public/live2d/mingshi/mingshi.moc3');
console.log('moc3 大小:', moc.length, '| 头 20 字节:', [...moc.slice(0, 20)].join(','));

const l2d = fs.readFileSync('public/vendor/live2d/pixi-live2d-display.min.js', 'utf8');
// display 库如何调用核心(找 Live2DCubismCore 使用点)
const uses = [...l2d.matchAll(/Live2DCubismCore\.(\w+)/g)].map(m => m[1]);
console.log('display 调用的核心 API:', [...new Set(uses)].slice(0, 20).join(', '));
// 版本检查逻辑
const vc = l2d.match(/checkVersion[^}]{0,200}/i);
if (vc) console.log('版本检查:', vc[0].slice(0, 200));
