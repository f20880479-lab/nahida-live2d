// 数值扫描 v3 待机姿态(60s):验证手臂角度、头颈角度稳定自然、无 NaN
import { MMDParser } from 'three/examples/jsm/libs/mmdparser.module.js';
import * as THREE from 'three';
import fs from 'node:fs';

const buf = fs.readFileSync('public/model/nahida/5th/nahida.pmx');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const data = new MMDParser.Parser().parsePmx(ab, true);

function vnoise(seed, x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); const h1 = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453, h2 = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453; return (h1 - Math.floor(h1)) + ((h2 - Math.floor(h2)) - (h1 - Math.floor(h1))) * u; }
function fbm(seed, x, oct = 3) { let s = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { s += vnoise(seed + o * 17.31, x * f) * a; n += a; a *= 0.5; f *= 2.03; } return (s / n) * 2 - 1; }
function flow(seed, freq, tt) { return fbm(seed * 100 + 7.7, tt * freq * 2.1, 3) * 0.85; }
function n1(seed, tt) { return Math.sin(tt * 1.7 + seed * 3.1) * 0.5 + Math.sin(tt * 3.3 + seed * 7.7) * 0.3 + Math.sin(tt * 0.71 + seed * 13.1) * 0.2; }

let minArm = 99, maxArm = -99, minHY = 99, maxHY = -99, nanCnt = 0;
for (let tt = 0; tt <= 60; tt += 1) {
  const bones = data.bones.map((b, i) => { const bo = new THREE.Bone(); bo.name = b.name; bo.position.set(...b.position); return { bone: bo, parent: b.parentIndex >= 0 ? b.parentIndex : null, name: b.name }; });
  bones.forEach((b, i) => { if (b.parent !== null) bones[b.parent].bone.add(b.bone); });
  const roots = bones.filter(b => b.parent === null).map(b => b.bone);
  const find = n => bones.find(x => x.name === n).bone;
  const t = tt;
  const wShift = flow(1, 0.20, t), sway = flow(2, 0.13, t);
  const posture = 0.01 + flow(3, 0.09, t) * 0.035;
  const breath = Math.sin(t) * 0.035, breathL = Math.sin(t - 0.2) * 0.02;
  const wtx = Math.sin(t * 0.16) * 0.06 + flow(12, 0.07, t) * 0.03, wtz = Math.sin(t * 0.11 + 1.3) * 0.05 + flow(11, 0.06, t) * 0.03;
  const cen = find('センター'); cen.rotation.z = wShift * 0.075 + wtx * 0.5; cen.rotation.y = sway * 0.06; cen.rotation.x = breath * 0.5 + wtz * 0.6;
  const hip = find('腰'); hip.rotation.z = -wShift * 0.045 - wtx * 0.5;
  const low = find('下半身'); low.rotation.x = breath * 0.35 + posture * 0.4 - wtz * 0.45;
  const up = find('上半身'); up.rotation.x = breath * 1.0 + posture * 0.8 - wtz * 0.3; up.rotation.z = -wShift * 0.07 - wtx * 0.35; up.rotation.y = sway * 0.035;
  const s2 = find('上半身2'); s2.rotation.x = breath * 0.3 + posture * 0.2 - wtz * 0.2;
  const s3 = find('上半身3'); s3.rotation.z = -wShift * 0.03 - wtx * 0.15;
  const a0 = flow(5, 0.23, t), a1 = flow(5, 0.23, t - 0.28), a2 = flow(5, 0.23, t - 0.56);
  const b0 = flow(6, 0.21, t), b1 = flow(6, 0.21, t - 0.28), b2 = flow(6, 0.21, t - 0.56);
  const armL = find('左腕'); armL.rotation.set(breath * 0.1 + breathL * 1.2 + a0 * 0.045 + n1(2, t) * 0.02, a1 * 0.02 + n1(3, t) * 0.015, 0.05 + wShift * 0.05 + sway * 0.03 + a0 * 0.06 + n1(4, t) * 0.025);
  const elL = find('左ひじ'); elL.rotation.x = 0.12 + a1 * 0.11 + a2 * 0.04 + n1(6, t) * 0.03;
  const wrL = find('左手首'); wrL.rotation.x = 0.08 + a2 * 0.10 + n1(8, t) * 0.05; wrL.rotation.y = a1 * 0.04 + n1(9, t) * 0.05;
  const neck = find('首'); neck.rotation.x = -0.35 * (posture * 0.4 - wtz * 0.15) + n1(10, t) * 0.01; neck.rotation.y = 0.4 * (-wtx * 0.12) + n1(11, t) * 0.01;
  const head = find('頭'); head.rotation.x = -0.3 * (posture * 0.4 - wtz * 0.15) + n1(12, t) * 0.008; head.rotation.y = 0.3 * (-wtx * 0.12) + n1(13, t) * 0.008;
  for (const r of roots) r.updateMatrixWorld(true);
  const sh = new THREE.Vector3(); (find('左肩P') || find('左肩')).getWorldPosition(sh);
  const el = new THREE.Vector3(); elL.getWorldPosition(el);
  const d = el.clone().sub(sh);
  const ang = Math.atan2(Math.hypot(d.x, d.z), d.y) * 180 / Math.PI;
  if (!isFinite(ang)) { nanCnt++; continue; }
  if (ang < minArm) minArm = ang; if (ang > maxArm) maxArm = ang;
  const hy = neck.rotation.y + head.rotation.y;
  if (hy < minHY) minHY = hy; if (hy > maxHY) maxHY = hy;
}
console.log('60s 扫描结果:');
console.log('  左臂偏垂角范围:', minArm.toFixed(1) + '° ~', maxArm.toFixed(1) + '° (目标 3~12°,全程自然下垂)');
console.log('  头颈 yaw 合计范围:', (minHY * 180 / Math.PI).toFixed(1) + '° ~', (maxHY * 180 / Math.PI).toFixed(1) + '° (目标 ±8° 内)');
console.log('  NaN 帧数:', nanCnt);
