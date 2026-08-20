// 验证烘焙的动捕待机:应用到纳西妲骨骼,全程扫描姿态范围
import { MMDParser } from 'three/examples/jsm/libs/mmdparser.module.js';
import * as THREE from 'three';
import fs from 'node:fs';

const buf = fs.readFileSync('public/model/nahida/5th/nahida.pmx');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const data = new MMDParser.Parser().parsePmx(ab, true);
const idle = JSON.parse(fs.readFileSync('public/idle_motion.json', 'utf8'));

const bones = data.bones.map((b, i) => {
  const bo = new THREE.Bone();
  bo.name = b.name;
  bo.position.set(...b.position);
  return { bone: bo, parent: b.parentIndex >= 0 ? b.parentIndex : null, name: b.name };
});
bones.forEach((b, i) => { if (b.parent !== null) bones[b.parent].bone.add(b.bone); });
const roots = bones.filter(b => b.parent === null).map(b => b.bone);
const find = n => bones.find(x => x.name === n).bone;

const q = new THREE.Quaternion();
let minHeadX = 99, maxHeadX = -99, minHeadY = 99, maxHeadY = -99, minArm = 99, maxArm = -99, nan = 0;
const totalFrames = idle.bones['センター'].length / 4;

for (let f = 0; f < totalFrames; f += 4) { // 每 4 帧扫一次(共约 77 个采样点)
  // 重置所有骨骼为单位旋转
  for (const bo of bones) bo.bone.quaternion.set(0, 0, 0, 1);
  // 应用烘焙关键帧
  for (const [tgt, arr] of Object.entries(idle.bones)) {
    const i = f * 4;
    q.set(arr[i], arr[i + 1], arr[i + 2], arr[i + 3]);
    find(tgt).quaternion.copy(q);
  }
  // 程序化手臂(静态近似:极小的基础姿势)
  const armL = find('左腕'); armL.rotation.set(0, 0, 0.05);
  const elL = find('左ひじ'); elL.rotation.x = 0.12;
  const wrL = find('左手首'); wrL.rotation.x = 0.08;
  for (const r of roots) r.updateMatrixWorld(true);
  // 测量
  const headW = new THREE.Quaternion();
  find('頭').getWorldQuaternion(headW);
  const e = new THREE.Euler().setFromQuaternion(headW, 'YXZ');
  const hx = THREE.MathUtils.radToDeg(e.x), hy = THREE.MathUtils.radToDeg(e.y);
  if (!isFinite(hx + hy)) { nan++; continue; }
  if (hx < minHeadX) minHeadX = hx; if (hx > maxHeadX) maxHeadX = hx;
  if (hy < minHeadY) minHeadY = hy; if (hy > maxHeadY) maxHeadY = hy;
  const sh = new THREE.Vector3(); (find('左肩P') || find('左肩')).getWorldPosition(sh);
  const el = new THREE.Vector3(); elL.getWorldPosition(el);
  const d = el.clone().sub(sh);
  const a = Math.atan2(Math.hypot(d.x, d.z), d.y) * 180 / Math.PI;
  if (a < minArm) minArm = a; if (a > maxArm) maxArm = a;
}
console.log('烘焙动捕待机验证(约', totalFrames, '帧,采样', Math.ceil(totalFrames / 4), '点):');
console.log('  头 pitch 范围:', minHeadX.toFixed(1) + '° ~', maxHeadX.toFixed(1) + '°');
console.log('  头 yaw 范围:', minHeadY.toFixed(1) + '° ~', maxHeadY.toFixed(1) + '°');
console.log('  左臂偏垂角:', minArm.toFixed(1) + '° ~', maxArm.toFixed(1) + '°');
console.log('  NaN:', nan);
