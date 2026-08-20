// ============ 摄像头视觉模块:人脸检测 + 情绪识别(face-api.js) ============
// 参考 face-emotion-detection-web-live 等类似项目:tinyFaceDetector + faceExpressionNet
// 左下角显示摄像头画面(镜像),框出人脸并标注情绪;情绪通过 onEmotion 回调喂给 AI
(function () {
  const EMOJI = { happy: '😊', sad: '😢', angry: '😠', surprised: '😲', fearful: '😨', disgusted: '🤢', neutral: '😐' };
  const CN = { happy: '开心', sad: '难过', angry: '生气', surprised: '惊讶', fearful: '害怕', disgusted: '嫌弃', neutral: '平静' };

  const state = { on: false, ready: false, emotion: null, confidence: 0, lastEmotion: null };
  let video = null, canvas = null, ctx = null, stream = null, detectTimer = null, raf = null, lastDet = null;
  let onEmotionCallback = null, onActionCallback = null, onGestureCallback = null;

  // ===== 官方手势识别(MediaPipe GestureRecognizer:👍✌️🖐👊☝️,官方模型输出,可靠)=====
  let gestureRecognizer = null, gestureReady = false, gestureLabel = '';
  const GESTURE_CN = { Thumb_Up: '👍 点赞', Victory: '✌️ 胜利', Open_Palm: '🖐 手掌', Closed_Fist: '👊 握拳', Pointing_Up: '☝️ 食指', ILoveYou: '🤟 爱你', Thumb_Down: '👎 拇指向下' };

  async function initGesture() {
    if (gestureReady) return true;
    try {
      const { FilesetResolver, GestureRecognizer } = await import('/vendor/mediapipe/vision_bundle.mjs');
      const vision = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      try {
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: '/vendor/mediapipe/gesture_recognizer.task', delegate: 'GPU' },
          runningMode: 'VIDEO', numHands: 1,
        });
      } catch (e) {
        console.warn('[camera] 手势 GPU 不可用,回退 CPU:', e.message);
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: '/vendor/mediapipe/gesture_recognizer.task', delegate: 'CPU' },
          runningMode: 'VIDEO', numHands: 1,
        });
      }
      gestureReady = true;
      console.log('[camera] 官方手势识别就绪');
      return true;
    } catch (e) {
      console.warn('[camera] 手势识别初始化失败:', e.message);
      return false;
    }
  }

  async function detectGesture() {
    if (!gestureReady || !video) return;
    try {
      const result = gestureRecognizer.recognizeForVideo(video, performance.now());
      const g = result.gestures && result.gestures[0] && result.gestures[0][0];
      const name = g ? g.categoryName : 'None';
      if (name && name !== 'None' && name !== gestureLabel) {
        gestureLabel = name;
        if (onGestureCallback) onGestureCallback(name, g.score || 0);
      } else if (!name || name === 'None') {
        gestureLabel = '';
      }
    } catch (e) {
      if (/timestamp|time/.test(String(e.message))) lastVideoTime = -1;
      console.warn('[camera] 手势检测错误:', e.message);
    }
  }

  // ===== 动作识别(MediaPipe PoseLandmarker 0.10.35,参考 CRPRPO 项目做法)=====
  let poseLandmarker = null, poseReady = false, actionLabel = '';
  let lastVideoTime = -1;
  const POSE_SAMPLES = [];

  async function initPose() {
    if (poseReady) return true;
    try {
      showPanelHint('加载动作识别…');
      const { FilesetResolver, PoseLandmarker } = await import('/vendor/mediapipe/vision_bundle.mjs');
      const vision = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      // 先试 GPU,失败回退 CPU(参考项目默认 GPU)
      try {
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: '/vendor/mediapipe/pose_landmarker_lite.task', delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      } catch (e) {
        console.warn('[camera] GPU 姿态加速不可用,回退 CPU:', e.message);
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: '/vendor/mediapipe/pose_landmarker_lite.task', delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      }
      poseReady = true;
      console.log('[camera] 动作识别模型就绪(MediaPipe Pose 0.10.35)');
      showPanelHint('动作识别已就绪');
      return true;
    } catch (e) {
      console.warn('[camera] 动作识别初始化失败:', e.message);
      showPanelHint('动作识别不可用');
      return false;
    }
  }

  async function detectPose() {
    if (!poseReady || !video) return;
    // 参考项目:仅在新视频帧时检测
    if (video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    try {
      const result = poseLandmarker.detectForVideo(video, performance.now());
      if (result.landmarks && result.landmarks[0]) classifyPose(result.landmarks[0]);
    } catch (e) {
      // detectForVideo 时间戳必须递增;出错时重置游标
      if (/timestamp|time/.test(String(e.message))) lastVideoTime = -1;
      console.warn('[camera] 动作检测错误:', e.message);
    }
  }

  // ===== 动作识别核心:方向翻转状态机(动作完整性验证) =====
  // 原则:动作必须"完整翻转"才算(摇头=左→右→左,点头=下→上→下),死区过滤噪声
  // 参考"活体检测/动作完整性验证"思路:瞬时偏移不算动作,完整周期才算

  // 统计最近 window 个样本里,序列的方向翻转次数(死区 deadband 内忽略)
  function directionChanges(values, deadband) {
    let dir = 0, changes = 0, last = values[0];
    for (let i = 1; i < values.length; i++) {
      const d = values[i] - last;
      last = values[i];
      if (Math.abs(d) < deadband) continue; // 死区:噪声忽略
      const ndir = d > 0 ? 1 : -1;
      if (dir !== 0 && ndir !== dir) changes++; // 方向翻转才算
      dir = ndir;
    }
    return changes;
  }

  // MediaPipe 33 关键点:0鼻 11左肩 12右肩 15左腕 16右腕(坐标已归一化 0~1)
  function classifyPose(landmarks) {
    if (!landmarks || landmarks.length < 17) return;
    const get = i => ({ x: landmarks[i].x, y: landmarks[i].y, v: landmarks[i].visibility || 0 });
    const nose = get(0), lS = get(11), rS = get(12), lW = get(15), rW = get(16);
    if (nose.v < 0.3) return; // 脸都没检测到就不判
    const now = Date.now();
    POSE_SAMPLES.push({
      t: now, nx: nose.x, ny: nose.y,
      sy: (lS.v > 0.3 && rS.v > 0.3) ? (lS.y + rS.y) / 2 : null,
      lWy: lW.v > 0.4 ? lW.y : null, rWy: rW.v > 0.4 ? rW.y : null,
      lWx: lW.x, rWx: rW.x,
    });
    while (POSE_SAMPLES.length > 60) POSE_SAMPLES.shift();
    // 数据新鲜度
    if (now - POSE_SAMPLES[POSE_SAMPLES.length - 1].t > 1500) return;
    if (POSE_SAMPLES.length < 7) return;

    // 用最近 ~2.5s(约 8 个样本)判断动作周期
    const win = POSE_SAMPLES.slice(-8);
    const nx = win.map(s => s.nx), ny = win.map(s => s.ny);
    const xChanges = directionChanges(nx, 0.012);
    const yChanges = directionChanges(ny, 0.012);
    const xRange = Math.max(...nx) - Math.min(...nx);
    const yRange = Math.max(...ny) - Math.min(...ny);

    let action = null;
    // 摇头:横向完整翻转 ≥2 次(左→右→左),且幅度足够
    if (xChanges >= 2 && xRange > 0.03 && xRange > yRange * 1.3) action = 'shake';
    // 点头:纵向完整翻转 ≥2 次
    else if (yChanges >= 2 && yRange > 0.03 && yRange > xRange * 1.3) action = 'nod';
    // 挥手/举手:肩膀可见(上半身入镜)
    else if (win[win.length - 1].sy != null) {
      const sy = win[win.length - 1].sy;
      // 手腕在肩上方(且可见)
      const wIn = [];
      win.forEach(s => {
        if (s.lWy !== null && s.lWy < sy - 0.02) wIn.push(s.lWx);
        else if (s.rWy !== null && s.rWy < sy - 0.02) wIn.push(s.rWx);
      });
      if (wIn.length >= 5) { // 大部分时间手在肩上
        const wChanges = directionChanges(wIn, 0.015);
        const wRange = Math.max(...wIn) - Math.min(...wIn);
        action = (wChanges >= 2 && wRange > 0.04) ? 'wave' : 'raise';
      }
    }
    if (!action) return;
    // 冷却 15s 内不重复触发
    if (state._lastActionAt && now - state._lastActionAt < 15000) return;
    state._lastActionAt = now;
    actionLabel = action;
    if (onActionCallback) onActionCallback(action);
  }

  async function loadModels() {
    if (state.ready) return;
    const base = '/vendor/face-api/models';
    await faceapi.nets.tinyFaceDetector.loadFromUri(base);
    await faceapi.nets.faceLandmark68Net.loadFromUri(base);
    await faceapi.nets.faceExpressionNet.loadFromUri(base);
    state.ready = true;
    console.log('[camera] 模型加载完成');
  }

  async function start() {
    if (state.on) return { ok: true };
    state.on = true;
    try {
      if (!window.faceapi) throw new Error('face-api.js 未加载');
      await loadModels();
      video = document.getElementById('cam-video');
      canvas = document.getElementById('cam-canvas');
      if (!video || !canvas) throw new Error('摄像头面板元素缺失');
      stream = await navigator.mediaDevices.getUserMedia({
        // 用 640x480:让上半身(肩膀/手)进入画面,动作才可检测(参考项目经验)
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      ctx = canvas.getContext('2d');
      setPanel(true);
      loop();
      // 动作识别模型(姿态)和官方手势模型后台加载,失败不影响情绪识别
      initPose().then(ok => { if (ok) showPanelHint('动作识别已就绪'); });
      initGesture().then(ok => { if (ok && !gestureLabel) showPanelHint('手势识别已就绪'); });
      return { ok: true };
    } catch (e) {
      state.on = false;
      console.error('[camera] 启动失败:', e);
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  function loop() {
    if (!state.on) return;
    raf = requestAnimationFrame(loop);
    // 每帧重绘视频画面(流畅,不卡);检测结果异步更新
    if (video && video.readyState >= 2) drawFrame();
    // 检测节流:~350ms 一次(CPU 友好)
    if (!detectTimer) {
      detectTimer = setTimeout(async () => {
        detectTimer = null;
        if (!state.on || !video || video.readyState < 2) return;
        try {
          const det = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
            .withFaceExpressions();
          lastDet = det;
          if (det && det.expressions) {
            const sorted = Object.entries(det.expressions).sort((a, b) => b[1] - a[1]);
            const [emotion, conf] = sorted[0];
            state.lastEmotion = state.emotion;
            state.emotion = emotion;
            state.confidence = conf;
            if (onEmotionCallback && conf > 0.45) onEmotionCallback(emotion, conf);
          } else {
            state.emotion = null;
            state.confidence = 0;
          }
          // 动作识别(与情绪检测同拍)
          await detectPose();
          // 官方手势识别
          await detectGesture();
        } catch (e) { console.warn('[camera] 检测错误:', e.message); }
      }, 350);
    }
  }

  // 每帧画:镜像摄像头画面 + (有检测结果时)人脸框 + 情绪标签 + 动作标签
  function drawFrame() {
    if (!ctx || !video) return;
    const W = canvas.width, H = canvas.height;
    const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
    ctx.clearRect(0, 0, W, H);
    // 自拍镜像
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, W, H);
    ctx.restore();
    const det = lastDet;
    if (det) {
      // 检测坐标在视频空间,缩放到画布
      const sx = W / vw, sy = H / vh;
      const box = det.detection.box;
      const bx = box.x * sx, by = box.y * sy, bw = box.width * sx, bh = box.height * sy;
      const fx = W - bx - bw; // 镜像后的人脸 x
      ctx.strokeStyle = 'rgba(126,252,154,0.95)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(fx, by, bw, bh);
      // 情绪标签
      const [emotion, conf] = Object.entries(det.expressions).sort((a, b) => b[1] - a[1])[0];
      const label = (EMOJI[emotion] || '') + ' ' + (CN[emotion] || emotion) + ' ' + Math.round(conf * 100) + '%';
      ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
      const tw = ctx.measureText(label).width;
      const ly = by > 22 ? by - 8 : by + bh + 20;
      ctx.fillStyle = 'rgba(8,26,20,0.75)';
      ctx.fillRect(fx - 2, ly - 15, tw + 8, 20);
      ctx.fillStyle = '#a8ffc4';
      ctx.fillText(label, fx + 2, ly);
    }
    // 动作标签(左上角,镜像外):让你看到识别在工作
    const A = { wave: '👋 挥手', raise: '🙋 举手', nod: '😌 点头', shake: '🤨 摇头' };
    const gTxt = gestureLabel && GESTURE_CN[gestureLabel] ? GESTURE_CN[gestureLabel] : '';
    const aTxt = actionLabel ? (A[actionLabel] || actionLabel) : '';
    const txt = gTxt ? ('手势: ' + gTxt) : (aTxt ? ('动作: ' + aTxt) : '');
    if (txt) {
      ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(255,180,80,0.85)';
      ctx.fillRect(4, 4, tw + 10, 20);
      ctx.fillStyle = '#1a1420';
      ctx.fillText(txt, 9, 18);
    }
  }

  function setPanel(show) {
    const p = document.getElementById('cam-panel');
    if (p) p.classList.toggle('hidden', !show);
  }
  function showPanelHint(txt) {
    const el = document.getElementById('cam-hint');
    if (el) el.textContent = txt;
  }

  function stop() {
    state.on = false;
    if (raf) cancelAnimationFrame(raf);
    if (detectTimer) clearTimeout(detectTimer);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (video) video.srcObject = null;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setPanel(false);
    state.emotion = null;
    state.confidence = 0;
  }

  window.CameraVision = {
    start,
    stop,
    onEmotion(cb) { onEmotionCallback = cb; },
    onAction(cb) { onActionCallback = cb; },
    onGesture(cb) { onGestureCallback = cb; },
    get isOn() { return state.on; },
    get emotion() { return state.emotion; },
    get confidence() { return state.confidence; },
    get action() { return actionLabel; },
    get gesture() { return gestureLabel; },
    get ready() { return state.ready; },
    EMOJI,
    CN,
  };
})();
