// 完整复现浏览器管线:动捕 + 程序化 + IK + Grants,测量视觉手臂(含扭转骨)
import { MMDParser } from 'three/examples/jsm/libs/mmdparser.module.js';
import * as THREE from 'three';
import fs from 'node:fs';

const buf = fs.readFileSync('public/model/nahida/5th/nahida.pmx');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const data = new MMDParser.Parser().parsePmx(ab, true);
const idle = JSON.parse(fs.readFileSync('public/idle_motion.json', 'utf8'));
for (const k of Object.keys(idle.bones)) idle.bones[k] = Float32Array.from(idle.bones[k]);

// 构建骨骼(带 grants 数据)
const boneObjs = data.bones.map((b, i) => {
  const bo = new THREE.Bone();
  bo.name = b.name;
  bo.position.set(...b.position);
  return { bone: bo, parent: b.parentIndex >= 0 ? b.parentIndex : null, name: b.name, grant: b.grant || null, index: i };
});
boneObjs.forEach((b, i) => { if (b.parent !== null) boneObjs[b.parent].bone.add(b.bone); });
const roots = boneObjs.filter(b => b.parent === null).map(b => b.bone);
const byName = {};
for (const b of boneObjs) byName[b.name] = b.bone;
const grants = boneObjs.filter(b => b.grant && !b.grant.isLocal && b.grant.affectRotation).map(b => ({
  index: b.index, parentIndex: b.grant.parentIndex, ratio: b.grant.ratio,
}));
console.log('grants 数(浏览器 solveGrants 会处理的):', grants.length);

const _iqA = new THREE.Quaternion(), _iqB = new THREE.Quaternion();
function applyIdleMotion(t) {
  const boneArr = idle.bones, n = boneArr['センター'].length / 4, dur = n / idle.fps;
  const ft = ((t % dur) + dur) % dur * idle.fps;
  const f0 = Math.floor(ft) % n, f1 = (f0 + 1) % n, frac = ft - Math.floor(ft);
  const s = frac * frac * (3 - 2 * frac);
  for (const [name, arr] of Object.entries(boneArr)) {
    const bone = byName[name]; if (!bone) continue;
    const i0 = f0 * 4, i1 = f1 * 4;
    _iqA.set(arr[i0], arr[i0+1], arr[i0+2], arr[i0+3]);
    _iqB.set(arr[i1], arr[i1+1], arr[i1+2], arr[i1+3]);
    bone.quaternion.slerpQuaternions(_iqA, _iqB, s);
  }
}
// 复刻 app.js 的 solveGrants
const _grantQ = new THREE.Quaternion();
function solveGrants() {
  const solved = new Set();
  const solveOne = (g) => {
    if (solved.has(g.index)) return;
    solved.add(g.index);
    const bone = boneObjs[g.index].bone;
    if (!bone) return;
    bone.quaternion.set(0, 0, 0, 1);
    const parent = boneObjs[g.parentIndex];
    if (!parent) return;
    const pg = grants.find(x => x.index === g.parentIndex);
    if (pg) solveOne(pg);
    _grantQ.set(0, 0, 0, 1).slerp(parent.bone.quaternion, g.ratio);
    bone.quaternion.multiply(_grantQ);
  };
  for (const g of grants) solveOne(g);
}

const wp = b => { const v = new THREE.Vector3(); b.getWorldPosition(v); return v; };
console.log('\n时间 | 肩→肘角度 | 肘→手角度 | 扭转骨1/2/3 世界偏垂角');
for (let t = 0; t < idle.duration; t += 0.3) {
  for (const b of boneObjs) b.bone.quaternion.set(0, 0, 0, 1);
  applyIdleMotion(t);
  // 程序化手臂叠加(微噪声)
  const aq = new THREE.Quaternion();
  const armL = byName['左腕'];
  aq.setFromEuler(new THREE.Euler(0.01, 0.01, 0.02)); armL.quaternion.multiply(aq);
  // grants(浏览器里在 IK 之后跑)
  solveGrants();
  for (const r of roots) r.updateMatrixWorld(true);
  const sh = wp(byName['左肩P'] || byName['左肩']);
  const el = wp(byName['左ひじ']);
  const wr = wp(byName['左手首']);
  const d1 = el.clone().sub(sh), d2 = wr.clone().sub(el);
  const a1 = Math.atan2(Math.hypot(d1.x, d1.z), d1.y) * 180 / Math.PI;
  const a2 = Math.atan2(Math.hypot(d2.x, d2.z), d2.y) * 180 / Math.PI;
  // 扭转骨
  const tw = [];
  for (const tn of ['左腕捩1', '左腕捩2', '左腕捩3']) {
    if (byName[tn]) {
      const p = wp(byName[tn]);
      const dd = p.clone().sub(sh);
      tw.push(Math.atan2(Math.hypot(dd.x, dd.z), dd.y) * 180 / Math.PI);
    }
  }
  if (Math.round(t * 10) % 6 === 0 || t < 1)
    console.log(t.toFixed(1) + 's | ' + a1.toFixed(1) + '° | ' + a2.toFixed(1) + '° | ' + tw.map(x => x.toFixed(0) + '°').join('/'));
}
