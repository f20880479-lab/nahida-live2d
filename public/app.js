// ============ 纳西妲 · 与你相识 前端 ============
import * as THREE from 'three';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { MMDPhysics } from 'three/addons/animation/MMDPhysics.js';
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js';

const MODEL_URL = '/model/nahida/5th/nahida.pmx';

let physics = null;
let ikSolver = null;

// ===== 编排式微场景:像真人一样做连贯小动作(参考 Live2D 桌宠的"设计好的待机") =====
// 每个场景 = 头部 + 手臂 + 重心 的全身编排,不再只动头
const IDLE_SCENES = [
  { name: 'read',    dur: 3.0, pose: { hx: 0,    hy: -0.5,  armZ: 0.16, armX: -0.04, elbow: 0.10, wrx: 0.04, leanF: 0.05 } }, // 低头看书,双手微微收拢
  { name: 'look',    dur: 2.4, pose: { hx: 0,    hy: 0.14,  armZ: 0,    armX: 0,     elbow: 0,    wrx: 0,    leanF: -0.02, gaze: 1 } }, // 抬头看镜头微笑
  { name: 'curious', dur: 1.9, pose: { hx: 0.42, hy: 0.10,  armZ: -0.06, armX: 0.10,  elbow: 0.06, wrx: 0.05, leanF: 0,     shoulder: 'L' } }, // 好奇歪头,左肩微耸
  { name: 'stretch', dur: 2.4, pose: { hx: -0.2, hy: 0.28,  armZ: -0.26, armX: 0.24,  elbow: 0.18, wrx: 0,    leanF: -0.07 } }, // 舒展:抬头抬臂后仰
  { name: 'shy',     dur: 2.2, pose: { hx: 0,    hy: -0.3,  armZ: 0.20, armX: 0.10,  elbow: 0.14, wrx: -0.06, leanF: 0.03, turn: 0.12 } }, // 害羞低头,双臂贴近身体
  { name: 'play',    dur: 2.0, pose: { hx: 0.15, hy: -0.2,  armZ: 0.08, armX: 0.12,  elbow: 0.16, wrx: 0.14, leanF: 0.02 } }, // 摆弄衣角:手腕小幅活动
];
let sceneTimer = 10 + Math.random() * 12;
let activeScene = null;

// 手臂姿态:数值测量确认本模型(纳西妲)静止时上臂本就接近自然下垂(约 7°),
// 旧参数(±0.5)是从胡桃模型带过来的,会把手臂向外掰成"翼状外翻" → 已按测量结果改回自然值
const ARM_POSE = {
  L: { x: 0, y: 0, z: 0.05 },
  R: { x: 0, y: 0, z: -0.05 },
};

// ---------- 情绪 → 表情映射(模型的表情名) ----------
const EMOTIONS = {
  happy:     [['笑い', 0.9], ['にこり', 0.6]],
  shy:       [['てへぺろ', 0.8], ['なごみ', 0.5]],
  sad:       [['困る', 0.8], ['困る左', 0.35], ['困る右', 0.35]],
  angry:     [['怒り', 0.7], ['怒り目', 0.6]],
  surprised: [['びっくり', 0.9]],
  serious:   [['真面目', 0.75]],
  smug:      [['にやり', 0.85]],
  normal:    [['笑い', 0.55], ['口角上げ', 0.25]],
};
const EMOJI = { happy: '😊', shy: '😳', sad: '😢', angry: '😠', surprised: '😲', serious: '😐', smug: '😏', normal: '😊' };
const MOUTH_MORPHS = ['あ', 'い', 'う', 'え', 'お', 'ん'];

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const stage = $('stage');
const chatMessages = $('chat-messages');
const chatInput = $('chat-input');
const statusLine = $('status-line');
const speechBubble = $('speech-bubble');
const thinkingDot = $('thinking-dot');
const btnSend = $('btn-send');
const btnMic = $('btn-mic');
const btnMusic = $('btn-music');
const btnNight = $('btn-night');
const btnCam = $('btn-cam');
const btnSettings = $('btn-settings');
const btnChatMin = $('btn-chat-min');
const settingsModal = $('settings-modal');
const setNick = $('set-nick');
const setVoice = $('set-voice');
const setMusic = $('set-music');
const setNight = $('set-night');
const brainState = $('brain-state');
const toast = $('toast');

// ---------- 设置 ----------
const settings = Object.assign(
  { nick: '亲爱的', voice: true, music: false, night: false },
  JSON.parse(localStorage.getItem('hutao-settings') || '{}')
);

// ---------- 3D 场景 ----------
let renderer, scene, camera, model, modelRoot;
let morphDict = {}, morphInf = null, bonesByName = {};
let emotionNow = 'normal';
// ===== 连续情感状态(参考 N.E.K.O 的 valence/arousal 双轴模型) =====
// 表情由连续情感平滑驱动,而不是在离散情绪间跳变 → 面部过渡自然
let valence = 0.4, arousal = 0.15;
let valenceTarget = 0.4, arousalTarget = 0.15;
const EMOTION_VA = {
  happy: [0.75, 0.5], shy: [0.3, -0.25], sad: [-0.65, -0.35],
  angry: [-0.55, 0.6], surprised: [0.25, 0.8], serious: [-0.1, -0.45],
  smug: [0.55, 0.35], normal: [0.4, 0.15],
};
function setEmotionGoal(emotion) {
  emotionNow = emotion;
  const [v, a] = EMOTION_VA[emotion] || EMOTION_VA.normal;
  valenceTarget = v; arousalTarget = a;
  if (window.TaffyLive2D && window.TaffyLive2D.ready) window.TaffyLive2D.setEmotion(emotion);
}
let exprCurrent = new Map();   // morphName -> 当前权重
let exprTarget = new Map();    // morphName -> 目标权重
let blinkTimer = 2 + Math.random() * 3, blinkState = 0;
let winkTimer = 14 + Math.random() * 8, winkState = 0;
let speaking = false, mouthAmp = 0;
let busy = false; // 思考中/忙碌(主动互动时跳过)
let headSX = { val: 0, vel: 0 }, headSY = { val: 0, vel: 0 };
let eyesSaccadeTimer = 2, eyesSaccade = 0, eyesSaccadeTarget = 0;
// 注视系统(参考 pmx-pal):权重分布 颈0.12/头0.32/眼0.56,yaw±35° pitch±20°,指数平滑
let gazeYaw = 0, gazePitch = 0, gazeYawT = 0, gazePitchT = 0;
let gesture = null, gestureTimer = 5 + Math.random() * 6;
let exprPulse = null, exprPulseTimer = 6 + Math.random() * 8;  // 微表情脉冲
let gazeTimer = 12 + Math.random() * 18, gazeFixate = 0;       // 凝视镜头
let groundY = 0;
let butterflies = [], butterflyClock = 0;
let mouseN = { x: 0, y: 0 }; // 鼠标位置(归一化 -1..1),注视系统使用
let useLive2D = false;       // Live2D 2D 二次元模式是否启用
let clock = new THREE.Clock();
// ===== 动捕待机(CMU mocap 烘焙,驱动 センター/下半身/首/頭/手臂)=====
let idleMotion = null; // {fps, duration, bones: {name: Float32Array(quat x4 per frame)}}
const _iqA = new THREE.Quaternion(), _iqB = new THREE.Quaternion();
const _corrQ = new THREE.Quaternion();
// 手臂内收修正:动捕保留了受试者自然的轻微外展(~7°),这里收拢一点,让手臂挂得更直更乖巧
const ARM_CORR = {
  '左腕': [0, 0, 0.12], '右腕': [0, 0, -0.12],
  '左ひじ': [0.12, 0, 0], '右ひじ': [0.12, 0, 0],
  '左手首': [0.08, 0, 0], '右手首': [0.08, 0, 0],
};
function applyIdleMotion(t) {
  if (!idleMotion) return;
  const boneArr = idleMotion.bones;
  const n = boneArr['センター'].length / 4;
  if (n < 2) return;
  const dur = n / idleMotion.fps;
  const ft = ((t % dur) + dur) % dur * idleMotion.fps;
  const f0 = Math.floor(ft) % n;
  const f1 = (f0 + 1) % n;
  // smoothstep 插值(C1 连续):消除关键帧处的速度突变,避免"机械步进感"
  const frac = ft - Math.floor(ft);
  const s = frac * frac * (3 - 2 * frac);
  for (const [name, arr] of Object.entries(boneArr)) {
    const bone = bonesByName[name];
    if (!bone) continue;
    const i0 = f0 * 4, i1 = f1 * 4;
    _iqA.set(arr[i0], arr[i0 + 1], arr[i0 + 2], arr[i0 + 3]);
    _iqB.set(arr[i1], arr[i1 + 1], arr[i1 + 2], arr[i1 + 3]);
    bone.quaternion.slerpQuaternions(_iqA, _iqB, s);
    // 手臂内收修正(固定叠加,让手臂挂直)
    const corr = ARM_CORR[name];
    if (corr) {
      _corrQ.setFromEuler(new THREE.Euler(corr[0], corr[1], corr[2]));
      bone.quaternion.multiply(_corrQ);
    }
  }
}

// ===== 主动互动(参考 N.E.K.O 猫娘:她会主动找你说话,小女友日常) =====
const PROACTIVE_LINES = [
  ['嗯……刚读完一段话,突然就好想和你分享。', 'happy'],
  ['你今天有没有好好吃饭呀?不许糊弄我。', 'normal'],
  ['诶嘿,我今天看到一朵像你一样好看的云。', 'happy'],
  ['好安静呀……你在做什么呢?陪我说说话嘛。', 'normal'],
  ['嗯……我好像有点想你了,就一点点。', 'shy'],
  ['我给你留了一颗糖,下次见面给你哦。', 'happy'],
  ['啊,今天听到一首很好听的歌,想放给你听。', 'smug'],
  ['你笑一下嘛,我喜欢看你笑的样子。', 'shy'],
  ['要是能和你一起看星星就好了……', 'shy'],
  ['嗯……抱抱可以吗?就一小会儿。', 'shy'],
  ['你今天累不累呀?累的话就靠着我休息一会儿。', 'normal'],
  ['诶嘿,和你聊天的时间总是过得特别快。', 'happy'],
];

// ===== 有机动作系统 v2:平滑值噪声 + 关节链延迟 + 重心转移 =====
// 参考同类 3D 桌宠/虚拟女友项目(VRM 桌宠、N.E.K.O、moeru-ai)的做法:
// 1) 用多倍频平滑值噪声(而非纯正弦叠加)——非周期、有"呼吸般的漂移感",杜绝"数学波形"感
// 2) 关节链延迟跟随:腕随肘、肘随肩,同一噪声流按时间错位传播 → 肢体像鞭梢一样连贯
// 3) 重心转移:骨盆画小椭圆 + 躯干反向补偿 + 头部保持水平 → 经典的"S 曲线"站姿摇摆
// 4) 头部/眼睛轻微跟随鼠标,互动感更强

// —— 1D 平滑值噪声(确定性,无分配)——
function vnoise(seed, t) {
  const i = Math.floor(t), f = t - i;
  const u = f * f * (3 - 2 * f); // smoothstep
  const h1 = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  const h2 = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return (h1 - Math.floor(h1)) + ((h2 - Math.floor(h2)) - (h1 - Math.floor(h1))) * u; // 0..1
}
// 多倍频(3 层),输出归一化到 -1..1
function fbm(seed, t, octaves = 3) {
  let sum = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(seed + o * 17.31, t * f) * amp;
    n += amp; amp *= 0.5; f *= 2.03;
  }
  return (sum / n) * 2 - 1;
}
// 有机噪声流:频率参数控制"速度"(0.2 ≈ 每 5 秒一个完整起伏)
function flow(t, seed, freq) {
  return fbm(seed * 100 + 7.7, t * freq * 2.1, 3) * 0.85;
}
// 微颤噪声:高频小幅度(保留)
function noise(t, seed = 0) {
  return Math.sin(t * 1.7 + seed * 3.1) * 0.5
    + Math.sin(t * 3.3 + seed * 7.7) * 0.3
    + Math.sin(t * 0.71 + seed * 13.1) * 0.2;
}
// 2D 弹簧步进(带轻微过冲,接近真人):s = {val, vel}
function springStep(dt, s, target, freq = 5, zeta = 0.45) {
  const omega = 2 * Math.PI * freq;
  const x = target - s.val;
  s.vel += dt * (omega * omega * x - 2 * zeta * omega * s.vel);
  s.val += dt * s.vel;
  return s.val;
}

// 动作通道:全部用连续噪声流 → 联动、流畅、永不重复
let breathPhase = Math.random() * 6.28;
// 每根骨骼的"微颤"相位(随机),避免所有部位同步抖动
let microSeeds = [];
for (let i = 0; i < 12; i++) microSeeds.push(Math.random() * 100);

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas: stage, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.375, 1.39);
  camera.lookAt(0, 1.375, 0);

  // 灯光(三光源 + 面部补光,toon 质感)
  const hemi = new THREE.HemisphereLight(0xfff0dd, 0x332044, 1.0);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0d8, 1.75);
  key.position.set(1.4, 2.8, 2.0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 8;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.85);
  rim.position.set(-1.8, 1.2, -1.5);
  scene.add(rim);
  const rimWarm = new THREE.DirectionalLight(0xffaa88, 0.35);
  rimWarm.position.set(0.6, 0.8, -2.0);
  scene.add(rimWarm);
  const fill = new THREE.PointLight(0xffe8cc, 0.55, 4);
  fill.position.set(0, 1.4, 1.35);
  scene.add(fill);

  // 地面(淡色圆盘,承接阴影)—— 深绿色,呼应森林梦境
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 48),
    new THREE.MeshStandardMaterial({ color: 0x132a20, roughness: 0.9, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.001;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- 背景氛围(草元素:绿 + 金,梦境般的森林光晕) ----
  // 身后柔光晕
  const glowTex = makeGlowTexture('#8fe3c0', '#ffe28a');
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(3.4, 3.4, 1);
  glow.position.set(0, 1.05, -0.6);
  scene.add(glow);
  // 地面柔光环
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.62, 48),
    new THREE.MeshBasicMaterial({
      color: 0x8fe3c0, transparent: true, opacity: 0.32,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  scene.add(ring);
  // 森林绿叶 + 萤火虫(梦境般的森林光点)
  initPetals();
  initButterflies();
  window.addEventListener('resize', onResize);
  stage.addEventListener('pointerdown', onCanvasClick);
  // 鼠标跟随:头部/眼睛轻轻转向鼠标位置(Live2D 模式也同步)
  window.addEventListener('pointermove', e => {
    mouseN.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseN.y = (e.clientY / window.innerHeight) * 2 - 1;
    if (window.TaffyLive2D && window.TaffyLive2D.ready) {
      // 与免疫 demo 一致的指针约定:pointerX=(模型中心x-鼠标x)/高,pointerY=(模型底y-鼠标y)/宽
      window.TaffyLive2D.setPointer(
        (window.innerWidth * 0.5 - e.clientX) / window.innerHeight,
        (window.innerHeight * 0.96 - e.clientY) / window.innerWidth
      );
    }
  }, { passive: true });
}

// 柔光贴图
function makeGlowTexture(c1, c2) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, c1);
  grad.addColorStop(0.35, c2);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- 点击互动 ----------
let clickLockedAt = 0;
let burstPoints = [];
function onCanvasClick(e) {
  const now = performance.now();
  if (now - clickLockedAt < 1500) return; // 防连点
  clickLockedAt = now;
  // ===== Live2D 二次元模式:播放触摸动作 + 互动回复 =====
  if (window.TaffyLive2D && window.TaffyLive2D.ready) {
    window.TaffyLive2D.tap();
    const zones = ['head', 'hand', 'body', 'bg', 'hair'];
    const zone = zones[Math.floor(Math.random() * zones.length)];
    fetch('/api/interact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone }),
    }).then(r => r.json()).then(j => {
      if (!j.reply) return;
      setEmotionGoal(j.emotion || 'normal');
      showSpeech(j.reply);
      if (settings.voice) speak(j.reply);
    }).catch(() => {});
    return;
  }
  // ===== 3D 模式 =====
  if (!model || !renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  let zone = 'bg', hitPoint = null;
  const hits = raycaster.intersectObject(model, true);
  if (hits.length) {
    hitPoint = hits[0].point.clone();
    zone = zoneFromHit(hits[0]);
  }
  // 点击处的小光点特效
  if (hitPoint) spawnBurst(hitPoint);
  // 触发纳西妲的反应(不同部位 → 不同好感度变化)
  fetch('/api/interact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone }),
  }).then(r => r.json()).then(j => {
    if (!j.reply) return;
    emotionNow = j.emotion || 'normal';
    setEmotionGoal(j.emotion || 'normal');
    showSpeech(j.reply);
    if (settings.voice) speak(j.reply);
    // 配合一个对应的小动作(程序化,流畅)
    const g = { head: 'tilt', face: 'shake', body: 'lean', skirt: 'shake', hand: 'wave', hair: 'tilt', bg: 'listen' }[zone];
    if (g) gesture = { name: g, start: clock.elapsedTime };
  }).catch(() => {});
}

// 点击区域判定:优先用命中面的"材质名",辅以位置(手在身侧)
function zoneFromHit(hit) {
  let matName = '';
  try {
    const mats = Array.isArray(model.material) ? model.material : [model.material];
    matName = (mats[hit.face ? hit.face.materialIndex : -1] || {}).name || '';
  } catch {}
  if (/帽|头饰/.test(matName)) return 'head';
  if (/颜|白目|目|睫|眉|口舌|齿|星目|二重/.test(matName)) return 'face';
  if (/髮|发|前髮/.test(matName)) return 'hair';
  const p = hit.point;
  if (Math.abs(p.x) > 0.3 && p.y < 1.25 && p.y > 0.45) return 'hand'; // 手臂/手
  if (p.y > 0.95) return 'body';
  return 'skirt';
}

// 点击光点特效
function spawnBurst(point) {
  const mat = new THREE.PointsMaterial({
    size: 0.06, color: 0xffc9a0, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const n = 10;
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) {
    pos[i*3] = point.x; pos[i*3+1] = point.y; pos[i*3+2] = point.z;
    vel.push(new THREE.Vector3(
      (Math.random() - 0.5) * 0.6,
      (Math.random() - 0.5) * 0.6,
      (Math.random() - 0.5) * 0.6
    ));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, mat);
  pts.userData.vel = vel;
  pts.userData.life = 0;
  scene.add(pts);
  burstPoints.push(pts);
}
function animateBursts(dt) {
  for (let i = burstPoints.length - 1; i >= 0; i--) {
    const p = burstPoints[i];
    p.userData.life += dt;
    const l = p.userData.life;
    if (l > 0.5) { scene.remove(p); burstPoints.splice(i, 1); continue; }
    const pos = p.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      pos.setX(k, pos.getX(k) + p.userData.vel[k].x * dt);
      pos.setY(k, pos.getY(k) + p.userData.vel[k].y * dt);
      pos.setZ(k, pos.getZ(k) + p.userData.vel[k].z * dt);
    }
    pos.needsUpdate = true;
    p.material.opacity = 0.9 * (1 - l / 0.5);
  }
}

// ---------- 加载模型 ----------
function loadModel() {
  statusLine.textContent = '正在唤醒纳西妲…';
  const loader = new MMDLoader();
  loader.load(MODEL_URL, (mesh) => {
    model = mesh;
    model.castShadow = true;
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        // 关键:开启材质 morphTargets,否则面部表情/眨眼不会生效!
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { m.morphTargets = true; });
      }
    });

    // 归一化:缩放到身高约 1.7
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const height = size.y;
    const scale = 1.7 / height;
    model.scale.setScalar(scale);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const minY = box.min.y;
    model.position.set(-center.x * scale * 0, -minY * scale * 0, 0);
    model.position.y = -minY; // 站到地面
    model.position.x = -center.x;

    // 让模型面向相机(MMD 模型默认朝向 +Z,若背对则转 180°)
    model.rotation.y = 0;
    model._groundY = -minY; // 记录地面高度,用于呼吸浮动

    scene.add(model);

    // 骨骼/表情索引
    morphDict = model.morphTargetDictionary || {};
    morphInf = model.morphTargetInfluences || [];
    model.skeleton?.bones.forEach(b => { bonesByName[b.name] = b; });

    // 预置表达式表
    Object.values(EMOTIONS).flat().forEach(([name]) => {
      if (morphDict[name] !== undefined) exprCurrent.set(name, 0);
    });

    // 启用 MMD 物理(头发/披风/裙摆自然飘动)
    setupPhysics(model);

    console.log('[nahida] 模型加载完成', Object.keys(morphDict).length, '个表情可用');
    window.__HUTAO_DEBUG = {
      modelLoaded: true,
      morphCount: Object.keys(morphDict).length,
      morphTargetsEnabled: !!model.material && (Array.isArray(model.material) ? model.material : [model.material]).every(m => m.morphTargets),
      error: null,
    };
    statusLine.textContent = '';
    setTimeout(() => showSpeech('嗯?你醒啦?我刚刚在看书呢……要一起聊聊天吗?'), 500);
  }, undefined, (err) => {
    console.error('[nahida] 模型加载失败', err);
    window.__HUTAO_DEBUG = { modelLoaded: false, error: String(err) };
    statusLine.textContent = '模型加载失败,请刷新重试';
  });
}

// ---------- MMD 物理 + IK + Grants(参考 moeru-ai/three-mmd 的专业管线) ----------
// 物理会在大刚体数量(349)下出现头发乱抖,默认关闭 → 用平滑的程序化头发;
// 如需开启物理,把 ENABLE_PHYSICS 改为 true
const ENABLE_PHYSICS = false;
function setupPhysics(mesh) {
  try { ikSolver = new CCDIKSolver(mesh); } catch (e) { console.warn('[nahida] IK 初始化失败:', e.message); }
  if (!ENABLE_PHYSICS) { console.log('[nahida] 物理已关闭(防头发抖动),使用程序化头发'); return; }
  try {
    const mmd = mesh.geometry.userData.MMD;
    if (mmd && mmd.rigidBodies && mmd.rigidBodies.length) {
      physics = new MMDPhysics(mesh, mmd.rigidBodies, mmd.constraints, { unitStep: 1 / 65, maxStepNum: 3 });
      console.log('[nahida] 物理已启用,刚体:', mmd.rigidBodies.length);
    } else {
      console.warn('[nahida] 模型无刚体数据,物理跳过');
    }
  } catch (e) {
    console.warn('[nahida] 物理初始化失败(需要 Ammo):', e.message);
  }
}

// Grants(附加变换):让"付与"骨骼跟随父骨骼旋转(眼睛跟头、手臂扭转分配)
// 关键:每帧先把 grant 骨骼重置为单位旋转,再应用 → 防止旋转累乘扭曲模型
const _grantQ = new THREE.Quaternion();
function solveGrants() {
  if (!model) return;
  const grants = model.geometry.userData.MMD && model.geometry.userData.MMD.grants;
  if (!grants || !grants.length) return;
  const bones = model.skeleton.bones;
  const solved = new Set();
  const solveOne = (g) => {
    if (solved.has(g.index)) return;
    solved.add(g.index);
    const bone = bones[g.index];
    if (!bone) return;
    bone.quaternion.set(0, 0, 0, 1); // 每帧重置,防累积
    const parent = bones[g.parentIndex];
    if (!parent) return;
    // 父骨骼若也在 grant 链中,先解父(保证用的父旋转是本帧结果)
    const pg = grants.find(x => x.index === g.parentIndex);
    if (pg) solveOne(pg);
    _grantQ.set(0, 0, 0, 1).slerp(parent.quaternion, g.ratio);
    bone.quaternion.multiply(_grantQ);
  };
  for (const g of grants) {
    if (g.isLocal || !g.affectRotation) continue;
    solveOne(g);
  }
}

// ---------- 动画 ----------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (model) {
    // ===== 动捕待机基底(真实 mocap:骨盆/脊柱/颈/头的自然站立晃动)=====
    applyIdleMotion(t);
    // ===== 动作通道(全程连续噪声流,无突变) =====
    const wShift = flow(t, 1, 0.20);
    const sway = flow(t, 2, 0.13);
    const posture = 0.01 + flow(t, 3, 0.09) * 0.035;
    breathPhase += dt * (1.0 + 0.3 * flow(t, 4, 0.11) + 0.12 * flow(t, 4.5, 0.23));
    const breath = Math.sin(breathPhase) * (0.035 + 0.012 * flow(t, 4.7, 0.08));

    // ===== 编排式微场景(动捕基底上叠加:头部口音 + 手臂编排 + 表情) =====
    sceneTimer -= dt;
    if (!activeScene && !speaking && !busy && sceneTimer <= 0) {
      activeScene = { ...IDLE_SCENES[Math.floor(Math.random() * IDLE_SCENES.length)], start: t };
    }
    let sceneHeadTx = 0, sceneHeadTy = 0, sceneGaze = 0;
    if (activeScene) {
      const age = t - activeScene.start;
      if (age >= activeScene.dur) {
        activeScene = null;
        sceneTimer = 12 + Math.random() * 16;
      } else {
        const env = Math.sin(Math.min(1, age / activeScene.dur) * Math.PI);
        const p = activeScene.pose;
        sceneHeadTx = (p.hx || 0) * env;
        sceneHeadTy = (p.hy || 0) * env;
        if (p.gaze) sceneGaze = env;
        // 场景表情脉冲(看镜头微笑/好奇惊讶/害羞脸红)
        if (activeScene.name === 'look' && !exprPulse) exprPulse = { m: 'にこり', w: 0.6, dur: 1.8, start: t };
        else if (activeScene.name === 'curious' && !exprPulse) exprPulse = { m: 'びっくり', w: 0.3, dur: 1.0, start: t };
        else if (activeScene.name === 'shy' && !exprPulse) exprPulse = { m: '照れ', w: 0.5, dur: 1.6, start: t };
      }
    }

    // ===== 程序化待机:有机噪声流 + 重心转移 + 关节链延迟(鞭梢式) =====
    {
      gestureTimer -= dt;
      if (gestureTimer <= 0) { pickGesture(); gestureTimer = 6 + Math.random() * 8; }
      const gName = gesture ? gesture.name : '';
      const gEnv = gesture ? gestureEnv() : 0;
      const pose = activeScene ? activeScene.pose : null;
      const pEnv = activeScene ? Math.sin(Math.min(1, (t - activeScene.start) / activeScene.dur) * Math.PI) : 0;

      // —— 主控重心:单一慢噪声 + 相位差 → 骨盆椭圆(动捕已驱动 センター/下半身,程序化只补上层)——
      const wtx = Math.sin(t * 0.16) * 0.06 + flow(t, 12, 0.07) * 0.03;        // 左右
      const wtz = Math.sin(t * 0.11 + 1.3) * 0.05 + flow(t, 11, 0.06) * 0.03;  // 前后
      // 呼吸派生(延迟一小段,供手臂/肩膀跟随)
      const breathL = Math.sin(breathPhase - 0.2) * 0.02;
      const hipBone = bonesByName['腰'];
      if (hipBone) hipBone.rotation.z = -wtx * 0.4;
      const upBone = bonesByName['上半身'];
      if (upBone) {
        upBone.rotation.x = breath * 1.0 + posture * 0.8 - wtz * 0.3 + (gName === 'lean' ? gEnv * -0.09 : 0) + (pose ? pose.leanF * pEnv : 0);
        upBone.rotation.z = -wShift * 0.07 - wtx * 0.35;
        upBone.rotation.y = sway * 0.035;
      }
      const spine2 = bonesByName['上半身2'];
      if (spine2) spine2.rotation.x = breath * 0.3 + posture * 0.2 - wtz * 0.2;
      const spine3 = bonesByName['上半身3'];
      if (spine3) spine3.rotation.z = -wShift * 0.03 - wtx * 0.15;
      // 腿:重心转移时的轻微承重变化(幅度小,不破坏 IK 脚钉)
      const legL = bonesByName['左足'], legR = bonesByName['右足'];
      if (legL) legL.rotation.x = wtz * 0.25;
      if (legR) legR.rotation.x = -wtz * 0.25;

      const shL = bonesByName['左肩P'] || bonesByName['左肩'];
      const shR = bonesByName['右肩P'] || bonesByName['右肩'];
      const shrug = gName === 'shrug' ? gEnv : 0;
      const shLiftL = pose && pose.shoulder === 'L' ? pEnv * 0.22 : 0; // 好奇时左肩微耸
      if (shL) shL.rotation.x = breath * 1.2 + noise(t, microSeeds[0]) * 0.012 - shrug * 0.3 - shLiftL;
      if (shR) shR.rotation.x = breath * 1.2 + noise(t, microSeeds[1]) * 0.012 - shrug * 0.3;

      const armL = bonesByName['左腕'], armR = bonesByName['右腕'];
      const wave = gName === 'wave' ? gEnv : 0;
      const speakG = speaking ? Math.sin(t * 3.2) * 0.07 * mouthAmp : 0;
      // 场景手臂姿势口音(在动捕手臂之上叠加,幅度减半避免夸张)
      const sceneName = activeScene ? activeScene.name : '';
      const pArm = pose ? {
        zL: pose.armZ * pEnv * 0.65, zR: -pose.armZ * pEnv * 0.65,
        xL: pose.armX * pEnv * 0.65, xR: pose.armX * pEnv * 0.65,
        el: pose.elbow * pEnv * 0.65,
        wrL: pose.wrx * (sceneName === 'play' ? Math.sin(t * 3.5) : 1) * pEnv * 0.65,
        wrR: pose.wrx * (sceneName === 'play' ? -Math.sin(t * 3.5) : 1) * pEnv * 0.65,
      } : { zL: 0, zR: 0, xL: 0, xR: 0, el: 0, wrL: 0, wrR: 0 };
      // 动捕已驱动 腕/ひじ/手首(真实微动)→ 这里只叠加:微生命噪声 + 说话手部微动 + 挥手 + 场景口音
      const _armQ = new THREE.Quaternion();
      if (armL) {
        _armQ.setFromEuler(new THREE.Euler(
          pArm.xL + noise(t, microSeeds[2]) * 0.02,
          noise(t, microSeeds[2] + 1) * 0.015,
          pArm.zL + Math.sin(t * 8.5) * 0.18 * wave + noise(t, microSeeds[2] + 2) * 0.02
        ));
        armL.quaternion.multiply(_armQ);
      }
      if (armR) {
        _armQ.setFromEuler(new THREE.Euler(
          pArm.xR + noise(t, microSeeds[3]) * 0.02,
          noise(t, microSeeds[3] + 1) * 0.015,
          pArm.zR + noise(t, microSeeds[3] + 2) * 0.02
        ));
        armR.quaternion.multiply(_armQ);
      }
      const elL = bonesByName['左ひじ'], elR = bonesByName['右ひじ'];
      if (elL) {
        _armQ.setFromEuler(new THREE.Euler(pArm.el + speakG * 0.8 + noise(t, microSeeds[4]) * 0.03, 0, 0));
        elL.quaternion.multiply(_armQ);
      }
      if (elR) {
        _armQ.setFromEuler(new THREE.Euler(pArm.el + speakG * 0.8 + noise(t, microSeeds[5]) * 0.03, 0, 0));
        elR.quaternion.multiply(_armQ);
      }
      const wrL = bonesByName['左手首'], wrR = bonesByName['右手首'];
      if (wrL) {
        _armQ.setFromEuler(new THREE.Euler(pArm.wrL + speakG * 1.3 + noise(t, microSeeds[6]) * 0.05, noise(t, microSeeds[6] + 1) * 0.05, 0));
        wrL.quaternion.multiply(_armQ);
      }
      if (wrR) {
        _armQ.setFromEuler(new THREE.Euler(pArm.wrR + speakG * 1.3 + noise(t, microSeeds[7]) * 0.05, noise(t, microSeeds[7] + 1) * 0.05, 0));
        wrR.quaternion.multiply(_armQ);
      }

      // —— 注视目标(参考 pmx-pal):看镜头/看鼠标/慢漂移,指数平滑,±35°/±20° ——
      if (sceneGaze > 0) { gazeYawT = 0; gazePitchT = 0.05 * sceneGaze; }
      else if (gazeFixate) { gazeYawT = 0; gazePitchT = 0.03; }
      else if (!speaking && !busy && !gesture) {
        gazeYawT = mouseN.x * 0.5 + flow(t, 13, 0.06) * 0.10;
        gazePitchT = -mouseN.y * 0.35 + flow(t, 14, 0.06) * 0.06;
      }
      gazeYawT = Math.max(-0.61, Math.min(0.61, gazeYawT));
      gazePitchT = Math.max(-0.35, Math.min(0.35, gazePitchT));
      const gs = 1 - Math.exp(-8 * dt); // 帧率无关指数平滑(参考 pmx-pal 的 1-exp(-7dt))
      gazeYaw += (gazeYawT - gazeYaw) * gs;
      gazePitch += (gazePitchT - gazePitch) * gs;
      const neck = bonesByName['首'], headBone = bonesByName['頭'];
      // 头部基底已由动捕写入 → 这里只叠加:场景口音 + 手势 + 注视(四元数乘法,参考 pmx-pal)
      const _accQ = new THREE.Quaternion();
      let ax = 0, ay = 0, az = 0;
      if (activeScene) {
        ax += sceneHeadTy * 0.5;   // 场景低头/抬头口音
        ay += sceneHeadTx * 0.5;   // 场景转头口音
        if (pose && pose.turn) ay += pose.turn * pEnv; // 害羞时微微侧身
      }
      if (gName === 'nod') ax += 0.15 * gEnv;
      if (gName === 'tilt') az += 0.24 * gEnv;
      if (gName === 'shake') ay += Math.sin(gestureAge() * 15) * 0.24 * gEnv;
      if (gName === 'listen') ax += 0.12 * gEnv;
      // 注视权重分布(pmx-pal):颈 0.12 / 头 0.32 / 眼 0.56
      if (neck) {
        _accQ.setFromEuler(new THREE.Euler(-ax * 0.35 + noise(t, microSeeds[8]) * 0.01, ay * 0.4 + noise(t, microSeeds[9]) * 0.01, az * 0.5));
        neck.quaternion.multiply(_accQ);
        _accQ.setFromEuler(new THREE.Euler(-gazePitch * 0.10, gazeYaw * 0.12, 0));
        neck.quaternion.multiply(_accQ);
      }
      if (headBone) {
        _accQ.setFromEuler(new THREE.Euler(-ax * 0.3 + noise(t, microSeeds[10]) * 0.008, ay * 0.3 + noise(t, microSeeds[11]) * 0.008, az));
        headBone.quaternion.multiply(_accQ);
        _accQ.setFromEuler(new THREE.Euler(-gazePitch * 0.28, gazeYaw * 0.32, 0));
        headBone.quaternion.multiply(_accQ);
      }

      // 头发(无物理时程序化摆动;有物理时交给物理)
      if (!physics) animateHair(t, dt);
    }

    // ===== 专业 MMD 管线顺序:程序化骨骼 → IK 解算 → Grants 附加变换 → 物理 =====
    if (ikSolver) ikSolver.update();
    solveGrants();
    if (physics) physics.update(dt);

    // ===== 眼睛:快速扫视(参考 airi 的间隔分布)+ 注视叠加(权重 0.56) =====
    gazeTimer -= dt;
    if (gazeTimer <= 0) {
      gazeFixate = gazeFixate ? 0 : 1;
      gazeTimer = gazeFixate ? 2.2 : 12 + Math.random() * 22;
    }
    eyesSaccadeTimer -= dt;
    if (eyesSaccadeTimer <= 0) {
      eyesSaccadeTarget = (Math.random() - 0.5) * 0.18;
      eyesSaccadeTimer = 0.4 + Math.random() * 2.2; // 真人扫视更频繁(airi:多数 0.8~2.4s)
    }
    eyesSaccade += (eyesSaccadeTarget - eyesSaccade) * (1 - Math.exp(-12 * dt));
    const eyes = bonesByName['両目'];
    if (eyes) {
      const gz = Math.max(gazeFixate, sceneGaze);
      eyes.rotation.y = (1 - gz) * (eyesSaccade + noise(t, microSeeds[0] + 3) * 0.01) + gazeYaw * 0.56;
      eyes.rotation.x = (1 - gz) * noise(t, microSeeds[0] + 4) * 0.008 - gazePitch * 0.56;
    }

    // ===== 微表情脉冲(偶尔微笑/好奇/惊讶一闪而过) =====
    exprPulseTimer -= dt;
    if (exprPulseTimer <= 0 && !speaking) {
      const pool = [
        { m: '笑い', w: 0.55, dur: 1.6 }, { m: 'にこり', w: 0.6, dur: 1.8 },
        { m: 'びっくり', w: 0.4, dur: 0.9 }, { m: '真面目', w: 0.5, dur: 1.4 },
        { m: 'なごみ', w: 0.45, dur: 1.6 }, { m: 'てへぺろ', w: 0.4, dur: 1.2 },
        { m: '照れ', w: 0.45, dur: 1.5 },
      ];
      const p = pool[Math.floor(Math.random() * pool.length)];
      exprPulse = { m: p.m, w: p.w, start: t, dur: p.dur };
      exprPulseTimer = 6 + Math.random() * 9;
    }

    // 整体随呼吸微浮
    if (model._groundY !== undefined) model.position.y = model._groundY + Math.sin(breathPhase) * 0.009;

    // ===== 眨眼 + 偶尔俏皮眨眼 =====
    updateBlink(dt);
    // ===== 表情与口型(始终) =====
    updateMorphs(t, dt);
  }
  // ===== 相机:呼吸跟随 + 缓慢漂移(点击不带动镜头) =====
  const cb = Math.sin(breathPhase) * 0.014;
  camera.position.x = flow(t, 20, 0.05) * 0.035 + Math.sin(t * 0.27) * 0.02;
  camera.position.y = 1.375 + cb + flow(t, 21, 0.07) * 0.018;
  camera.position.z = 1.39 + flow(t, 22, 0.04) * 0.06;
  camera.lookAt(0, 1.375 + cb * 0.5, 0);
  // 蝴蝶 + 花瓣 + 点击光点
  animateButterflies(t);
  animatePetals(t, dt);
  animateBursts(dt);
  renderer.render(scene, camera);
}

// ---- 小动作(手势)系统 ----
function pickGesture() {
  const pool = ['nod', 'tilt', 'shake', 'shrug', 'wave', 'listen', 'lean'];
  gesture = { name: pool[Math.floor(Math.random() * pool.length)], start: clock.elapsedTime };
}
function gestureAge() { return gesture ? clock.elapsedTime - gesture.start : 0; }
function gestureEnv() {
  if (!gesture) return 0;
  const a = gestureAge();
  const dur = 1.3;
  if (a >= dur) { gesture = null; return 0; }
  return Math.sin(Math.min(1, a / dur) * Math.PI);
}
function updateGesture() {
  if (gesture && gestureAge() > 1.3) gesture = null;
}

function animateHair(t, dt) {
  // 覆盖纳西妲的头发(髮)/披风布料(CF/FB)/树叶装饰,链式骨骼产生波动
  const hairBones = [];
  for (const [name, b] of Object.entries(bonesByName)) {
    if (/发|髮|髪|树叶|CF|FB/.test(name)) hairBones.push({ name, b });
  }
  if (!hairBones.length) return;
  hairBones.forEach(({ name, b }, gi) => {
    // 连续噪声阵风:无突变
    const gust = flow(t, 50 + gi * 3, 0.22);
    const dir = gi % 2 === 0 ? 1 : -1;
    const freq = 1.1 + (gi % 3) * 0.35;
    // 从名字解析链序号(如 树叶_3_1 → 3),越靠末端摆幅越大
    const m = name.match(/_(\d+)_/);
    const i = m ? parseInt(m[1]) : gi % 6;
    const gustMix = 0.55 + 0.45 * (0.5 + 0.5 * gust);
    const phase = i * 0.8 + gi * 1.7;
    const amp = Math.min(0.24, 0.09 * (1 + i * 0.16));
    b.rotation.x = Math.sin(t * freq + phase) * amp * gustMix + gust * 0.04;
    b.rotation.z = dir * Math.sin(t * freq * 0.8 + phase * 1.3) * amp * 0.4 * gustMix;
  });
}

function updateBlink(dt) {
  blinkTimer -= dt;
  if (blinkTimer <= 0) { blinkState = 1; blinkTimer = 2.4 + Math.random() * 3.2; }
  if (blinkState > 0) { blinkState += dt; if (blinkState > 0.16) blinkState = 0; }
  const w = blinkState > 0 ? Math.sin(blinkState / 0.16 * Math.PI) : 0;
  const idx = morphDict['まばたき'];
  if (idx !== undefined) morphInf[idx] = Math.max(w, morphInf[idx]);

  // 偶尔俏皮眨眼(wink)
  winkTimer -= dt;
  if (winkTimer <= 0) { winkState = 1; winkTimer = 16 + Math.random() * 14; }
  if (winkState > 0) { winkState += dt; if (winkState > 0.3) winkState = 0; }
  if (winkState > 0) {
    const ww = Math.sin(winkState / 0.3 * Math.PI);
    const wi = morphDict['ウィンク'];
    if (wi !== undefined) morphInf[wi] = Math.max(ww, morphInf[wi]);
  }
}

function updateMorphs(t, dt) {
  if (!morphInf) return;
  // ===== 连续情感状态:平滑逼近目标 + 缓慢情绪漂移(像真人心情自然起伏) =====
  valence += (valenceTarget - valence) * 0.035 + flow(t, 30, 0.03) * 0.005;
  arousal += (arousalTarget - arousal) * 0.035 + flow(t, 31, 0.05) * 0.005;
  valence = Math.max(-1, Math.min(1, valence));
  arousal = Math.max(-1, Math.min(1, arousal));

  const targets = new Map(exprTarget);
  // 情感 → 表情(连续混合,平滑过渡)
  const wSmile = Math.max(0, valence) * 0.85;
  const wSad = Math.max(0, -valence) * 0.8;
  const wSurprise = Math.max(0, arousal - 0.5) * 0.9;
  const wSerious = Math.max(0, -arousal - 0.2) * 0.8;
  const wCurious = Math.max(0, arousal - 0.15) * 0.4;
  if (wSmile > 0.06) {
    set('笑い', Math.max(wSmile * 0.8, get('笑い')));
    set('にこり', Math.max(wSmile * 0.5, get('にこり')));
    set('口角上げ', Math.max(wSmile * 0.4, get('口角上げ')));
  }
  if (wSad > 0.06) set('困る', Math.max(wSad, get('困る')));
  if (wSurprise > 0.06) set('びっくり', Math.max(wSurprise, get('びっくり')));
  if (wSerious > 0.06) set('真面目', Math.max(wSerious, get('真面目')));
  if (wCurious > 0.06) set('真面目', Math.max(wCurious * 0.5, get('真面目')));
  function set(name, w) { if (morphDict[name] !== undefined) targets.set(name, w); }
  function get(name) { return targets.get(name) || 0; }

  // 微表情脉冲(偶尔的微笑/好奇/惊讶,正弦包络淡入淡出)
  if (exprPulse) {
    const age = t - exprPulse.start;
    if (age >= exprPulse.dur) { exprPulse = null; }
    else {
      const env = Math.sin(age / exprPulse.dur * Math.PI);
      const idx = morphDict[exprPulse.m];
      if (idx !== undefined) targets.set(exprPulse.m, Math.max(targets.get(exprPulse.m) || 0, exprPulse.w * env));
    }
  }
  // 说话口型(音量驱动 + 随机口型序列更自然)
  if (speaking) {
    const mouthW = Math.min(1, mouthAmp * 2.4 + 0.3) * (0.45 + 0.55 * (Math.sin(t * 11) * 0.5 + 0.5));
    const m = MOUTH_MORPHS[Math.floor((t * 8 + Math.sin(t * 3.1) * 2) % MOUTH_MORPHS.length + MOUTH_MORPHS.length) % MOUTH_MORPHS.length];
    const idx = morphDict[m];
    if (idx !== undefined) targets.set(m, mouthW);
  }
  // 平滑混合
  const allNames = new Set([...exprCurrent.keys(), ...targets.keys()]);
  allNames.forEach(name => {
    const idx = morphDict[name];
    if (idx === undefined) return;
    const cur = exprCurrent.get(name) || 0;
    const tgt = targets.get(name) || 0;
    const next = cur + (tgt - cur) * 0.16;
    exprCurrent.set(name, next);
    morphInf[idx] = next;
  });
}

// ---------- 森林绿叶粒子(飘落的嫩绿叶,呼应草元素) ----------
let petals = [];
function initPetals() {
  const geo = new THREE.BufferGeometry();
  const n = 34;
  const pos = new Float32Array(n * 3);
  const rand = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 3.2;
    pos[i * 3 + 1] = 0.2 + Math.random() * 2.6;
    pos[i * 3 + 2] = -0.3 - Math.random() * 2.2;
    rand[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // 画一片嫩绿叶(绿→金渐变 + 叶脉)
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const lg = g.createLinearGradient(2, 16, 30, 16);
  lg.addColorStop(0, 'rgba(140,220,150,0.95)');
  lg.addColorStop(1, 'rgba(255,220,130,0.95)');
  g.fillStyle = lg;
  g.beginPath();
  g.ellipse(16, 16, 12, 5, 0.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(90,170,110,0.7)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(5, 14); g.lineTo(27, 18);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.PointsMaterial({
    size: 0.06, map: tex, transparent: true, depthWrite: false,
    opacity: settings.night ? 0.85 : 0.7,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData.rand = rand;
  pts.userData.speeds = Array.from({ length: n }, () => 0.0009 + Math.random() * 0.0013);
  scene.add(pts);
  petals.push(pts);
}
function animatePetals(t, dt) {
  for (const pts of petals) {
    const pos = pts.geometry.attributes.position;
    const rand = pts.userData.rand;
    const speeds = pts.userData.speeds;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - speeds[i];
      if (y < 0.05) y = 2.9;
      pos.setY(i, y);
      // 树叶飘落:左右摆 + 二次谐波,更轻盈
      pos.setX(i, pos.getX(i) + (Math.sin(t * 0.8 + rand[i]) + Math.sin(t * 1.7 + rand[i] * 2) * 0.5) * 0.0016);
      pos.setZ(i, pos.getZ(i) + Math.cos(t * 0.6 + rand[i]) * 0.0014);
    }
    pos.needsUpdate = true;
  }
}

function initButterflies() {
  const geo = new THREE.BufferGeometry();
  const n = 30;
  const pos = new Float32Array(n * 3);
  const rand = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 4.2;
    pos[i * 3 + 1] = 0.3 + Math.random() * 2.4;
    pos[i * 3 + 2] = -0.8 - Math.random() * 2.6;
    rand[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // 用 canvas 画一个发光小点
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,214,150,1)');
  grad.addColorStop(0.4, 'rgba(255,170,120,0.55)');
  grad.addColorStop(1, 'rgba(255,120,120,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.PointsMaterial({ size: 0.09, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.userData.rand = rand;
  scene.add(pts);
  butterflies.push(pts);
}
function animateButterflies(t) {
  for (const pts of butterflies) {
    const pos = pts.geometry.attributes.position;
    const rand = pts.userData.rand;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      y += 0.0025;
      if (y > 2.9) y = 0.3;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(t * 1.1 + rand[i]) * 0.0012);
      pos.setZ(i, pos.getZ(i) + Math.cos(t * 0.9 + rand[i]) * 0.0012);
    }
    pos.needsUpdate = true;
    pts.material.opacity = settings.night ? 0.85 : 0.4;
  }
}

// ---------- 聊天 ----------
// 微信式居中系统消息(如关系阶段提示)
function appendSysDivider(text) {
  const div = document.createElement('div');
  div.className = 'sys-divider';
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendMsg(role, text, meta = {}) {
  const row = document.createElement('div');
  row.className = 'msg ' + (role === 'user' ? 'user' : 'hutao');
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? '🧑‍🚀' : '🍃';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  row.appendChild(avatar); row.appendChild(bubble);
  if (meta.emotion) {
    const tag = document.createElement('div');
    tag.className = 'emotion-tag';
    tag.textContent = (EMOJI[meta.emotion] || '') + ' ' + (meta.emotion || '');
    bubble.appendChild(tag);
  }
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

function setThinking(on) {
  busy = on;
  thinkingDot.classList.toggle('hidden', !on);
  if (on) setEmotionGoal('serious');
}

function showSpeech(text) {
  speechBubble.textContent = text;
  speechBubble.classList.remove('hidden');
  requestAnimationFrame(() => speechBubble.classList.add('show'));
  clearTimeout(showSpeech._t);
  showSpeech._t = setTimeout(() => speechBubble.classList.remove('show'), 5200);
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  appendMsg('user', text);
  setThinking(true);
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, userName: settings.nick }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    setThinking(false);
    setEmotionGoal(j.emotion || 'normal');
    appendMsg('hutao', j.reply, { emotion: j.emotion });
    showSpeech(j.reply);
    if (j.stage) setStage(j.stage);
    if (settings.voice) speak(j.reply);
  } catch (e) {
    setThinking(false);
    appendMsg('hutao', '诶呀,我这边出了点小问题…(系统:' + e.message + ')');
    showToast('纳西妲的"大脑"没连上,请检查 config.json');
  }
}

// ---------- 语音合成(Edge 神经网络) + 口型 ----------
let audioCtx, analyser, audioEl, audioGain, voiceReady = false;
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioEl = new Audio();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  const src = audioCtx.createMediaElementSource(audioEl);
  src.connect(analyser);
  analyser.connect(audioCtx.destination);
  audioGain = audioCtx.createGain();
  audioGain.connect(audioCtx.destination);
  // 用时间域数据算音量
  const syncL2DSpeech = (on) => { if (window.TaffyLive2D && window.TaffyLive2D.ready) window.TaffyLive2D.setSpeaking(on); };
  audioEl.addEventListener('play', () => { speaking = true; syncL2DSpeech(true); });
  audioEl.addEventListener('ended', () => { speaking = false; mouthAmp = 0; syncL2DSpeech(false); });
  audioEl.addEventListener('pause', () => { speaking = false; syncL2DSpeech(false); });
  // 音量采样
  setInterval(() => {
    if (!speaking || !analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
    mouthAmp = Math.min(1, Math.sqrt(sum / data.length) * 2.6);
    if (window.TaffyLive2D && window.TaffyLive2D.ready) window.TaffyLive2D.setMouth(mouthAmp);
  }, 80);
  voiceReady = true;
}

async function speak(text, emotionOverride) {
  try {
    initAudio();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const clean = text.replace(/【emotion:\w+】/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
    if (!clean) return;
    // emotionOverride 用于强制某情绪语调(如摄像头反馈统一用 normal,保证声音与聊天一致)
    const emo = emotionOverride || emotionNow;
    const r = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, emotion: emo }),
    });
    if (!r.ok) throw new Error('tts ' + r.status);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    audioEl.src = url;
    await audioEl.play();
  } catch (e) {
    console.warn('[tts] 服务器合成失败,回退浏览器语音', e.message);
    speakBrowserFallback(text);
  }
}

// 浏览器自带语音回退(按情绪调节语速音调,音调整体拉高更显低龄)
function speakBrowserFallback(text) {
  const clean = text.replace(/【emotion:\w+】/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
  if (!clean || !('speechSynthesis' in window)) { speaking = false; return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  const pick =
    voices.find(v => /xiaoyi.*online.*natural/i.test(v.name)) ||
    voices.find(v => /xiaoxiao.*online.*natural/i.test(v.name)) ||
    voices.find(v => /zh-CN/i.test(v.lang) && /natural/i.test(v.name)) ||
    voices.find(v => /zh-CN/i.test(v.lang)) ||
    voices.find(v => /Chinese/i.test(v.lang));
  if (pick) u.voice = pick;
  u.lang = pick ? pick.lang : 'zh-CN';
  // 情绪 → 语速/音调(音调偏高 → 低龄感)
  const V = {
    happy: [1.18, 1.32], shy: [1.05, 1.28], sad: [0.95, 1.12],
    angry: [1.12, 1.12], surprised: [1.24, 1.38], serious: [1.0, 1.2],
    smug: [1.16, 1.3], normal: [1.12, 1.28],
  };
  const [r, p] = V[emotionNow] || V.normal;
  u.rate = r;
  u.pitch = p;
  u.onstart = () => { speaking = true; if (window.TaffyLive2D && window.TaffyLive2D.ready) window.TaffyLive2D.setSpeaking(true); };
  u.onend = () => { speaking = false; mouthAmp = 0; if (window.TaffyLive2D && window.TaffyLive2D.ready) window.TaffyLive2D.setSpeaking(false); };
  u.onerror = () => { speaking = false; };
  window.speechSynthesis.speak(u);
}

// ---------- 语音输入 ----------
let recognition = null;
function initMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btnMic.style.display = 'none'; return; }
  recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = (e) => {
    let txt = '';
    for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
    chatInput.value = txt;
  };
  recognition.onend = () => { btnMic.classList.remove('listening'); btnMic.textContent = '🎤'; };
  recognition.onerror = (e) => { btnMic.classList.remove('listening'); btnMic.textContent = '🎤'; showToast('语音识别失败:' + e.error); };
  btnMic.onclick = () => {
    if (btnMic.classList.contains('listening')) { recognition.stop(); return; }
    // 开始录音前先静音纳西妲的声音:避免麦克风把她自己的声音录进去(回声问题)
    if (audioEl) audioEl.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    speaking = false; mouthAmp = 0;
    if (window.TaffyLive2D && window.TaffyLive2D.ready) window.TaffyLive2D.setSpeaking(false);
    try {
      recognition.start();
      btnMic.classList.add('listening');
      btnMic.textContent = '🔴';
    } catch { /* already started */ }
  };
}

// ---------- 背景音乐(WebAudio 合成,音乐盒风格) ----------
let musicTimer = null, musicStep = 0;
const MUSIC_NOTES = [
  523.25, 659.25, 783.99, 659.25, 587.33, 659.25, 523.25, 0,
  523.25, 659.25, 783.99, 880.00, 783.99, 659.25, 587.33, 523.25,
  440.00, 523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 440.00,
  523.25, 587.33, 659.25, 783.99, 880.00, 783.99, 659.25, 523.25,
];
function startMusic() {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  musicStep = 0;
  musicTimer = setInterval(() => {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const f = MUSIC_NOTES[musicStep % MUSIC_NOTES.length];
    if (f > 0) {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.09, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
      osc.connect(g); g.connect(audioGain);
      osc.start(now); osc.stop(now + 1.2);
      // 高八度装饰音
      const osc2 = audioCtx.createOscillator();
      const g2 = audioCtx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.value = f * 2;
      g2.gain.setValueAtTime(0, now);
      g2.gain.linearRampToValueAtTime(0.028, now + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc2.connect(g2); g2.connect(audioGain);
      osc2.start(now); osc2.stop(now + 0.6);
    }
    musicStep++;
  }, 260);
  btnMusic.classList.add('active');
}
function stopMusic() {
  clearInterval(musicTimer); musicTimer = null;
  btnMusic.classList.remove('active');
}

// ---------- 夜晚模式 ----------
function applyNight(on) {
  document.body.classList.toggle('night', on);
  btnNight.classList.toggle('active', on);
}

// ---------- 设置 ----------
function openSettings() {
  setNick.value = settings.nick;
  setVoice.checked = settings.voice;
  setMusic.checked = settings.music;
  setNight.checked = settings.night;
  settingsModal.classList.remove('hidden');
}
function closeSettings() {
  settings.nick = setNick.value.trim() || '亲爱的';
  settings.voice = setVoice.checked;
  settings.music = setMusic.checked;
  settings.night = setNight.checked;
  localStorage.setItem('hutao-settings', JSON.stringify(settings));
  settingsModal.classList.add('hidden');
  applyNight(settings.night);
  if (settings.music) startMusic(); else stopMusic();
}

// ---------- 事件绑定 ----------
btnSend.onclick = sendMessage;
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
btnChatMin.onclick = () => { const p = $('chat-panel'); p.classList.toggle('minimized'); btnChatMin.textContent = p.classList.contains('minimized') ? '+' : '–'; };
btnSettings.onclick = openSettings;
$('btn-settings-close').onclick = closeSettings;
settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeSettings(); });
btnMusic.onclick = () => {
  settings.music = !settings.music;
  if (settings.music) { initAudio(); audioCtx.resume(); startMusic(); }
  else stopMusic();
  localStorage.setItem('hutao-settings', JSON.stringify(settings));
};
btnNight.onclick = () => {
  settings.night = !settings.night;
  applyNight(settings.night);
  localStorage.setItem('hutao-settings', JSON.stringify(settings));
};
// 首次用户交互时解锁音频(浏览器自动播放策略)
window.addEventListener('pointerdown', function unlock() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  window.removeEventListener('pointerdown', unlock);
}, { once: true });

// ---------- 关系阶段(微信式系统消息) ----------
let stageLevel = 0;
const STAGE_HINT = {
  0: '你们刚刚认识,多聊聊会越来越熟哦',
  1: '你们渐渐熟悉起来了',
  2: '你们已经是很聊得来的朋友啦',
  3: '你们已经非常亲近了',
};
function setStage(stage, silent = false) {
  if (!stage) return;
  const upgraded = stage.level > stageLevel && stageLevel !== 0;
  if (upgraded) {
    appendSysDivider('🌸 你们的关系变成了「' + stage.emoji + ' ' + stage.name + '」');
    showToast(stage.emoji + ' 关系升级:' + stage.name + '!');
    setEmotionGoal('happy');
  } else if (!silent && stage.level === 0 && !chatMessages.querySelector('.sys-divider')) {
    appendSysDivider('🌱 初识 · ' + STAGE_HINT[0]);
  }
  stageLevel = stage.level;
}

// ---------- 启动(Live2D 二次元模式,唯一渲染)----------
(async function boot() {
  applyNight(settings.night);
  try {
    const cfg = await (await fetch('/api/config')).json();
    // 只有用户没自定义过称呼时,才用配置里的默认称呼
    if (cfg.userName && !(JSON.parse(localStorage.getItem('hutao-settings') || '{}').nick)) {
      settings.nick = cfg.userName;
    }
    brainState.textContent = cfg.hasKey ? 'DeepSeek AI(已连接) ✓' : '本地模式(未配置 Key)';
    if (cfg.stage) setStage(cfg.stage);
  } catch { brainState.textContent = '未知'; }
  // 恢复历史
  try {
    const mem = await (await fetch('/api/memory')).json();
    (mem || []).forEach(m => appendMsg(m.role, m.content, { emotion: m.emotion }));
  } catch {}
  initMic();
  statusLine.textContent = '正在唤醒纳西妲…';
  // ===== Live2D 渲染(2D 二次元;失败则提示刷新,不回退 3D)=====
  const live2dEl = document.getElementById('live2d-stage');
  if (live2dEl && window.TaffyLive2D) {
    window.TaffyLive2D.onReady = () => {
      useLive2D = true;
      statusLine.textContent = '';
      console.log('[taffy] Live2D 二次元模式已启用');
    };
    window.TaffyLive2D.onError = (e) => {
      console.error('[taffy] Live2D 加载失败:', e);
      statusLine.textContent = 'Live2D 加载失败:' + String(e).slice(0, 80);
    };
    window.TaffyLive2D.init(live2dEl);
    // (点击互动已按用户要求暂时删除)
    // 鼠标跟随:头部/眼睛轻轻转向鼠标位置(anime-desktop-pet 同款 model.focus)
    window.addEventListener('pointermove', e => {
      mouseN.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseN.y = (e.clientY / window.innerHeight) * 2 - 1;
      if (window.TaffyLive2D && window.TaffyLive2D.ready) {
        window.TaffyLive2D.setPointer(e.clientX, e.clientY);
      }
    }, { passive: true });
  } else {
    statusLine.textContent = 'Live2D 组件缺失,请刷新重试';
  }
  if (settings.music) startMusic();
  // ===== 摄像头:人脸检测 + 情绪识别(face-api.js),她能看到你的表情 =====
  const EMOTION_REACT = {
    happy: ['看你笑得这么开心,我也跟着高兴起来啦~', '诶嘿,你开心的样子真好看,多笑一点嘛。'],
    sad: ['诶?你看起来有点难过……过来,让我抱抱你。', '怎么了呀?不开心的话,跟我说说嘛,我听着呢。'],
    angry: ['唔……你好像有点生气,要不要跟我说说?', '别气啦,生气会变丑的……来,深呼吸~'],
    surprised: ['哇,你好像被吓到了?没事吧?', '诶?!什么事让你这么惊讶,快讲给我听!'],
    fearful: ['别怕别怕,有我在呢。', '唔…你看起来有点不安,我陪着你。'],
    disgusted: ['诶?看到什么不干净的东西了吗?', '嫌弃脸~!不过,我还是最喜欢你啦。'],
    neutral: null,
  };
  let camReactCooldown = 0;
  if (btnCam && window.CameraVision) {
    btnCam.onclick = async () => {
      if (window.CameraVision.isOn) {
        window.CameraVision.stop();
        btnCam.classList.remove('active');
        showToast('📷 摄像头已关闭');
        return;
      }
      const r = await window.CameraVision.start();
      if (r.ok) {
        btnCam.classList.add('active');
        showToast('📷 摄像头已开启,我能看到你的表情啦');
      } else {
        showToast('摄像头开启失败:' + String(r.error).slice(0, 26));
      }
    };
    window.CameraVision.onEmotion((emotion, conf) => {
      const now = performance.now();
      if (now - camReactCooldown < 25000) return; // 冷却 25s,避免刷屏
      if (!useLive2D || speaking || busy || document.hidden) return;
      const lines = EMOTION_REACT[emotion];
      if (!lines || conf < 0.75) return; // 置信度不足不打扰
      camReactCooldown = now;
      const line = lines[Math.floor(Math.random() * lines.length)];
      const emo = (emotion === 'sad' || emotion === 'angry' || emotion === 'surprised' || emotion === 'fearful') ? emotion : 'happy';
      setEmotionGoal(emo); // Live2D 表情随情绪
      showSpeech(line);
      // 语音统一用 normal 语调:保证"反馈的声音"和聊天互动的声音一致(之前强制情绪语调导致声音变调)
      if (settings.voice) speak(line, 'normal');
    });
    // 动作识别反馈(挥手/举手/点头/摇头)
    const ACTION_REACT = {
      wave: ['诶?你在跟我挥手呀?嗨~!', '你在打招呼吗?我也挥挥手~'],
      raise: ['嗯?你举手啦,是有什么想说的吗?', '举手举手!你说,我听着呢~'],
      nod: ['嗯嗯,我懂啦~', '看到你点头,我就放心啦。'],
      shake: ['不同意呀?那你说说看嘛~', '诶?你摇头啦,我说的不对吗?'],
    };
    window.CameraVision.onAction((action) => {
      const now = performance.now();
      if (now - camReactCooldown < 20000) return; // 动作冷却 20s
      if (!useLive2D || speaking || busy || document.hidden) return;
      const lines = ACTION_REACT[action];
      if (!lines) return;
      camReactCooldown = now;
      const line = lines[Math.floor(Math.random() * lines.length)];
      setEmotionGoal(action === 'shake' ? 'serious' : 'happy');
      showSpeech(line);
      if (settings.voice) speak(line, 'normal');
    });
    // 官方手势识别反馈(MediaPipe GestureRecognizer:👍✌️🖐👊☝️🤟)
    const GESTURE_REACT = {
      Thumb_Up: ['诶?你给我点赞啦?嘿嘿,那我收下啦~', '这个赞,我抱在怀里啦~'],
      Victory: ['耶!胜利手势!看来你今天心情不错嘛~', '✌️ 我也比一个,嘿嘿~'],
      Open_Palm: ['击掌!✋ 啪!', '来来来,击个掌~'],
      Closed_Fist: ['握拳?是给我加油的意思吗?', '嗯?攥着小拳头,是要捶我还是给我打气呀?'],
      Pointing_Up: ['嗯?你在指什么呀?', '哦哦,我知道了~'],
      ILoveYou: ['……这个手势,我记在心里啦。', '❤ 你、你突然来这个……人家会不好意思的。'],
      Thumb_Down: ['诶?拇指向下?我哪里做得不好嘛……', '唔…被比拇指向下了,委屈。'],
    };
    window.CameraVision.onGesture((gesture) => {
      const now = performance.now();
      if (now - camReactCooldown < 12000) return; // 手势冷却 12s
      if (!useLive2D || speaking || busy || document.hidden) return;
      const lines = GESTURE_REACT[gesture];
      if (!lines) return;
      camReactCooldown = now;
      const line = lines[Math.floor(Math.random() * lines.length)];
      setEmotionGoal(gesture === 'Thumb_Down' ? 'sad' : 'happy');
      showSpeech(line);
      if (settings.voice) speak(line, 'normal');
    });
  }
  // 主动互动:她偶尔会主动找你说话(参考 N.E.K.O 猫娘的做法)
  setTimeout(scheduleProactive, 60000 + Math.random() * 60000);
})();

function scheduleProactive() {
  const next = () => setTimeout(scheduleProactive, 150000 + Math.random() * 120000);
  if ((!model && !useLive2D) || speaking || busy || document.hidden) { next(); return; }
  const [line, emotion] = PROACTIVE_LINES[Math.floor(Math.random() * PROACTIVE_LINES.length)];
  if (!line) { next(); return; }
  setEmotionGoal(emotion);
  showSpeech(line);
  if (settings.voice) speak(line);
  const g = ['listen', 'tilt', 'nod', null, null][Math.floor(Math.random() * 5)];
  if (g) gesture = { name: g, start: clock.elapsedTime };
  next();
}
