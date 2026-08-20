// 把 CMU 动捕待机片段(BVH)重定向到 MMD 骨骼,烘焙为网页可加载的 JSON 关键帧
// 正确链式分解:每骨骼局部旋转 = inv(目标父世界) * (源世界增量 * 目标静止世界)
// 用法:node tools/bake_idle.mjs [bvh] [out.json]
import fs from 'node:fs';
import * as THREE from 'three';
import { MMDParser } from 'three/examples/jsm/libs/mmdparser.module.js';
import { parseBVH } from './bvh.mjs';

const SRC = process.argv[2] || 'tools/ref/mocap/140_07.bvh';
const OUT = process.argv[3] || 'public/idle_motion.json';
const FPS = 60; // 60fps 烘焙:配合浏览器 smoothstep 插值,消除机械步进感
// 低通平滑:对烘焙四元数曲线做 3 次迭代的邻域加权(滤除光学动捕高频噪点)
const SMOOTH_ITERS = 3;
// 各骨缩放(躯干/头颈小一点 → 温和;手臂保留受试者的真实微动但缩放,明显可见又不夸张)
const SCALES = {
  'センター': 0.7, '下半身': 0.8, '首': 0.7, '頭': 0.7,
  '左腕': 0.35, '右腕': 0.35, '左ひじ': 0.3, '右ひじ': 0.3, '左手首': 0.3, '右手首': 0.3,
};
// 循环平滑帧数(60fps 下 40 帧 ≈ 0.67s):结尾向开头深度交叉淡化,消除接缝跳变
const LOOP_BLEND = 40;

const b = parseBVH(SRC);
const chStart = [];
let acc = 0;
for (const ch of b.channels) { chStart.push(acc); acc += ch.length; }

// ---------- 目标(MMD)骨骼层级 ----------
const pmxBuf = fs.readFileSync('public/model/nahida/5th/nahida.pmx');
const pmxAb = pmxBuf.buffer.slice(pmxBuf.byteOffset, pmxBuf.byteOffset + pmxBuf.byteLength);
const pmx = new MMDParser.Parser().parsePmx(pmxAb, true);
const tgtParents = {}; // 骨名 -> 父骨名
pmx.bones.forEach((bn, i) => {
  tgtParents[bn.name] = bn.parentIndex >= 0 ? pmx.bones[bn.parentIndex].name : null;
});

// ---------- CMU 源骨架 ----------
const srcBones = b.jointOrder.map(() => new THREE.Bone());
srcBones.forEach((bone, i) => bone.position.set(...b.offsets[i]));
b.parents.forEach((p, i) => { if (p >= 0) srcBones[p].add(srcBones[i]); });
const srcRoots = srcBones.filter((_, i) => b.parents[i] < 0);

const axisIdx = { Xrotation: 0, Yrotation: 1, Zrotation: 2, xrotation: 0, yrotation: 1, zrotation: 2 };
function applyFrame(fi) {
  const row = b.values[fi];
  for (let j = 0; j < b.jointOrder.length; j++) {
    const ch = b.channels[j];
    const e = new THREE.Euler(0, 0, 0, 'ZYX');
    let o = 0;
    for (const c of ch) {
      const ax = axisIdx[c];
      if (ax === undefined) { o++; continue; }
      const v = THREE.MathUtils.degToRad(row[chStart[j] + o]);
      if (c.includes('X')) e.x = v; else if (c.includes('Y')) e.y = v; else if (c.includes('Z')) e.z = v;
      o++;
    }
    srcBones[j].quaternion.setFromEuler(e);
  }
  for (const r of srcRoots) r.updateMatrixWorld(true);
}

// ---------- 参数 ----------
const step = Math.max(1, Math.round(1 / (b.frameTime * FPS)));
const SRC_REF_FRAME = 240;   // 源帧参考(约 2s,已站稳)
const START_SRC_FRAME = 180; // 裁掉开头过渡(约 1.5s)
const frameCount = Math.floor((b.frames - START_SRC_FRAME) / step);
console.log('源:', SRC, '|', b.frames, '帧@', (1 / b.frameTime).toFixed(0) + 'fps', '→', frameCount, '帧@' + FPS + 'fps', '(裁掉前 1.5s 过渡)');

// MMD 目标骨 → 源关节(含手臂:真实微动)
const MOCAP_BONES = ['センター', '下半身', '首', '頭', '左腕', '左ひじ', '左手首', '右腕', '右ひじ', '右手首'];
const SRC_JOINT = {
  'センター': 'Hips', '下半身': 'Spine', '首': 'Neck', '頭': 'Head',
  '左腕': 'LeftArm', '左ひじ': 'LeftForeArm', '左手首': 'LeftHand',
  '右腕': 'RightArm', '右ひじ': 'RightForeArm', '右手首': 'RightHand',
};

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

// 获取源关节世界四元数(相对参考姿态的增量,含缩放)
function srcDelta(jointName, srcFrame, scale) {
  const si = b.jointOrder.indexOf(jointName);
  applyFrame(Math.min(srcFrame, b.frames - 1));
  const qNow = srcBones[si].getWorldQuaternion(_q).clone();
  applyFrame(Math.min(SRC_REF_FRAME, b.frames - 1));
  const qRef = srcBones[si].getWorldQuaternion(_q2).clone();
  const delta = qRef.clone().invert().multiply(qNow);
  _q2.set(0, 0, 0, 1).slerp(delta, scale);
  return _q2.clone();
}

// 采样一帧:返回 {骨名: 局部四元数}
function sampleFrame(t) {
  const srcFrame = START_SRC_FRAME + t * step;
  const worldQ = {};   // 目标骨世界(用于子骨分解)
  const locals = {};
  // 先取所有 delta
  const deltas = {};
  for (const tgt of MOCAP_BONES) deltas[tgt] = srcDelta(SRC_JOINT[tgt], srcFrame, SCALES[tgt]);
  // 链式分解(父在前):父世界 = 最近动捕祖先的世界(中间非动捕骨烘焙时为身份)
  for (const tgt of MOCAP_BONES) {
    let parentWorld = new THREE.Quaternion();
    let p = tgtParents[tgt];
    while (p) {
      if (worldQ[p]) { parentWorld = worldQ[p]; break; }
      p = tgtParents[p];
    }
    const local = parentWorld.clone().invert().multiply(deltas[tgt]).normalize();
    locals[tgt] = local;
    worldQ[tgt] = parentWorld.clone().multiply(local).normalize();
  }
  return locals;
}

// ---------- 烘焙输出(最佳匹配拼接 + 低通滤波)----------
const cache = [];
for (let f = 0; f < frameCount; f++) cache.push(sampleFrame(f));
// 低通平滑(四元数邻域加权 3 次迭代,滤除光学动捕高频噪点;保留循环性)
const _smA = new THREE.Quaternion(), _smB = new THREE.Quaternion();
for (let iter = 0; iter < SMOOTH_ITERS; iter++) {
  for (const tgt of MOCAP_BONES) {
    for (let f = 0; f < frameCount; f++) {
      const prev = cache[(f - 1 + frameCount) % frameCount][tgt];
      const cur = cache[f][tgt];
      const next = cache[(f + 1) % frameCount][tgt];
      _smA.copy(cur).slerp(prev, 0.25);
      _smB.copy(_smA).slerp(next, 0.25);
      cache[f][tgt].copy(_smB);
    }
  }
}
// 最佳匹配拼接:找与开头姿态最接近的帧作为结尾(消除循环接缝跳变)
const _wdA = new THREE.Quaternion(), _wdB = new THREE.Quaternion();
function poseDist(f, g) {
  let d = 0;
  for (const tgt of MOCAP_BONES) {
    _wdA.copy(cache[f][tgt]); _wdB.copy(cache[g][tgt]);
    const q = _wdA.clone().invert().multiply(_wdB);
    d += 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  }
  return d;
}
let bestF = frameCount - 1, bestD = 1e9;
for (let f = Math.floor(frameCount * 0.15); f < frameCount - 2; f++) {
  const d = poseDist(f, 0);
  if (d < bestD) { bestD = d; bestF = f; }
}
console.log('最佳拼接点: 帧', bestF, '(姿态差', bestD.toFixed(3) + ' rad),裁剪为', (bestF + 1), '帧');
const trimmed = cache.slice(0, bestF + 1);
// 结尾 POLISH 帧向开头"反向"交叉淡化:末帧→第 0 帧、倒数第 2→第 1 帧……保证接缝闭合
const POLISH = 30;
for (let f = trimmed.length - POLISH; f < trimmed.length; f++) {
  const j = f - (trimmed.length - POLISH); // 0..POLISH-1
  const k = j / (POLISH - 1);
  const qHead = trimmed[POLISH - 1 - j]; // 反向对应开头帧
  for (const tgt of MOCAP_BONES) {
    const q = trimmed[f][tgt].clone();
    q.slerp(qHead[tgt], k);
    trimmed[f][tgt].copy(q);
  }
}
const duration = (trimmed.length - 1) / FPS;
const out = { name: 'cmu_mocap_idle', source: SRC.split('/').pop(), fps: FPS, duration: +duration.toFixed(2), bones: {} };
for (const tgt of MOCAP_BONES) {
  const arr = [];
  for (const f of trimmed) arr.push(f[tgt].x, f[tgt].y, f[tgt].z, f[tgt].w);
  out.bones[tgt] = arr;
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('已写入', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB', '| 时长', out.duration + 's');
