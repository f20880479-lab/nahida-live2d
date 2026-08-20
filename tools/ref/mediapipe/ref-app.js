import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs";

const APP_VERSION = "MediaPipe Diagnostic Lab V1.1";
const TASKS_VERSION = "@mediapipe/tasks-vision@0.10.35";
const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

const MODEL_URLS = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  heavy: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task"
};

const MODEL_LABELS = {
  lite: "Pose Landmarker Lite",
  full: "Pose Landmarker Full",
  heavy: "Pose Landmarker Heavy"
};

const LANDMARKS = {
  nose: { label: "Nose", idx: 0 },
  left_shoulder: { label: "Left shoulder", idx: 11 },
  right_shoulder: { label: "Right shoulder", idx: 12 },
  left_elbow: { label: "Left elbow", idx: 13 },
  right_elbow: { label: "Right elbow", idx: 14 },
  left_wrist: { label: "Left wrist", idx: 15 },
  right_wrist: { label: "Right wrist", idx: 16 },
  left_hip: { label: "Left hip", idx: 23 },
  right_hip: { label: "Right hip", idx: 24 }
};

const BASE_TRACK_POINTS = [
  "nose", "neck_mid",
  "left_shoulder", "right_shoulder",
  "left_elbow", "right_elbow",
  "left_wrist", "right_wrist"
];
const HIP_POINTS = ["left_hip", "right_hip"];

const BONE_PAIRS = [
  ["left_shoulder", "left_elbow", "left_upper_arm"],
  ["left_elbow", "left_wrist", "left_forearm"],
  ["right_shoulder", "right_elbow", "right_upper_arm"],
  ["right_elbow", "right_wrist", "right_forearm"],
  ["left_shoulder", "right_shoulder", "shoulder_width"],
  ["nose", "neck_mid", "nose_to_neck"]
];

const els = {
  testCode: document.getElementById("testCode"),
  testProfile: document.getElementById("testProfile"),
  includeHips: document.getElementById("includeHips"),
  testNote: document.getElementById("testNote"),
  durationPreset: document.getElementById("durationPreset"),
  staticSeconds: document.getElementById("staticSeconds"),
  cameraSelect: document.getElementById("cameraSelect"),
  refreshCamerasBtn: document.getElementById("refreshCamerasBtn"),
  qualitySelect: document.getElementById("qualitySelect"),
  modelSelect: document.getElementById("modelSelect"),
  minDetectionConfidence: document.getElementById("minDetectionConfidence"),
  minTrackingConfidence: document.getElementById("minTrackingConfidence"),
  numPoses: document.getElementById("numPoses"),
  jumpThresholdPx: document.getElementById("jumpThresholdPx"),
  showSkeleton: document.getElementById("showSkeleton"),
  startCameraBtn: document.getElementById("startCameraBtn"),
  stopCameraBtn: document.getElementById("stopCameraBtn"),
  startDiagnosticBtn: document.getElementById("startDiagnosticBtn"),
  stopDiagnosticBtn: document.getElementById("stopDiagnosticBtn"),
  statusText: document.getElementById("statusText"),
  recordTimer: document.getElementById("recordTimer"),
  video: document.getElementById("video"),
  canvas: document.getElementById("overlayCanvas"),
  recordBadge: document.getElementById("recordBadge"),
  videoCountdownOverlay: document.getElementById("videoCountdownOverlay"),
  moduleInfo: document.getElementById("moduleInfo"),
  modelInfo: document.getElementById("modelInfo"),
  actualResolution: document.getElementById("actualResolution"),
  actualFps: document.getElementById("actualFps"),
  poseFps: document.getElementById("poseFps"),
  poseCount: document.getElementById("poseCount"),
  noseStep: document.getElementById("noseStep"),
  neckStep: document.getElementById("neckStep"),
  leftElbowStep: document.getElementById("leftElbowStep"),
  rightElbowStep: document.getElementById("rightElbowStep"),
  leftWristStep: document.getElementById("leftWristStep"),
  rightWristStep: document.getElementById("rightWristStep"),
  recentTableBody: document.querySelector("#recentTable tbody"),
  downloadRawBtn: document.getElementById("downloadRawBtn"),
  downloadSummaryBtn: document.getElementById("downloadSummaryBtn"),
  downloadMetaBtn: document.getElementById("downloadMetaBtn"),
  summaryPreview: document.getElementById("summaryPreview")
};

const ctx = els.canvas.getContext("2d");
let mediaStream = null;
let poseLandmarker = null;
let vision = null;
let rafId = null;
let lastVideoTime = -1;
let lastModelKey = null;
let poseFpsCounter = 0;
let poseFpsStart = 0;
let actualSettings = {};
let isDiagnosticRecording = false;
let diagnosticStartedAt = 0;
let diagnosticDurationSec = 40;
let diagnosticStaticSec = 10;
let rawRows = [];
let frameIndex = 0;
let recentRows = [];
let previousPoints = null;
let metadata = null;
let latestSummary = [];
let lastRecordedSecond = -1;

function setText(el, value) {
  if (el) el.textContent = value;
}

function formatDiagnosticTime(sec) {
  const n = Math.max(0, Number(sec) || 0);
  const minutes = Math.floor(n / 60);
  const seconds = n - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function updateVideoCountdown(elapsedSec = 0, phase = "-") {
  if (!els.videoCountdownOverlay) return;
  const remaining = Math.max(0, diagnosticDurationSec - elapsedSec);
  const phaseLabel = phase === "static" ? "靜止" : phase === "movement" ? "動作" : "-";
  els.videoCountdownOverlay.textContent = `剩餘 ${formatDiagnosticTime(remaining)}\n${elapsedSec.toFixed(1)} / ${diagnosticDurationSec}s｜${phaseLabel}`;
}

function parseQuality(value) {
  if (value === "auto") return null;
  const [w, h, fps] = value.split("x").map(Number);
  return { width: w, height: h, fps };
}

function getTrackPoints() {
  const points = [...BASE_TRACK_POINTS];
  if (els.includeHips.checked || els.testProfile.value === "cpr") {
    points.push(...HIP_POINTS);
  }
  return points;
}

function shortDeviceId(id) {
  if (!id) return "-";
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");
    els.cameraSelect.innerHTML = "";
    cams.forEach((cam, idx) => {
      const opt = document.createElement("option");
      opt.value = cam.deviceId;
      opt.textContent = cam.label || `Camera ${idx + 1}`;
      els.cameraSelect.appendChild(opt);
    });
    if (!cams.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "找不到攝影機";
      els.cameraSelect.appendChild(opt);
    }
  } catch (err) {
    console.warn(err);
    setText(els.statusText, `攝影機清單讀取失敗：${err.message}`);
  }
}

function buildVideoConstraints() {
  const q = parseQuality(els.qualitySelect.value);
  const video = {};
  if (els.cameraSelect.value) video.deviceId = { ideal: els.cameraSelect.value };
  if (q) {
    video.width = { ideal: q.width };
    video.height = { ideal: q.height };
    video.frameRate = { ideal: q.fps, max: q.fps };
  } else {
    video.frameRate = { ideal: 30, max: 30 };
  }
  return { video, audio: false };
}

async function startCameraAndModel() {
  await stopCamera(false);
  setText(els.statusText, "正在開啟攝影機…");
  mediaStream = await navigator.mediaDevices.getUserMedia(buildVideoConstraints());
  els.video.srcObject = mediaStream;
  await els.video.play();
  await new Promise(resolve => {
    if (els.video.videoWidth > 0) resolve();
    else els.video.onloadedmetadata = resolve;
  });

  const track = mediaStream.getVideoTracks()[0];
  actualSettings = track?.getSettings ? track.getSettings() : {};
  resizeCanvas();
  await listCameras();
  await loadPoseModel();
  updateSystemInfo();
  startLoop();
  els.startDiagnosticBtn.disabled = false;
  els.stopCameraBtn.disabled = false;
  els.startCameraBtn.textContent = "重新啟動攝影機與模型";
  setText(els.statusText, "攝影機與模型已啟動，可開始診斷紀錄。");
}

async function loadPoseModel() {
  const modelKey = els.modelSelect.value;
  const modelChanged = lastModelKey !== modelKey || !poseLandmarker;
  if (!vision) vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  if (modelChanged) {
    if (poseLandmarker && typeof poseLandmarker.close === "function") {
      poseLandmarker.close();
    }
    setText(els.statusText, `正在載入 ${MODEL_LABELS[modelKey]}…`);
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URLS[modelKey],
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numPoses: clampInt(els.numPoses.value, 1, 4),
      minPoseDetectionConfidence: clampFloat(els.minDetectionConfidence.value, 0, 1),
      minPosePresenceConfidence: clampFloat(els.minDetectionConfidence.value, 0, 1),
      minTrackingConfidence: clampFloat(els.minTrackingConfidence.value, 0, 1)
    });
    lastModelKey = modelKey;
  }
}

function clampInt(value, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(value, min, max) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function resizeCanvas() {
  const w = els.video.videoWidth || 960;
  const h = els.video.videoHeight || 540;
  els.canvas.width = w;
  els.canvas.height = h;
}

function updateSystemInfo() {
  const q = parseQuality(els.qualitySelect.value);
  setText(els.moduleInfo, TASKS_VERSION);
  setText(els.modelInfo, MODEL_LABELS[els.modelSelect.value]);
  setText(els.actualResolution, `${actualSettings.width || els.video.videoWidth || "-"} × ${actualSettings.height || els.video.videoHeight || "-"}`);
  setText(els.actualFps, actualSettings.frameRate ? `${Number(actualSettings.frameRate).toFixed(1)} fps` : "-");
  if (q) {
    console.info(`Requested ${q.width}x${q.height}@${q.fps}, actual`, actualSettings);
  } else {
    console.info("Requested auto mode, actual", actualSettings);
  }
}

function startLoop() {
  stopLoop();
  lastVideoTime = -1;
  poseFpsCounter = 0;
  poseFpsStart = performance.now();

  const loop = () => {
    if (!mediaStream || !poseLandmarker) return;
    if (els.video.readyState >= 2 && els.video.videoWidth > 0 && els.video.videoHeight > 0) {
      if (els.video.currentTime !== lastVideoTime) {
        lastVideoTime = els.video.currentTime;
        const start = performance.now();
        let results = null;
        try {
          results = poseLandmarker.detectForVideo(els.video, start);
        } catch (err) {
          console.warn("detectForVideo failed", err);
          setText(els.statusText, `偵測錯誤：${err.message}`);
        }
        const detectionMs = performance.now() - start;
        drawFrame(results);
        handleDetection(results, detectionMs);
        updatePoseFps();
      } else {
        drawFrame(null, true);
      }
    }
    rafId = requestAnimationFrame(loop);
  };
  loop();
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

async function stopCamera(resetStatus = true) {
  stopDiagnostic();
  stopLoop();
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  els.video.srcObject = null;
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  els.videoCountdownOverlay?.classList.add("hidden");
  els.startDiagnosticBtn.disabled = true;
  els.stopDiagnosticBtn.disabled = true;
  els.stopCameraBtn.disabled = true;
  if (resetStatus) setText(els.statusText, "攝影機已停止。");
}

function updatePoseFps() {
  poseFpsCounter++;
  const now = performance.now();
  if (now - poseFpsStart >= 1000) {
    const fps = poseFpsCounter / ((now - poseFpsStart) / 1000);
    setText(els.poseFps, `${fps.toFixed(1)} fps`);
    poseFpsCounter = 0;
    poseFpsStart = now;
  }
}

function drawFrame(results, noNewDetection = false) {
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  if (els.video.videoWidth > 0) {
    ctx.drawImage(els.video, 0, 0, els.canvas.width, els.canvas.height);
  }
  if (!els.showSkeleton.checked || noNewDetection) return;
  const landmarks = selectBestLandmarks(results);
  if (!landmarks) return;
  drawTrackedLandmarks(landmarks);
}

function selectBestLandmarks(results) {
  const all = results?.landmarks || [];
  if (!all.length) return null;
  const points = getTrackPoints().filter(p => p !== "neck_mid");
  let best = null;
  let bestScore = -1;
  for (const lm of all) {
    const score = points.reduce((sum, name) => sum + ((lm[LANDMARKS[name].idx]?.visibility) || 0), 0) / points.length;
    if (score > bestScore) {
      bestScore = score;
      best = lm;
    }
  }
  return best;
}

function drawTrackedLandmarks(landmarks) {
  const points = getCurrentPoints(landmarks);
  const linePairs = [
    ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
    ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
    ["left_shoulder", "right_shoulder"], ["nose", "neck_mid"]
  ];
  if (points.left_hip && points.right_hip) {
    linePairs.push(["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"], ["left_hip", "right_hip"]);
  }

  ctx.save();
  ctx.lineWidth = 4;
  ctx.font = "13px Arial";
  for (const [a, b] of linePairs) {
    const pa = points[a], pb = points[b];
    if (!pa || !pb || pa.visibility < 0.35 || pb.visibility < 0.35) continue;
    ctx.strokeStyle = "rgba(0, 229, 255, 0.9)";
    ctx.beginPath();
    ctx.moveTo(pa.px, pa.py);
    ctx.lineTo(pb.px, pb.py);
    ctx.stroke();
  }
  for (const name of getTrackPoints()) {
    const p = points[name];
    if (!p || p.visibility < 0.2) continue;
    ctx.fillStyle = name.includes("right") ? "#ffeb3b" : name.includes("left") ? "#00e5ff" : "#ff6b6b";
    ctx.beginPath();
    ctx.arc(p.px, p.py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.72)";
    ctx.fillRect(p.px + 8, p.py - 18, ctx.measureText(name).width + 12, 18);
    ctx.fillStyle = "#fff";
    ctx.fillText(name, p.px + 14, p.py - 5);
  }
  ctx.restore();
}

function getCurrentPoints(landmarks) {
  if (!landmarks) return {};
  const points = {};
  for (const [name, spec] of Object.entries(LANDMARKS)) {
    const lm = landmarks[spec.idx];
    if (!lm) continue;
    points[name] = normalizePoint(lm);
  }
  const ls = points.left_shoulder;
  const rs = points.right_shoulder;
  if (ls && rs) {
    points.neck_mid = {
      x: (ls.x + rs.x) / 2,
      y: (ls.y + rs.y) / 2,
      z: ((ls.z || 0) + (rs.z || 0)) / 2,
      visibility: ((ls.visibility || 0) + (rs.visibility || 0)) / 2,
      px: ((ls.x + rs.x) / 2) * els.canvas.width,
      py: ((ls.y + rs.y) / 2) * els.canvas.height
    };
  }
  return points;
}

function normalizePoint(lm) {
  return {
    x: lm.x,
    y: lm.y,
    z: lm.z ?? "",
    visibility: lm.visibility ?? 0,
    px: lm.x * els.canvas.width,
    py: lm.y * els.canvas.height
  };
}

function handleDetection(results, detectionMs) {
  const landmarks = selectBestLandmarks(results);
  const poseCount = results?.landmarks?.length || 0;
  setText(els.poseCount, String(poseCount));
  const currentPoints = getCurrentPoints(landmarks);
  updateLiveSteps(currentPoints);

  if (!isDiagnosticRecording) {
    previousPoints = currentPoints;
    return;
  }

  const now = performance.now();
  const elapsedSec = (now - diagnosticStartedAt) / 1000;
  const phase = elapsedSec < diagnosticStaticSec ? "static" : "movement";
  setText(els.recordTimer, `${elapsedSec.toFixed(1)}s`);
  updateVideoCountdown(elapsedSec, phase);
  if (Math.floor(elapsedSec) !== lastRecordedSecond) {
    lastRecordedSecond = Math.floor(elapsedSec);
    setText(els.statusText, `紀錄中：${elapsedSec.toFixed(1)} / ${diagnosticDurationSec}s，階段：${phase === "static" ? "靜止" : "動作"}`);
  }

  const row = buildRawRow(currentPoints, previousPoints, {
    elapsedSec,
    phase,
    detectionMs,
    poseCount
  });
  rawRows.push(row);
  frameIndex++;
  previousPoints = currentPoints;
  pushRecent(row);

  if (elapsedSec >= diagnosticDurationSec) {
    stopDiagnostic();
  }
}

function updateLiveSteps(currentPoints) {
  const threshold = clampFloat(els.jumpThresholdPx.value, 5, 200);
  const names = ["nose", "neck_mid", "left_elbow", "right_elbow", "left_wrist", "right_wrist"];
  const targets = [els.noseStep, els.neckStep, els.leftElbowStep, els.rightElbowStep, els.leftWristStep, els.rightWristStep];
  names.forEach((name, idx) => {
    const step = pointStepPx(currentPoints?.[name], previousPoints?.[name]);
    if (step == null) setText(targets[idx], "-");
    else setText(targets[idx], `${step.toFixed(1)} px${step > threshold ? " ⚠" : ""}`);
  });
}

function buildRawRow(points, prevPoints, extra) {
  const threshold = clampFloat(els.jumpThresholdPx.value, 5, 200);
  const q = parseQuality(els.qualitySelect.value);
  const row = {
    app_version: APP_VERSION,
    frame_index: frameIndex,
    timestamp_iso: new Date().toISOString(),
    elapsed_sec: round(extra.elapsedSec, 4),
    video_time_sec: round(els.video.currentTime, 4),
    phase: extra.phase,
    model_key: els.modelSelect.value,
    model_label: MODEL_LABELS[els.modelSelect.value],
    requested_quality: els.qualitySelect.value,
    requested_width: q?.width || "auto",
    requested_height: q?.height || "auto",
    requested_fps: q?.fps || "auto",
    actual_width: actualSettings.width || els.video.videoWidth || "",
    actual_height: actualSettings.height || els.video.videoHeight || "",
    actual_frame_rate: actualSettings.frameRate || "",
    camera_label: selectedCameraLabel(),
    camera_device_short: shortDeviceId(actualSettings.deviceId || els.cameraSelect.value),
    pose_count: extra.poseCount,
    detection_ms: round(extra.detectionMs, 3),
    jump_threshold_px: threshold
  };

  for (const name of getTrackPoints()) {
    const p = points?.[name];
    const step = pointStepPx(p, prevPoints?.[name]);
    row[`${name}_x`] = p ? round(p.x, 6) : "";
    row[`${name}_y`] = p ? round(p.y, 6) : "";
    row[`${name}_z`] = p && p.z !== "" ? round(p.z, 6) : "";
    row[`${name}_visibility`] = p ? round(p.visibility, 4) : "";
    row[`${name}_px`] = p ? round(p.px, 2) : "";
    row[`${name}_py`] = p ? round(p.py, 2) : "";
    row[`${name}_step_px`] = step == null ? "" : round(step, 3);
    row[`${name}_jump`] = step != null && step > threshold ? 1 : 0;
  }

  for (const [a, b, label] of BONE_PAIRS) {
    const d = pointDistancePx(points?.[a], points?.[b]);
    row[`${label}_px`] = d == null ? "" : round(d, 3);
  }
  return row;
}

function round(n, digits = 3) {
  if (n === "" || n == null || Number.isNaN(Number(n))) return "";
  const m = 10 ** digits;
  return Math.round(Number(n) * m) / m;
}

function pointStepPx(a, b) {
  if (!a || !b) return null;
  if ((a.visibility ?? 0) < 0.05 || (b.visibility ?? 0) < 0.05) return null;
  return Math.hypot(a.px - b.px, a.py - b.py);
}

function pointDistancePx(a, b) {
  if (!a || !b) return null;
  if ((a.visibility ?? 0) < 0.05 || (b.visibility ?? 0) < 0.05) return null;
  return Math.hypot(a.px - b.px, a.py - b.py);
}

function selectedCameraLabel() {
  const opt = els.cameraSelect.options[els.cameraSelect.selectedIndex];
  return opt?.textContent || "";
}

function pushRecent(row) {
  recentRows.unshift(row);
  recentRows = recentRows.slice(0, 12);
  els.recentTableBody.innerHTML = recentRows.map(r => `
    <tr>
      <td>${Number(r.elapsed_sec).toFixed(1)}</td>
      <td>${r.phase}</td>
      <td>${formatPoint(r, "nose")}</td>
      <td>${formatPoint(r, "neck_mid")}</td>
      <td>${formatPoint(r, "left_elbow")}</td>
      <td>${formatPoint(r, "right_elbow")}</td>
      <td>${formatPoint(r, "left_wrist")}</td>
      <td>${formatPoint(r, "right_wrist")}</td>
    </tr>
  `).join("");
}

function formatPoint(row, name) {
  const x = row[`${name}_px`];
  const y = row[`${name}_py`];
  if (x === "" || y === "") return "-";
  return `${Number(x).toFixed(0)}, ${Number(y).toFixed(0)}`;
}

function startDiagnostic() {
  if (!mediaStream || !poseLandmarker) return;
  rawRows = [];
  frameIndex = 0;
  recentRows = [];
  previousPoints = null;
  latestSummary = [];
  lastRecordedSecond = -1;
  diagnosticDurationSec = clampFloat(els.durationPreset.value, 5, 300);
  diagnosticStaticSec = Math.min(clampFloat(els.staticSeconds.value, 0, 120), diagnosticDurationSec);
  diagnosticStartedAt = performance.now();
  isDiagnosticRecording = true;

  metadata = buildMetadata("started");
  els.startDiagnosticBtn.disabled = true;
  els.stopDiagnosticBtn.disabled = false;
  els.downloadRawBtn.disabled = true;
  els.downloadSummaryBtn.disabled = true;
  els.downloadMetaBtn.disabled = true;
  els.recordBadge.classList.remove("hidden");
  els.videoCountdownOverlay?.classList.remove("hidden");
  setText(els.recordTimer, "00.0s");
  updateVideoCountdown(0, "static");
  setText(els.summaryPreview, "診斷紀錄中…");
}

function stopDiagnostic() {
  if (!isDiagnosticRecording) return;
  isDiagnosticRecording = false;
  els.recordBadge.classList.add("hidden");
  els.videoCountdownOverlay?.classList.add("hidden");
  els.startDiagnosticBtn.disabled = !(mediaStream && poseLandmarker);
  els.stopDiagnosticBtn.disabled = true;
  setText(els.statusText, `診斷紀錄完成，共 ${rawRows.length} 筆。`);
  setText(els.recordTimer, rawRows.length ? `${Number(rawRows.at(-1).elapsed_sec).toFixed(1)}s` : "00.0s");
  metadata = { ...metadata, ...buildMetadata("finished") };
  latestSummary = buildSummaryRows(rawRows);
  updateSummaryPreview(latestSummary);
  els.downloadRawBtn.disabled = rawRows.length === 0;
  els.downloadSummaryBtn.disabled = rawRows.length === 0;
  els.downloadMetaBtn.disabled = rawRows.length === 0;
}

function buildMetadata(status) {
  const q = parseQuality(els.qualitySelect.value);
  return {
    status,
    app_version: APP_VERSION,
    tasks_version: TASKS_VERSION,
    generated_at: new Date().toISOString(),
    test_code: els.testCode.value.trim(),
    test_profile: els.testProfile.value,
    include_hips: els.includeHips.checked || els.testProfile.value === "cpr",
    test_note: els.testNote.value.trim(),
    duration_sec: diagnosticDurationSec,
    static_sec: diagnosticStaticSec,
    movement_sec: Math.max(0, diagnosticDurationSec - diagnosticStaticSec),
    model_key: els.modelSelect.value,
    model_label: MODEL_LABELS[els.modelSelect.value],
    model_url: MODEL_URLS[els.modelSelect.value],
    wasm_root: WASM_ROOT,
    min_detection_confidence: Number(els.minDetectionConfidence.value),
    min_tracking_confidence: Number(els.minTrackingConfidence.value),
    num_poses: Number(els.numPoses.value),
    jump_threshold_px: Number(els.jumpThresholdPx.value),
    requested_quality: els.qualitySelect.value,
    requested_width: q?.width || "auto",
    requested_height: q?.height || "auto",
    requested_fps: q?.fps || "auto",
    actual_camera_settings: actualSettings,
    camera_label: selectedCameraLabel(),
    camera_device_short: shortDeviceId(actualSettings.deviceId || els.cameraSelect.value),
    canvas_width: els.canvas.width,
    canvas_height: els.canvas.height,
    user_agent: navigator.userAgent,
    raw_row_count: rawRows.length
  };
}

function buildSummaryRows(rows) {
  const phases = ["all", "static", "movement"];
  const points = getTrackPoints();
  const summary = [];

  for (const phase of phases) {
    const subset = phase === "all" ? rows : rows.filter(r => r.phase === phase);
    for (const name of points) {
      const visibilityValues = subset.map(r => Number(r[`${name}_visibility`])).filter(Number.isFinite);
      const stepValues = subset.map(r => Number(r[`${name}_step_px`])).filter(Number.isFinite);
      const jumpValues = subset.map(r => Number(r[`${name}_jump`])).filter(Number.isFinite);
      const total = subset.length;
      const seen = visibilityValues.length;
      summary.push({
        type: "joint",
        phase,
        name,
        samples: total,
        seen_samples: seen,
        missing_rate: total ? round(1 - (seen / total), 4) : "",
        visibility_mean: mean(visibilityValues),
        step_mean_px: mean(stepValues),
        step_sd_px: sd(stepValues),
        step_max_px: max(stepValues),
        jump_count: sum(jumpValues),
        jump_rate: total ? round(sum(jumpValues) / total, 4) : "",
        bone_mean_px: "",
        bone_sd_px: "",
        bone_cv: ""
      });
    }

    for (const [, , label] of BONE_PAIRS) {
      const values = subset.map(r => Number(r[`${label}_px`])).filter(Number.isFinite);
      summary.push({
        type: "bone_length",
        phase,
        name: label,
        samples: subset.length,
        seen_samples: values.length,
        missing_rate: subset.length ? round(1 - values.length / subset.length, 4) : "",
        visibility_mean: "",
        step_mean_px: "",
        step_sd_px: "",
        step_max_px: "",
        jump_count: "",
        jump_rate: "",
        bone_mean_px: mean(values),
        bone_sd_px: sd(values),
        bone_cv: mean(values) ? round(sd(values) / mean(values), 4) : ""
      });
    }
  }
  return summary;
}

function mean(arr) {
  if (!arr.length) return "";
  return round(arr.reduce((a, b) => a + b, 0) / arr.length, 4);
}
function sd(arr) {
  if (arr.length < 2) return "";
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return round(Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1)), 4);
}
function max(arr) {
  if (!arr.length) return "";
  return round(Math.max(...arr), 4);
}
function sum(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0);
}

function updateSummaryPreview(summary) {
  const important = summary.filter(r => r.type === "joint" && r.phase === "all" && ["nose", "neck_mid", "left_elbow", "right_elbow", "left_wrist", "right_wrist"].includes(r.name));
  const lines = [
    `紀錄完成：${rawRows.length} 筆`,
    `模型：${MODEL_LABELS[els.modelSelect.value]}`,
    `解析度：${actualSettings.width || els.video.videoWidth} × ${actualSettings.height || els.video.videoHeight}`,
    `跳點門檻：${els.jumpThresholdPx.value} px`,
    "",
    "主要關節抖動摘要（all phase）：",
    ...important.map(r => `${r.name.padEnd(15)} step_mean=${String(r.step_mean_px).padStart(7)} px | max=${String(r.step_max_px).padStart(7)} px | jumps=${String(r.jump_count).padStart(4)} | missing=${r.missing_rate}`)
  ];
  setText(els.summaryPreview, lines.join("\n"));
}

function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach(k => set.add(k));
    return set;
  }, new Set()));
  const escape = value => {
    if (value == null) return "";
    const s = String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.join(","), ...rows.map(row => headers.map(h => escape(row[h])).join(","))].join("\n");
}

function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeNamePart(value) {
  return String(value || "test").trim().replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40) || "test";
}

function baseFilename() {
  const code = safeNamePart(els.testCode.value);
  const model = els.modelSelect.value;
  const q = safeNamePart(els.qualitySelect.value);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  return `${code}_${els.testProfile.value}_${model}_${q}_${stamp}`;
}

els.refreshCamerasBtn.addEventListener("click", listCameras);
els.startCameraBtn.addEventListener("click", () => startCameraAndModel().catch(err => {
  console.error(err);
  setText(els.statusText, `啟動失敗：${err.message}`);
}));
els.stopCameraBtn.addEventListener("click", () => stopCamera());
els.startDiagnosticBtn.addEventListener("click", startDiagnostic);
els.stopDiagnosticBtn.addEventListener("click", stopDiagnostic);
els.downloadRawBtn.addEventListener("click", () => downloadText(`${baseFilename()}_raw_landmarks.csv`, rowsToCsv(rawRows), "text/csv;charset=utf-8"));
els.downloadSummaryBtn.addEventListener("click", () => downloadText(`${baseFilename()}_jitter_summary.csv`, rowsToCsv(latestSummary), "text/csv;charset=utf-8"));
els.downloadMetaBtn.addEventListener("click", () => downloadText(`${baseFilename()}_metadata.json`, JSON.stringify({ ...metadata, raw_row_count: rawRows.length, summary_row_count: latestSummary.length }, null, 2), "application/json;charset=utf-8"));

els.qualitySelect.addEventListener("change", () => {
  setText(els.statusText, "畫質設定已變更。請重新啟動攝影機，設定才會套用。");
});
els.modelSelect.addEventListener("change", () => {
  setText(els.statusText, "模型設定已變更。請重新啟動攝影機與模型，設定才會套用。");
});

window.addEventListener("beforeunload", () => {
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
});

setText(els.moduleInfo, TASKS_VERSION);
setText(els.statusText, "請先開啟攝影機與模型。建議標準診斷使用 40 秒：前 10 秒靜止，後 30 秒動作。V1.1 已將控制按鈕移到影片旁，並加入影片倒數。");
listCameras();
