// 模拟浏览器完整待机管线(动捕基底 + 程序化上层),扫描验证关键角度
import { MMDParser } from 'three/examples/jsm/libs/mmdparser.module.js';
import * as THREE from 'three';
import fs from 'node:fs';

const buf = fs.readFileSync('public/model/nahida/5th/nahida.pmx');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const data = new MMDParser.Parser().parsePmx(ab, true);
const idle = JSON.parse(fs.readFileSync('public/idle_motion.json', 'utf8'));
for (const k of Object.keys(idle.bones)) idle.bones[k] = Float32Array.from(idle.bones[k]);

function vnoise(seed, x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); const h1 = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453, h2 = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453; return (h1 - Math.floor(h1)) + ((h2 - Math.floor(h2)) - (h1 - Math.floor(h1))) * u; }
function fbm(seed, x, oct = 3) { let s = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { s += vnoise(seed + o * 17.31, x * f) * a; n += a; a *= 0.5; f *= 2.03; } return (s / n) * 2 - 1; }
function flow(seed, freq, tt) { return fbm(seed * 100 + 7.7, tt * freq * 2.1, 3) * 0.85; }
function n1(seed, tt) { return Math.sin(tt * 1.7 + seed * 3.1) * 0.5 + Math.sin(tt * 3.3 + seed * 7.7) * 0.3 + Math.sin(tt * 0.71 + seed * 13.1) * 0.2; }

// 骨骼构建
const boneObjs = data.bones.map((b, i) => {
  const bo = new THREE.Bone();
  bo.name = b.name;
  bo.position.set(...b.position);
  return { bone: bo, parent: b.parentIndex >= 0 ? b.parentIndex : null, name: b.name };
});
boneObjs.forEach((b, i) => { if (b.parent !== null) boneObjs[b.parent].bone.add(b.bone); });
const roots = boneObjs.filter(b => b.parent === null).map(b => b.bone);
const byName = {};
for (const b of boneObjs) byName[b.name] = b.bone;

const _iqA = new THREE.Quaternion(), _iqB = new THREE.Quaternion();
function applyIdleMotion(t) {
  const boneArr = idle.bones;
  const n = boneArr['センター'].length / 4;
  const dur = n / idle.fps;
  const ft = ((t % dur) + dur) % dur * idle.fps;
  const f0 = Math.floor(ft) % n, f1 = (f0 + 1) % n, frac = ft - Math.floor(ft);
  for (const [name, arr] of Object.entries(boneArr)) {
    const bone = byName[name];
    if (!bone) continue;
    const i0 = f0 * 4, i1 = f1 * 4;
    _iqA.set(arr[i0], arr[i0 + 1], arr[i0 + 2], arr[i0 + 3]);
    _iqB.set(arr[i1], arr[i1 + 1], arr[i1 + 2], arr[i1 + 3]);
    bone.quaternion.slerpQuaternions(_iqA, _iqB, frac);
  }
}

let minHeadY = 99, maxHeadY = -99, minHeadP = 99, maxHeadP = -99, minArm = 99, maxArm = -99, minHipY = 99, maxHipY = -99, nan = 0;
const tMax = idle.duration;

for (let t = 0; t <= tMax; t += 0.25) {
  // 重置
  for (const b of boneObjs) b.bone.quaternion.set(0, 0, 0, 1);
  // 1) 动捕基底
  applyIdleMotion(t);
  // 2) 程序化上层(与 app.js 同公式)
  const wShift = flow(1, 0.20, t), sway = flow(2, 0.13, t);
  const posture = 0.01 + flow(3, 0.09, t) * 0.035;
  const breathPhase = t * 1.1;
  const breath = Math.sin(breathPhase) * 0.035;
  const breathL = Math.sin(breathPhase - 0.2) * 0.02;
  const wtx = Math.sin(t * 0.16) * 0.06 + flow(12, 0.07, t) * 0.03;
  const wtz = Math.sin(t * 0.11 + 1.3) * 0.05 + flow(11, 0.06, t) * 0.03;
  const hip = byName['腰']; hip.rotation.z = -wtx * 0.4;
  const up = byName['上半身']; up.rotation.x = breath * 1.0 + posture * 0.8 - wtz * 0.3; up.rotation.z = -wShift * 0.07 - wtx * 0.35; up.rotation.y = sway * 0.035;
  const s2 = byName['上半身2']; s2.rotation.x = breath * 0.3 + posture * 0.2 - wtz * 0.2;
  const s3 = byName['上半身3']; s3.rotation.z = -wShift * 0.03 - wtx * 0.15;
  const a0 = flow(5, 0.23, t), a1 = flow(5, 0.23, t - 0.28), a2 = flow(5, 0.23, t - 0.56);
  const b0 = flow(6, 0.21, t), b1 = flow(6, 0.21, t - 0.28), b2 = flow(6, 0.21, t - 0.56);
  // 手臂:动捕已驱动 腕/ひじ/手首 → 叠加微生命噪声
  const aq2 = new THREE.Quaternion();
  const armL = byName['左腕']; aq2.setFromEuler(new THREE.Euler(n1(2, t) * 0.02, n1(3, t) * 0.015, n1(4, t) * 0.02)); armL.quaternion.multiply(aq2);
  const armR = byName['右腕']; aq2.setFromEuler(new THREE.Euler(n1(5, t) * 0.02, n1(6, t) * 0.015, n1(7, t) * 0.02)); armR.quaternion.multiply(aq2);
  const elL = byName['左ひじ']; aq2.setFromEuler(new THREE.Euler(n1(8, t) * 0.03, 0, 0)); elL.quaternion.multiply(aq2);
  const elR = byName['右ひじ']; aq2.setFromEuler(new THREE.Euler(n1(9, t) * 0.03, 0, 0)); elR.quaternion.multiply(aq2);
  const wrL = byName['左手首']; aq2.setFromEuler(new THREE.Euler(n1(10, t) * 0.05, n1(11, t) * 0.05, 0)); wrL.quaternion.multiply(aq2);
  const wrR = byName['右手首']; aq2.setFromEuler(new THREE.Euler(n1(12, t) * 0.05, n1(13, t) * 0.05, 0)); wrR.quaternion.multiply(aq2);
  // 头部口音(无场景/手势,只加微噪)
  const neck = byName['首'], headB = byName['頭'];
  const aq = new THREE.Quaternion();
  aq.setFromEuler(new THREE.Euler(n1(14, t) * 0.01, n1(15, t) * 0.01, 0));
  neck.quaternion.multiply(aq);
  aq.setFromEuler(new THREE.Euler(n1(16, t) * 0.008, n1(17, t) * 0.008, 0));
  headB.quaternion.multiply(aq);

  for (const r of roots) r.updateMatrixWorld(true);
  // 测量
  const hw = new THREE.Quaternion(); headB.getWorldQuaternion(hw);
  const e = new THREE.Euler().setFromQuaternion(hw, 'YXZ');
  const hy = e.y * 180 / Math.PI, hp = e.x * 180 / Math.PI;
  if (!isFinite(hy + hp)) { nan++; continue; }
  if (hy < minHeadY) minHeadY = hy; if (hy > maxHeadY) maxHeadY = hy;
  if (hp < minHeadP) minHeadP = hp; if (hp > maxHeadP) maxHeadP = hp;
  const sh = new THREE.Vector3(); (byName['左肩P'] || byName['左肩']).getWorldPosition(sh);
  const el = new THREE.Vector3(); elL.getWorldPosition(el);
  const a = Math.atan2(Math.hypot(el.x - sh.x, el.z - sh.z), el.y - sh.y) * 180 / Math.PI;
  if (a < minArm) minArm = a; if (a > maxArm) maxArm = a;
  // 骨盆世界 yaw
  const hwq = new THREE.Quaternion(); byName['センター'].getWorldQuaternion(hwq);
  const eh = new THREE.Euler().setFromQuaternion(hwq, 'YXZ');
  const hyy = eh.y * 180 / Math.PI;
  if (hyy < minHipY) minHipY = hyy; if (hyy > maxHipY) maxHipY = hyy;
}
console.log('完整管线扫描(' + tMax + 's, 动捕+程序化):');
console.log('  头 yaw:', minHeadY.toFixed(1) + '° ~', maxHeadY.toFixed(1) + '° (目标 ±25° 内)');
console.log('  头 pitch:', minHeadP.toFixed(1) + '° ~', maxHeadP.toFixed(1) + '° (目标 -15°~+10°)');
console.log('  骨盆 yaw:', minHipY.toFixed(1) + '° ~', maxHipY.toFixed(1) + '° (目标 ±15° 内)');
console.log('  左臂偏垂角:', minArm.toFixed(1) + '° ~', maxArm.toFixed(1) + '° (目标 3~12°)');
console.log('  NaN:', nan);
