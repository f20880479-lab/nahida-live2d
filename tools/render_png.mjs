// Node 离屏渲染:对模型做蒙皮变形 → 简单光栅化 → 输出 PNG(用于视觉验证)
// 用法:node tools/render_png.mjs [输出] [camX] [camY] [camZ] [lookX] [lookY] [lookZ] [morph名称] [morph权重]
import { MMDParser } from 'three/examples/jsm/libs/mmdparser.module.js';
import * as THREE from 'three';
import fs from 'node:fs';
import zlib from 'node:zlib';

const OUT = process.argv[2] || 'tools/render_out.png';
const CAM = {
  x: parseFloat(process.argv[3] ?? 0),
  y: parseFloat(process.argv[4] ?? 1.375),
  z: parseFloat(process.argv[5] ?? 1.39),
  lx: parseFloat(process.argv[6] ?? 0),
  ly: parseFloat(process.argv[7] ?? 1.375),
  lz: parseFloat(process.argv[8] ?? 0),
};
const MORPH_NAME = process.argv[9] || '';
const MORPH_W = parseFloat(process.argv[10] ?? 1);
const buf = fs.readFileSync('public/model/nahida/5th/nahida.pmx');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const data = new MMDParser.Parser().parsePmx(ab, true);

// ---------- 归一化参数(与浏览器一致:身高→1.7,脚底 y=0) ----------
let minY = 1e9, maxY = -1e9;
for (const v of data.vertices) { if (v.position[1] < minY) minY = v.position[1]; if (v.position[1] > maxY) maxY = v.position[1]; }
const NORM_SCALE = 1.7 / (maxY - minY);
const NORM_OFFSET = -minY * NORM_SCALE;

// ---------- 构建骨骼(静止=单位旋转) ----------
const boneObjs = data.bones.map((b, i) => {
  const bone = new THREE.Bone();
  bone.name = b.name;
  bone.position.set(...b.position);
  return { bone, parent: b.parentIndex >= 0 ? b.parentIndex : null, name: b.name };
});
boneObjs.forEach((b, i) => { if (b.parent !== null) boneObjs[b.parent].bone.add(b.bone); });
// 找到真正的层级根(可能不是 0 号骨骼!)并更新所有根的矩阵
const roots = boneObjs.filter(b => b.parent === null).map(b => b.bone);
for (const r of roots) r.updateMatrixWorld(true);

// 绑定逆矩阵(静止姿势下骨骼单位旋转,world = 位置累积)
const bindInverse = boneObjs.map(b => b.bone.matrixWorld.clone().invert());

// ---------- 应用姿势矫正(基于数值测量:纳西妲静止时上臂本就自然下垂约 7°,仅极轻微内收) ----------
// 默认 z=0.05/-0.05;可用 argv[11]/argv[12] 临时覆盖(调参验证用)
const ARM = {
  L: { x: parseFloat(process.argv[11] ?? 0.0), y: 0.0, z: parseFloat(process.argv[12] ?? 0.05) },
  R: { x: parseFloat(process.argv[11] ?? 0.0), y: 0.0, z: parseFloat(process.argv[12] ?? -0.05) },
};
const find = n => boneObjs.find(x => x.name === n).bone;

// ---------- 可选:套用 VMD 某帧姿态(用于验证动作窗口) ----------
// 用法:第 9 个参数 = VMD 路径,第 10 个参数 = 帧号
const VMD_PATH = (process.argv[9] || '').endsWith('.vmd') ? process.argv[9] : '';
const VMD_FRAME = parseFloat(process.argv[10] ?? 0);
// 可选:待机动画模式(复刻浏览器 app.js 的有机噪声系统,验证姿态自然度)
// 用法:第 9 个参数 = "idle",第 10 个参数 = 时间 t(秒)
const IDLE_T = (process.argv[9] || '') === 'idle' ? parseFloat(process.argv[10] ?? 0) : NaN;
if (VMD_PATH) {
  const { MMDParser } = await import('three/examples/jsm/libs/mmdparser.module.js');
  const vbuf = fs.readFileSync(VMD_PATH);
  const vmd = new MMDParser.Parser().parseVmd(vbuf.buffer.slice(vbuf.byteOffset, vbuf.byteOffset + vbuf.byteLength), true);
  // 按骨骼分组,取目标帧前"最大帧号"的关键帧(数组并非按帧排序!)
  const byBone = {};
  for (const k of vmd.motions) (byBone[k.boneName] = byBone[k.boneName] || []).push(k);
  let applied = 0;
  for (const [bn, list] of Object.entries(byBone)) {
    const b = boneObjs.find(x => x.name === bn);
    if (!b) continue;
    let best = null;
    for (const k of list) if (k.frameNum <= VMD_FRAME && (!best || k.frameNum > best.frameNum)) best = k;
    if (!best) continue;
    b.bone.quaternion.set(best.rotation[0], best.rotation[1], best.rotation[2], best.rotation[3]);
    applied++;
  }
  console.log('VMD 姿态应用:', applied, '根骨骼');
} else if (!Number.isNaN(IDLE_T)) {
  // ===== 复刻浏览器待机(值噪声 + 重心转移 + 关节链延迟),t 为时间 =====
  const t = IDLE_T;
  function vnoise(seed, x) {
    const i = Math.floor(x), f = x - i;
    const u = f * f * (3 - 2 * f);
    const h1 = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    const h2 = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    return (h1 - Math.floor(h1)) + ((h2 - Math.floor(h2)) - (h1 - Math.floor(h1))) * u;
  }
  function fbm(seed, x, octaves = 3) {
    let sum = 0, amp = 0.5, f = 1, n = 0;
    for (let o = 0; o < octaves; o++) { sum += vnoise(seed + o * 17.31, x * f) * amp; n += amp; amp *= 0.5; f *= 2.03; }
    return (sum / n) * 2 - 1;
  }
  function flow(seed, freq, tt = t) { return fbm(seed * 100 + 7.7, tt * freq * 2.1, 3) * 0.85; }
  function noise1(seed, tt = t) {
    return Math.sin(tt * 1.7 + seed * 3.1) * 0.5 + Math.sin(tt * 3.3 + seed * 7.7) * 0.3 + Math.sin(tt * 0.71 + seed * 13.1) * 0.2;
  }
  const wShift = flow(1, 0.20), sway = flow(2, 0.13);
  const posture = 0.01 + flow(3, 0.09) * 0.035;
  const breath = Math.sin(t) * 0.035;
  const breathL = Math.sin(t - 0.2) * 0.02;
  const wtx = Math.sin(t * 0.16) * 0.06 + flow(12, 0.07) * 0.03;
  const wtz = Math.sin(t * 0.11 + 1.3) * 0.05 + flow(11, 0.06) * 0.03;
  const by = n => boneObjs.find(x => x.name === n).bone;
  const center = by('センター'); center.rotation.z = wShift * 0.075 + wtx * 0.5; center.rotation.y = sway * 0.06; center.rotation.x = breath * 0.5 + wtz * 0.6;
  const hip = by('腰'); hip.rotation.z = -wShift * 0.045 - wtx * 0.5;
  const lower = by('下半身'); lower.rotation.x = breath * 0.35 + posture * 0.4 - wtz * 0.45;
  const up = by('上半身'); up.rotation.x = breath * 1.0 + posture * 0.8 - wtz * 0.3; up.rotation.z = -wShift * 0.07 - wtx * 0.35; up.rotation.y = sway * 0.035;
  const s2 = by('上半身2'); s2.rotation.x = breath * 0.3 + posture * 0.2 - wtz * 0.2;
  const s3 = by('上半身3'); s3.rotation.z = -wShift * 0.03 - wtx * 0.15;
  const legL = by('左足'); legL.rotation.x = wtz * 0.25;
  const legR = by('右足'); legR.rotation.x = -wtz * 0.25;
  const shL = by('左肩P') || by('左肩'); shL.rotation.x = breath * 1.2 + noise1(0) * 0.012;
  const shR = by('右肩P') || by('右肩'); shR.rotation.x = breath * 1.2 + noise1(1) * 0.012;
  const a0 = flow(5, 0.23), a1 = flow(5, 0.23, t - 0.28), a2 = flow(5, 0.23, t - 0.56);
  const b0 = flow(6, 0.21), b1 = flow(6, 0.21, t - 0.28), b2 = flow(6, 0.21, t - 0.56);
  const armL = by('左腕'); armL.rotation.set(ARM.L.x + breath * 0.1 + breathL * 1.2 + a0 * 0.045 + noise1(2) * 0.02, ARM.L.y + a1 * 0.02 + noise1(2 + 1) * 0.015, ARM.L.z + wShift * 0.05 + sway * 0.03 + a0 * 0.06 + noise1(2 + 2) * 0.025);
  const armR = by('右腕'); armR.rotation.set(ARM.R.x + breath * 0.1 + breathL * 1.2 + b0 * 0.045 + noise1(3) * 0.02, ARM.R.y + b1 * 0.02 + noise1(3 + 1) * 0.015, ARM.R.z - wShift * 0.05 - sway * 0.03 + b0 * 0.06 + noise1(3 + 2) * 0.025);
  const elL = by('左ひじ'); elL.rotation.x = 0.12 + a1 * 0.11 + a2 * 0.04 + noise1(4) * 0.03;
  const elR = by('右ひじ'); elR.rotation.x = 0.12 - b1 * 0.09 - b2 * 0.03 + noise1(5) * 0.03;
  const wrL = by('左手首'); wrL.rotation.x = 0.08 + a2 * 0.10 + noise1(6) * 0.05; wrL.rotation.y = a1 * 0.04 + noise1(6 + 1) * 0.05;
  const wrR = by('右手首'); wrR.rotation.x = 0.08 - b2 * 0.09 + noise1(7) * 0.05; wrR.rotation.y = b1 * 0.04 + noise1(7 + 1) * 0.05;
  const neck = by('首'); neck.rotation.x = -0.35 * (posture * 0.4 - wtz * 0.15) + noise1(8) * 0.01; neck.rotation.y = 0.4 * (-wtx * 0.12) + noise1(9) * 0.01; neck.rotation.z = 0;
  const head = by('頭'); head.rotation.x = -0.3 * (posture * 0.4 - wtz * 0.15) + noise1(10) * 0.008; head.rotation.y = 0.3 * (-wtx * 0.12) + noise1(11) * 0.008; head.rotation.z = 0;
  console.log('待机动画已应用 @ t=' + t.toFixed(1) + 's(值噪声 + 重心转移 + 关节链)');
}
// 可选:动捕待机模式(模拟浏览器:动捕基底 + 程序化上层)
// 用法:第 9 个参数 = "mocap",第 10 个参数 = 时间 t(秒)
const MOCAP_T = (process.argv[9] || '') === 'mocap' ? parseFloat(process.argv[10] ?? 0) : NaN;
if (!Number.isNaN(MOCAP_T)) {
  const t = MOCAP_T;
  const idle = JSON.parse(fs.readFileSync('public/idle_motion.json', 'utf8'));
  function vnoise(seed, x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); const h1 = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453, h2 = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453; return (h1 - Math.floor(h1)) + ((h2 - Math.floor(h2)) - (h1 - Math.floor(h1))) * u; }
  function fbm(seed, x, oct = 3) { let s = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { s += vnoise(seed + o * 17.31, x * f) * a; n += a; a *= 0.5; f *= 2.03; } return (s / n) * 2 - 1; }
  function flow(seed, freq, tt) { return fbm(seed * 100 + 7.7, tt * freq * 2.1, 3) * 0.85; }
  function n1(seed, tt) { return Math.sin(tt * 1.7 + seed * 3.1) * 0.5 + Math.sin(tt * 3.3 + seed * 7.7) * 0.3 + Math.sin(tt * 0.71 + seed * 13.1) * 0.2; }
  const by = n => boneObjs.find(x => x.name === n).bone;
  // 1) 动捕基底
  const boneArr = idle.bones;
  const nf = boneArr['センター'].length / 4;
  const ft = ((t % idle.duration) + idle.duration) % idle.duration * idle.fps;
  const f0 = Math.floor(ft) % nf, f1 = (f0 + 1) % nf, frac = ft - Math.floor(ft);
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
  for (const [name, arr] of Object.entries(boneArr)) {
    const b = boneObjs.find(x => x.name === name);
    if (!b) continue;
    const i0 = f0 * 4, i1 = f1 * 4;
    qA.set(arr[i0], arr[i0 + 1], arr[i0 + 2], arr[i0 + 3]);
    qB.set(arr[i1], arr[i1 + 1], arr[i1 + 2], arr[i1 + 3]);
    b.bone.quaternion.slerpQuaternions(qA, qB, frac);
  }
  // 2) 程序化上层
  const wShift = flow(1, 0.20, t), sway = flow(2, 0.13, t);
  const posture = 0.01 + flow(3, 0.09, t) * 0.035;
  const breath = Math.sin(t * 1.1) * 0.035;
  const breathL = Math.sin(t * 1.1 - 0.2) * 0.02;
  const wtx = Math.sin(t * 0.16) * 0.06 + flow(12, 0.07, t) * 0.03;
  const wtz = Math.sin(t * 0.11 + 1.3) * 0.05 + flow(11, 0.06, t) * 0.03;
  const hip = by('腰'); hip.rotation.z = -wtx * 0.4;
  const upBone = by('上半身'); upBone.rotation.x = breath * 1.0 + posture * 0.8 - wtz * 0.3; upBone.rotation.z = -wShift * 0.07 - wtx * 0.35; upBone.rotation.y = sway * 0.035;
  const s2 = by('上半身2'); s2.rotation.x = breath * 0.3 + posture * 0.2 - wtz * 0.2;
  const s3 = by('上半身3'); s3.rotation.z = -wShift * 0.03 - wtx * 0.15;
  const shL = by('左肩P') || by('左肩'); shL.rotation.x = breath * 1.2 + n1(0, t) * 0.012;
  const shR = by('右肩P') || by('右肩'); shR.rotation.x = breath * 1.2 + n1(1, t) * 0.012;
  const a0 = flow(5, 0.23, t), a1 = flow(5, 0.23, t - 0.28), a2 = flow(5, 0.23, t - 0.56);
  const b0 = flow(6, 0.21, t), b1 = flow(6, 0.21, t - 0.28), b2 = flow(6, 0.21, t - 0.56);
  // 手臂:动捕已驱动 → 叠加微生命噪声
  const aq2 = new THREE.Quaternion();
  const armL = by('左腕'); aq2.setFromEuler(new THREE.Euler(n1(2, t) * 0.02, n1(3, t) * 0.015, n1(4, t) * 0.02)); armL.quaternion.multiply(aq2);
  const armR = by('右腕'); aq2.setFromEuler(new THREE.Euler(n1(5, t) * 0.02, n1(6, t) * 0.015, n1(7, t) * 0.02)); armR.quaternion.multiply(aq2);
  const elL = by('左ひじ'); aq2.setFromEuler(new THREE.Euler(n1(8, t) * 0.03, 0, 0)); elL.quaternion.multiply(aq2);
  const elR = by('右ひじ'); aq2.setFromEuler(new THREE.Euler(n1(9, t) * 0.03, 0, 0)); elR.quaternion.multiply(aq2);
  const wrL = by('左手首'); aq2.setFromEuler(new THREE.Euler(n1(10, t) * 0.05, n1(11, t) * 0.05, 0)); wrL.quaternion.multiply(aq2);
  const wrR = by('右手首'); aq2.setFromEuler(new THREE.Euler(n1(12, t) * 0.05, n1(13, t) * 0.05, 0)); wrR.quaternion.multiply(aq2);
  // 头部微噪口音(叠加)
  const aq = new THREE.Quaternion();
  aq.setFromEuler(new THREE.Euler(n1(14, t) * 0.01, n1(15, t) * 0.01, 0));
  by('首').quaternion.multiply(aq);
  aq.setFromEuler(new THREE.Euler(n1(16, t) * 0.008, n1(17, t) * 0.008, 0));
  by('頭').quaternion.multiply(aq);
  console.log('动捕待机已应用 @ t=' + t.toFixed(1) + 's(mocap 基底 + 程序化上层)');
} else {
  find('右腕').rotation.set(ARM.R.x, ARM.R.y, ARM.R.z);
  find('左ひじ').rotation.x = 0.12;
  find('右ひじ').rotation.x = 0.12;
  find('左手首').rotation.x = 0.08;
  find('右手首').rotation.x = 0.08;
}

// ---------- 可选:应用 Grants(带每帧重置,验证修复后不变形) ----------
if ((process.argv[9] || process.argv[10]) === 'grants') {
  // 模拟程序化姿态:头转 0.3 + 左臂下垂
  const head = boneObjs.find(x => x.name === '頭');
  head.bone.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3);
  const armL = boneObjs.find(x => x.name === '左腕');
  armL.bone.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.5);
  const grants = data.bones.map((b, i) => ({ index: i, ...b.grant })).filter(g => g && g.index !== undefined && !g.isLocal && g.affectRotation);
  const solved = new Set();
  const q = new THREE.Quaternion();
  const solveOne = (g) => {
    if (solved.has(g.index)) return;
    solved.add(g.index);
    const bone = boneObjs[g.index].bone;
    bone.quaternion.set(0, 0, 0, 1); // 每帧重置
    const parent = boneObjs[g.parentIndex];
    if (!parent) return;
    const pg = grants.find(x => x.index === g.parentIndex);
    if (pg) solveOne(pg);
    q.set(0, 0, 0, 1).slerp(parent.bone.quaternion, g.ratio);
    bone.quaternion.multiply(q);
  };
  for (const g of grants) solveOne(g);
  console.log('grants 已应用:', grants.length, '根');
}
for (const r of roots) r.updateMatrixWorld(true);
const boneWorld = boneObjs.map(b => b.bone.matrixWorld.clone());
const boneFinal = boneWorld.map((w, i) => w.multiply(bindInverse[i]));

// ---------- 蒙皮变形 ----------
const verts = data.vertices;
const outPos = new Float32Array(verts.length * 3);
for (let i = 0; i < verts.length; i++) {
  const v = verts[i];
  const p = new THREE.Vector4(v.position[0], v.position[1], v.position[2], 1);
  let acc = new THREE.Vector4();
  for (let k = 0; k < v.skinIndices.length; k++) {
    const bi = v.skinIndices[k];
    const w = v.skinWeights[k];
    if (w <= 0 || bi === undefined || bi >= boneFinal.length) continue;
    acc.add(p.clone().applyMatrix4(boneFinal[bi]).multiplyScalar(w));
  }
  // 保险:若权重为空则用原位置
  if (v.skinIndices.length === 0) { outPos[i*3]=p.x; outPos[i*3+1]=p.y; outPos[i*3+2]=p.z; }
  else { outPos[i*3]=acc.x; outPos[i*3+1]=acc.y; outPos[i*3+2]=acc.z; }
}

// ---------- 表情 morph 测试(直接应用顶点位移) ----------
if (MORPH_NAME) {
  const morph = data.morphs.find(m => m.name === MORPH_NAME);
  const items = morph ? (morph.elements || morph.data || []) : [];
  if (items.length) {
    let applied = 0;
    for (const d of items) {
      if (d.index === undefined || !d.position) continue;
      outPos[d.index*3] += d.position[0] * MORPH_W;
      outPos[d.index*3+1] += d.position[1] * MORPH_W;
      outPos[d.index*3+2] += d.position[2] * MORPH_W;
      applied++;
    }
    console.log('morph', MORPH_NAME, 'applied to', applied, 'verts');
  } else {
    console.log('morph NOT FOUND:', MORPH_NAME);
  }
}

// 归一化到浏览器单位
for (let i = 0; i < verts.length; i++) {
  outPos[i*3] *= NORM_SCALE;
  outPos[i*3+1] = outPos[i*3+1] * NORM_SCALE + NORM_OFFSET;
  outPos[i*3+2] *= NORM_SCALE;
}

// ---------- 光栅化 ----------
const W = 640, H = 800;
const BG = parseInt(process.argv[13] ?? 30); // 背景亮度(调参验证用)
const zbuf = new Float32Array(W * H).fill(1e9);
const pixels = new Uint8Array(W * H * 3).fill(BG); // 背景
const cam = new THREE.Vector3(CAM.x, CAM.y, CAM.z);
const look = new THREE.Vector3(CAM.lx, CAM.ly, CAM.lz);
const fwd = look.clone().sub(cam).normalize();
const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
const up = new THREE.Vector3().crossVectors(right, fwd);
const fov = 42 * Math.PI / 180;
const camDist = (H / 2) / Math.tan(fov / 2);

function project(x, y, z) {
  const d = new THREE.Vector3(x, y, z).sub(cam);
  const cz = d.dot(fwd);
  if (cz <= 0.1) return null;
  const cx = d.dot(right);
  const cy = d.dot(up);
  const px = W / 2 + cx * camDist / cz;
  const py = H / 2 - cy * camDist / cz;
  return { px, py, cz };
}
const matColor = [
  [0.95, 0.78, 0.68], // 面 皮肤
  [0.95, 0.78, 0.68],
  [0.95, 0.95, 0.95], // 白目
  [0.55, 0.30, 0.30], // 目
  [0.30, 0.22, 0.20], // 睫
  [0.85, 0.45, 0.45], // 口舌
  [0.95, 0.78, 0.68],
  [0.55, 0.35, 0.30], // 眉
  [0.95, 0.95, 0.90], // 齿
  [0.95, 0.78, 0.68],
  [0.32, 0.18, 0.22], // 发 深棕
  [0.28, 0.15, 0.20], // 帽
  [0.30, 0.16, 0.22],
  [0.22, 0.12, 0.20], // 服 深紫黑
  [0.25, 0.14, 0.22],
  [0.30, 0.18, 0.25],
  [0.28, 0.16, 0.22],
  [0.22, 0.12, 0.20],
  [0.30, 0.20, 0.26], // 鞋袜
  [0.26, 0.15, 0.22],
  [0.95, 0.80, 0.72], // 肌
];
const faces = data.faces;
let fOff = 0;
data.materials.forEach((m, mi) => {
  const color = matColor[mi] || [0.5, 0.5, 0.5];
  const shade = 0.75 + (mi % 3) * 0.12;
  for (let f = fOff; f < fOff + m.faceCount; f++) {
    const [a, b, c] = faces[f].indices;
    const pts = [a, b, c].map(vi => {
      const x = outPos[vi*3], y = outPos[vi*3+1], z = outPos[vi*3+2];
      return project(x, y, z);
    });
    if (!pts[0] || !pts[1] || !pts[2]) continue;
    // 包围盒
    const minX = Math.max(0, Math.floor(Math.min(pts[0].px, pts[1].px, pts[2].px)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(pts[0].px, pts[1].px, pts[2].px)));
    const minY = Math.max(0, Math.floor(Math.min(pts[0].py, pts[1].py, pts[2].py)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(pts[0].py, pts[1].py, pts[2].py)));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        // 重心坐标
        const [p0, p1, p2] = pts;
        const denom = (p1.py - p2.py) * (p0.px - p2.px) + (p2.px - p1.px) * (p0.py - p2.py);
        if (Math.abs(denom) < 1e-9) continue;
        const w0 = ((p1.py - p2.py) * (x - p2.px) + (p2.px - p1.px) * (y - p2.py)) / denom;
        const w1 = ((p2.py - p0.py) * (x - p2.px) + (p0.px - p2.px) * (y - p2.py)) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * p0.cz + w1 * p1.cz + w2 * p2.cz;
        const idx = y * W + x;
        if (z < zbuf[idx]) {
          zbuf[idx] = z;
          const bri = shade;
          pixels[idx*3] = Math.min(255, color[0] * bri * 255);
          pixels[idx*3+1] = Math.min(255, color[1] * bri * 255);
          pixels[idx*3+2] = Math.min(255, color[2] * bri * 255);
        }
      }
    }
  }
  fOff += m.faceCount;
});

// ---------- 写 PNG ----------
function writePNG(path, w, h, rgb) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w*3+1)] = 0; // filter none
    rgb.copy ? null : null;
  }
  const stride = w * 3 + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    raw[y * stride + 1 + x*3] = rgb[(y*w+x)*3];
    raw[y * stride + 1 + x*3+1] = rgb[(y*w+x)*3+1];
    raw[y * stride + 1 + x*3+2] = rgb[(y*w+x)*3+2];
  }
  const idat = zlib.deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8bit RGB
  const out = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(path, out);
  console.log('written', path, out.length, 'bytes');
}
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
writePNG(OUT, W, H, pixels);
// 诊断:非背景像素数
let nz = 0;
for (let i = 0; i < pixels.length; i += 3) {
  if (pixels[i] !== 30 || pixels[i+1] !== 30 || pixels[i+2] !== 30) nz++;
}
console.log('non-bg pixels:', nz, 'of', W * H);
