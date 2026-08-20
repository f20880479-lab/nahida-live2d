import * as THREE from "three";
import {
  disposeMmdModel,
  ThreeMmdLoader,
  type ThreeMmdAnimation,
  type ThreeMmdModel,
} from "@yohawing/three-mmd-loader";
import {
  createCustomBulletMmdPhysicsBackend,
  loadCustomBulletMmdModule,
  type MmdPhysicsBackend,
} from "@yohawing/three-mmd-loader/physics";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./style.css";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`UI要素が見つかりません: ${selector}`);
  return element;
}

const stage = requireElement<HTMLElement>("#stage");
const emptyState = requireElement<HTMLElement>("#empty-state");
const status = requireElement<HTMLElement>("#status");
const modelName = requireElement<HTMLElement>("#model-name");
const pinButton = requireElement<HTMLButtonElement>("#pin-window");
const fileButton = requireElement<HTMLButtonElement>("#file-menu");
const modeButton = requireElement<HTMLButtonElement>("#lock-model");
const gazeButton = requireElement<HTMLButtonElement>("#gaze-mode");
const physicsButton = requireElement<HTMLButtonElement>("#physics");
const idleButton = requireElement<HTMLButtonElement>("#idle-motion");
const toolbar = requireElement<HTMLElement>(".toolbar");
const menuReveal = requireElement<HTMLElement>("#menu-reveal");
const resizeHandle = requireElement<HTMLButtonElement>("#resize-handle");
const windowMoveHandle = requireElement<HTMLButtonElement>("#window-move-handle");

const desktopApi = window.pmxPal ?? {
  openModel: async (): Promise<ModelInfo | null> => null,
  getSavedModel: async (): Promise<ModelInfo | null> => {
    if (!import.meta.env.DEV) return null;
    const url = new URLSearchParams(window.location.search).get("model");
    if (!url) return null;
    return { url, name: decodeURIComponent(url.split("/").at(-1) ?? "model.pmx") };
  },
  openMotions: async (): Promise<ModelInfo[] | null> => null,
  getSavedMotions: async (): Promise<ModelInfo[]> => [],
  toggleAlwaysOnTop: async (): Promise<boolean> => false,
  isAlwaysOnTop: async (): Promise<boolean> => false,
  setInteractionMode: async (mode: InteractionMode): Promise<InteractionMode> => mode,
  getInteractionMode: async (): Promise<InteractionMode> => "move",
  setGazeMode: async (mode: GazeMode): Promise<GazeMode> => mode,
  getGazeMode: async (): Promise<GazeMode> => "none",
  getRenderSettings: async (): Promise<RenderSettings> => ({
    fps: 60,
    pixelRatio: 2,
    antialias: true,
    shadows: true,
  }),
  togglePhysics: async (): Promise<boolean> => true,
  isPhysicsEnabled: async (): Promise<boolean> => true,
  getCameraState: async (): Promise<CameraState | null> => null,
  saveCameraState: async (): Promise<void> => undefined,
  toggleIdleMotion: async (): Promise<boolean> => true,
  isIdleMotionEnabled: async (): Promise<boolean> => true,
  close: (): void => undefined,
  beginWindowDrag: (): void => undefined,
  updateWindowDrag: (): void => undefined,
  endWindowDrag: (): void => undefined,
  beginWindowResize: (): void => undefined,
  updateWindowResize: (): void => undefined,
  endWindowResize: (): void => undefined,
  showMenu: (): void => undefined,
  showFileMenu: (): void => undefined,
  showInteractionModeMenu: (): void => undefined,
  showGazeModeMenu: (): void => undefined,
  onOpenModel: (): void => undefined,
  onOpenMotion: (): void => undefined,
  onAlwaysOnTopChanged: (): void => undefined,
  onInteractionModeChanged: (): void => undefined,
  onGazeModeChanged: (): void => undefined,
  onRenderSettingsChanged: (): void => undefined,
  onPhysicsEnabledChanged: (): void => undefined,
  onGlobalCursorPosition: (): void => undefined,
  onIdleMotionChanged: (): void => undefined,
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
camera.position.set(0, 12, 40);

function createRenderer(antialias: boolean): THREE.WebGLRenderer {
  const value = new THREE.WebGLRenderer({ alpha: true, antialias });
  value.setClearColor(0x000000, 0);
  value.outputColorSpace = THREE.SRGBColorSpace;
  value.shadowMap.type = THREE.PCFSoftShadowMap;
  return value;
}

function createControls(element: HTMLElement): OrbitControls {
  const value = new OrbitControls(camera, element);
  value.enableDamping = true;
  value.dampingFactor = 0.08;
  value.enablePan = false;
  value.minDistance = 3;
  value.maxDistance = 180;
  value.addEventListener("end", handleControlsEnd);
  return value;
}

let rendererAntialias = true;
let renderer = createRenderer(rendererAntialias);
stage.prepend(renderer.domElement);
let controls = createControls(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x6d7794, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
keyLight.position.set(8, 18, 16);
scene.add(keyLight);

let currentModel: ThreeMmdModel | null = null;
let interactionMode: InteractionMode = "move";
let gazeMode: GazeMode = "none";
let renderSettings: RenderSettings = {
  fps: 60,
  pixelRatio: 2,
  antialias: true,
  shadows: true,
};
let idleMotionEnabled = true;
let physicsEnabled = true;
let physicsAvailable = false;
let physicsBackend: MmdPhysicsBackend | null = null;

async function createMmdLoader(): Promise<ThreeMmdLoader> {
  try {
    const scriptUrl = window.pmxPal
      ? "pmxpal://app/mmd_bullet.js"
      : new URL("./mmd/mmd_bullet.js", window.location.href).href;
    const bulletModule = await loadCustomBulletMmdModule({ scriptUrl });
    physicsBackend = createCustomBulletMmdPhysicsBackend(bulletModule, {
      fixedTimeStep: 1 / 60,
      maxSubSteps: 3,
      resetCatchUpSteps: 2,
    });
    physicsAvailable = true;
    return new ThreeMmdLoader({
      runtime: { physics: "external", physicsBackend },
    });
  } catch (error) {
    console.error("MMD物理演算を初期化できませんでした。", error);
    physicsAvailable = false;
    return new ThreeMmdLoader();
  }
}

const mmdLoaderPromise = createMmdLoader();
type IdleMotion = {
  info: ModelInfo;
  animation: ThreeMmdAnimation["animation"];
  duration: number;
};
const IDLE_SWITCH_INTERVAL_SECONDS = 12;
let idleMotions: IdleMotion[] = [];
let currentMotionIndex = -1;
let motionStartedAt = 0;
let motionSwitchedAt = 0;
let toolbarTimer: number | undefined;
let isToolbarActive = false;
let windowResizePointerId: number | null = null;
let windowMovePointerId: number | null = null;
let cameraSaveTimer: number | undefined;
type GazeBone = {
  bone: THREE.Bone;
  yawWeight: number;
  pitchWeight: number;
};
let gazeBones: GazeBone[] = [];
let gazeReferenceBone: THREE.Bone | null = null;
let gazeYaw = 0;
let gazePitch = 0;
let previousGazeTime = 0;
let previousRenderTime = 0;
const cursorNdc = new THREE.Vector2();
const gazeRaycaster = new THREE.Raycaster();
const gazeTarget = new THREE.Vector3();
const gazeOrigin = new THREE.Vector3();
const gazeDirection = new THREE.Vector3();
const gazeRootQuaternion = new THREE.Quaternion();
const gazeOffset = new THREE.Quaternion();
const gazeEuler = new THREE.Euler(0, 0, 0, "YXZ");
let hiddenAt = document.hidden ? performance.now() : null;

function replaceRenderer(antialias: boolean): void {
  const previousCanvas = renderer.domElement;
  const previousTarget = controls.target.clone();
  controls.dispose();
  renderer.dispose();
  renderer.forceContextLoss();

  rendererAntialias = antialias;
  renderer = createRenderer(antialias);
  previousCanvas.replaceWith(renderer.domElement);
  controls = createControls(renderer.domElement);
  controls.target.copy(previousTarget);
  applyInteractionMode();
}

function applyModelShadows(root: THREE.Object3D, enabled: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = enabled;
    object.receiveShadow = enabled;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.needsUpdate = true;
  });
}

function applyRenderSettings(value: RenderSettings): void {
  renderSettings = value;
  if (rendererAntialias !== value.antialias) {
    replaceRenderer(value.antialias);
  }
  renderer.setPixelRatio(value.pixelRatio);
  renderer.shadowMap.enabled = value.shadows;
  renderer.shadowMap.needsUpdate = true;
  keyLight.castShadow = value.shadows;
  if (currentModel) applyModelShadows(currentModel.root, value.shadows);
  previousRenderTime = 0;
  document.documentElement.dataset.renderFps = String(value.fps);
  document.documentElement.dataset.renderPixelRatio = String(value.pixelRatio);
  document.documentElement.dataset.renderAntialias = String(value.antialias);
  document.documentElement.dataset.renderShadows = String(value.shadows);
  resizeRenderer();
}

function showToolbar(): void {
  toolbar.classList.remove("toolbar-hidden");
  windowMoveHandle.classList.remove("control-hidden");
  window.clearTimeout(toolbarTimer);

  if (currentModel && !isToolbarActive) {
    toolbarTimer = window.setTimeout(() => {
      toolbar.classList.add("toolbar-hidden");
      windowMoveHandle.classList.add("control-hidden");
    }, 3000);
  }
}

function applyInteractionMode(): void {
  controls.enabled = interactionMode !== "fixed";
  controls.enablePan = interactionMode === "move";
  controls.enableRotate = interactionMode === "rotate";
  controls.enableZoom = interactionMode !== "fixed";
  controls.mouseButtons.LEFT = interactionMode === "move" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  stage.classList.toggle("camera-pan", interactionMode === "move");
  stage.classList.toggle("interaction-fixed", interactionMode === "fixed");
  const labels: Record<InteractionMode, string> = {
    move: "移動",
    rotate: "回転",
    fixed: "固定",
  };
  modeButton.textContent = labels[interactionMode];
  modeButton.title = `操作モード: ${labels[interactionMode]}（クリックして変更）`;
}

function updateGazeButton(): void {
  const labels: Record<GazeMode, string> = {
    none: "目線なし",
    camera: "カメラ",
    cursor: "カーソル",
  };
  gazeButton.textContent = labels[gazeMode];
  gazeButton.title = `目線モード: ${labels[gazeMode]}（クリックして変更）`;
}

function updatePhysicsButton(): void {
  physicsButton.setAttribute("aria-pressed", String(physicsEnabled && physicsAvailable));
  physicsButton.disabled = !physicsAvailable;
  physicsButton.title = physicsAvailable
    ? `MMD物理演算: ${physicsEnabled ? "オン" : "オフ"}`
    : "この環境ではMMD物理演算を利用できません";
}

function normalizeBoneName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[\s_.-]/g, "");
}

function findBone(bones: readonly THREE.Bone[], names: readonly string[]): THREE.Bone | null {
  const candidates = new Set(names.map(normalizeBoneName));
  return bones.find((bone) => candidates.has(normalizeBoneName(bone.name))) ?? null;
}

function setupGazeBones(model: ThreeMmdModel): void {
  const bones = model.mesh.skeleton.bones;
  const neck = findBone(bones, ["首", "neck"]);
  const head = findBone(bones, ["頭", "head"]);
  const bothEyes = findBone(bones, ["両目", "eyes", "both eyes"]);
  const leftEye = findBone(bones, ["左目", "left eye", "eye_l", "lefteye"]);
  const rightEye = findBone(bones, ["右目", "right eye", "eye_r", "righteye"]);

  gazeBones = [];
  if (neck) gazeBones.push({ bone: neck, yawWeight: 0.12, pitchWeight: 0.1 });
  if (head) gazeBones.push({ bone: head, yawWeight: 0.32, pitchWeight: 0.28 });
  if (bothEyes) {
    gazeBones.push({ bone: bothEyes, yawWeight: 0.56, pitchWeight: 0.56 });
  } else {
    if (leftEye) gazeBones.push({ bone: leftEye, yawWeight: 0.56, pitchWeight: 0.56 });
    if (rightEye) gazeBones.push({ bone: rightEye, yawWeight: 0.56, pitchWeight: 0.56 });
  }
  gazeReferenceBone = head ?? neck ?? bothEyes ?? leftEye ?? rightEye;
  gazeYaw = 0;
  gazePitch = 0;
  previousGazeTime = 0;
  gazeButton.dataset.supported = String(gazeBones.length > 0);
}

function updateGaze(seconds: number): void {
  if (!currentModel || gazeMode === "none" || !gazeReferenceBone || gazeBones.length === 0) {
    previousGazeTime = seconds;
    return;
  }

  currentModel.root.updateMatrixWorld(true);
  gazeReferenceBone.getWorldPosition(gazeOrigin);
  if (gazeMode === "camera") {
    gazeTarget.copy(camera.position);
  } else {
    gazeRaycaster.setFromCamera(cursorNdc, camera);
    const distance = Math.max(gazeRaycaster.ray.origin.distanceTo(gazeOrigin), 1);
    gazeRaycaster.ray.at(distance, gazeTarget);
  }

  gazeDirection.copy(gazeTarget).sub(gazeOrigin).normalize();
  currentModel.root.getWorldQuaternion(gazeRootQuaternion).invert();
  gazeDirection.applyQuaternion(gazeRootQuaternion);
  const targetYaw = THREE.MathUtils.clamp(
    Math.atan2(gazeDirection.x, gazeDirection.z),
    THREE.MathUtils.degToRad(-35),
    THREE.MathUtils.degToRad(35),
  );
  const targetPitch = THREE.MathUtils.clamp(
    Math.atan2(gazeDirection.y, Math.hypot(gazeDirection.x, gazeDirection.z)),
    THREE.MathUtils.degToRad(-20),
    THREE.MathUtils.degToRad(20),
  );
  const delta = previousGazeTime > 0 ? Math.min(seconds - previousGazeTime, 0.1) : 1 / 60;
  previousGazeTime = seconds;
  const smoothing = 1 - Math.exp(-7 * delta);
  gazeYaw = THREE.MathUtils.lerp(gazeYaw, targetYaw, smoothing);
  gazePitch = THREE.MathUtils.lerp(gazePitch, targetPitch, smoothing);

  for (const { bone, yawWeight, pitchWeight } of gazeBones) {
    gazeEuler.set(-gazePitch * pitchWeight, gazeYaw * yawWeight, 0, "YXZ");
    gazeOffset.setFromEuler(gazeEuler);
    bone.quaternion.multiply(gazeOffset);
  }
}

function updateMotion(seconds: number): void {
  if (!currentModel) return;
  const usePhysics = physicsEnabled && physicsAvailable;
  if (!idleMotionEnabled || currentMotionIndex < 0) {
    currentModel.update(0, { physics: usePhysics });
    return;
  }
  if (
    idleMotions.length > 1 &&
    seconds - motionSwitchedAt >= IDLE_SWITCH_INTERVAL_SECONDS
  ) {
    activateIdleMotion((currentMotionIndex + 1) % idleMotions.length, seconds);
  }

  const motion = idleMotions[currentMotionIndex];
  if (motion) {
    currentModel.update((seconds - motionStartedAt) % motion.duration, { physics: usePhysics });
  }
}

function resetPhysics(): void {
  physicsBackend?.reset?.();
}

function activateIdleMotion(index: number, nowSeconds = performance.now() / 1000): void {
  const motion = idleMotions[index];
  if (!currentModel || !motion) return;

  currentMotionIndex = index;
  resetPhysics();
  currentModel.setAnimation(motion.animation);
  motionStartedAt = nowSeconds;
  motionSwitchedAt = nowSeconds;
  currentModel.update(0, { physics: physicsEnabled && physicsAvailable });
  idleButton.title = `待機 ${index + 1}/${idleMotions.length}: ${motion.info.name}`;
}

function resizeRenderer(): void {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function frameModel(model: THREE.Object3D): void {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const distance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));

  controls.target.copy(center);
  camera.position.set(center.x, center.y + size.y * 0.03, center.z + distance * 1.12);
  camera.near = Math.max(maxSize / 1000, 0.01);
  camera.far = Math.max(maxSize * 100, 1000);
  camera.updateProjectionMatrix();
  controls.update();
}

function applyCameraState(state: CameraState): void {
  camera.position.fromArray(state.position);
  controls.target.fromArray(state.target);
  camera.updateProjectionMatrix();
  controls.update();
}

function saveCameraState(): void {
  if (!currentModel) return;
  void desktopApi.saveCameraState({
    position: camera.position.toArray() as [number, number, number],
    target: controls.target.toArray() as [number, number, number],
  });
}

function handleControlsEnd(): void {
  window.clearTimeout(cameraSaveTimer);
  cameraSaveTimer = window.setTimeout(saveCameraState, 300);
}

function showStatus(message: string, isError = false): void {
  status.textContent = message;
  status.classList.toggle("error", isError);
  status.classList.toggle("visible", Boolean(message));
}

async function loadModel(info: ModelInfo): Promise<void> {
  showStatus("モデルを読み込んでいます…");
  emptyState.hidden = true;

  try {
    const mmdLoader = await mmdLoaderPromise;
    const model = await mmdLoader.loadModel(info.url);
    if (currentModel) {
      scene.remove(currentModel.root);
      disposeMmdModel(currentModel);
    }
    currentModel = model;
    idleMotions = [];
    currentMotionIndex = -1;
    applyModelShadows(model.root, renderSettings.shadows);
    scene.add(model.root);
    setupGazeBones(model);
    frameModel(model.root);
    const savedCameraState = await desktopApi.getCameraState();
    if (currentModel !== model) return;
    if (savedCameraState) applyCameraState(savedCameraState);
    applyInteractionMode();
    modelName.textContent = info.name.replace(/\.pmx$/i, "");
    stage.dataset.modelLoaded = "true";
    showStatus("");
    showToolbar();
    const savedMotions = await desktopApi.getSavedMotions();
    if (savedMotions.length > 0) await loadMotions(savedMotions);
  } catch (error) {
    console.error(error);
    stage.dataset.modelLoaded = "false";
    emptyState.hidden = false;
    showStatus("PMXモデルを読み込めませんでした。テクスチャがモデルと同じフォルダにあるか確認してください。", true);
  }
}

async function loadMotions(infos: ModelInfo[]): Promise<void> {
  if (!currentModel) {
    showStatus("先にPMXモデルを開いてください。", true);
    return;
  }

  const targetModel = currentModel;
  showStatus(`${infos.length}件のVMDモーションを読み込んでいます…`);
  const mmdLoader = await mmdLoaderPromise;
  const results = await Promise.allSettled(
    infos.map(async (info): Promise<IdleMotion> => {
      const motion = await mmdLoader.loadAnimation(info.url);
      return {
        info,
        animation: motion.animation,
        duration: Math.max(motion.animation.metadata.maxFrame / 30, 1 / 30),
      };
    }),
  );
  if (currentModel !== targetModel) return;

  const loaded = results.flatMap((result) => {
    if (result.status === "fulfilled") return [result.value];
    console.error(result.reason);
    return [];
  });
  if (loaded.length === 0) {
    idleMotions = [];
    currentMotionIndex = -1;
    showStatus("VMDモーションを読み込めませんでした。モデルに対応したモーションか確認してください。", true);
    return;
  }

  idleMotions = loaded;
  activateIdleMotion(0);
  const failedCount = infos.length - loaded.length;
  showStatus(
    failedCount > 0
      ? `${loaded.length}件を登録しました（${failedCount}件は読み込めませんでした）`
      : `${loaded.length}件の待機モーションを登録しました`,
    failedCount > 0,
  );
  window.setTimeout(() => showStatus(""), 2200);
}

async function chooseModel(): Promise<void> {
  const info = await desktopApi.openModel();
  if (info) await loadModel(info);
}

async function chooseMotion(): Promise<void> {
  const infos = await desktopApi.openMotions();
  if (infos) await loadMotions(infos);
}

document.querySelector("#empty-open-model")?.addEventListener("click", () => void chooseModel());
document.querySelector("#close")?.addEventListener("click", () => desktopApi.close());
document.querySelector("#menu")?.addEventListener("click", () => desktopApi.showMenu());

pinButton.addEventListener("click", async () => {
  const isPinned = await desktopApi.toggleAlwaysOnTop();
  pinButton.setAttribute("aria-pressed", String(isPinned));
});

fileButton.addEventListener("click", () => desktopApi.showFileMenu());
modeButton.addEventListener("click", () => desktopApi.showInteractionModeMenu());
gazeButton.addEventListener("click", () => desktopApi.showGazeModeMenu());
physicsButton.addEventListener("click", async () => {
  await mmdLoaderPromise;
  if (!physicsAvailable) {
    showStatus("MMD物理演算を初期化できませんでした。", true);
    return;
  }
  physicsEnabled = await desktopApi.togglePhysics();
  resetPhysics();
  updatePhysicsButton();
});

idleButton.addEventListener("click", async () => {
  idleMotionEnabled = await desktopApi.toggleIdleMotion();
  idleButton.setAttribute("aria-pressed", String(idleMotionEnabled));
  if (idleMotionEnabled && currentMotionIndex >= 0) activateIdleMotion(currentMotionIndex);
});

desktopApi.onOpenModel(() => void chooseModel());
desktopApi.onOpenMotion(() => void chooseMotion());
desktopApi.onAlwaysOnTopChanged((isPinned) => {
  pinButton.setAttribute("aria-pressed", String(isPinned));
});
desktopApi.onInteractionModeChanged((mode) => {
  interactionMode = mode;
  applyInteractionMode();
});
desktopApi.onGazeModeChanged((mode) => {
  gazeMode = mode;
  gazeYaw = 0;
  gazePitch = 0;
  previousGazeTime = 0;
  updateGazeButton();
});
desktopApi.onRenderSettingsChanged(applyRenderSettings);
desktopApi.onPhysicsEnabledChanged((isEnabled) => {
  physicsEnabled = isEnabled;
  resetPhysics();
  updatePhysicsButton();
});
desktopApi.onGlobalCursorPosition((position) => {
  cursorNdc.set(position.x, position.y);
});
desktopApi.onIdleMotionChanged((isEnabled) => {
  idleMotionEnabled = isEnabled;
  idleButton.setAttribute("aria-pressed", String(isEnabled));
  if (isEnabled && currentMotionIndex >= 0) activateIdleMotion(currentMotionIndex);
});

window.addEventListener("pointermove", showToolbar, { passive: true });
window.addEventListener(
  "pointermove",
  (event) => {
    cursorNdc.set(
      (event.clientX / Math.max(window.innerWidth, 1)) * 2 - 1,
      -(event.clientY / Math.max(window.innerHeight, 1)) * 2 + 1,
    );
  },
  { passive: true },
);
window.addEventListener("pointerdown", showToolbar, { passive: true });
toolbar.addEventListener("pointerenter", () => {
  isToolbarActive = true;
  showToolbar();
});
toolbar.addEventListener("pointerleave", () => {
  isToolbarActive = false;
  showToolbar();
});
menuReveal.addEventListener("pointerenter", showToolbar);

windowMoveHandle.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  windowMovePointerId = event.pointerId;
  windowMoveHandle.setPointerCapture(event.pointerId);
  desktopApi.beginWindowDrag();
});
windowMoveHandle.addEventListener("pointermove", (event) => {
  if (windowMovePointerId !== event.pointerId) return;
  desktopApi.updateWindowDrag();
});
function endWindowMove(event: PointerEvent): void {
  if (windowMovePointerId !== event.pointerId) return;
  windowMovePointerId = null;
  if (windowMoveHandle.hasPointerCapture(event.pointerId)) {
    windowMoveHandle.releasePointerCapture(event.pointerId);
  }
  desktopApi.endWindowDrag();
}
windowMoveHandle.addEventListener("pointerup", endWindowMove);
windowMoveHandle.addEventListener("pointercancel", endWindowMove);

resizeHandle.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  windowResizePointerId = event.pointerId;
  resizeHandle.setPointerCapture(event.pointerId);
  desktopApi.beginWindowResize();
});
resizeHandle.addEventListener("pointermove", (event) => {
  if (windowResizePointerId !== event.pointerId) return;
  desktopApi.updateWindowResize();
});
function endWindowResize(event: PointerEvent): void {
  if (windowResizePointerId !== event.pointerId) return;
  windowResizePointerId = null;
  if (resizeHandle.hasPointerCapture(event.pointerId)) {
    resizeHandle.releasePointerCapture(event.pointerId);
  }
  desktopApi.endWindowResize();
}
resizeHandle.addEventListener("pointerup", endWindowResize);
resizeHandle.addEventListener("pointercancel", endWindowResize);

window.addEventListener("keydown", (event) => {
  if (
    event.key.toLowerCase() === "m" &&
    !event.repeat &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  ) {
    event.preventDefault();
    desktopApi.showMenu();
    showToolbar();
    return;
  }
});
window.addEventListener("blur", () => {
  windowMovePointerId = null;
  windowResizePointerId = null;
  desktopApi.endWindowDrag();
  desktopApi.endWindowResize();
});
window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  desktopApi.showMenu();
  showToolbar();
});

window.addEventListener("resize", resizeRenderer);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hiddenAt = performance.now();
    return;
  }
  if (hiddenAt !== null) {
    const hiddenSeconds = (performance.now() - hiddenAt) / 1000;
    motionStartedAt += hiddenSeconds;
    motionSwitchedAt += hiddenSeconds;
  }
  hiddenAt = null;
  previousRenderTime = 0;
  previousGazeTime = 0;
  resetPhysics();
});

function animate(timeMilliseconds: number): void {
  requestAnimationFrame(animate);
  if (document.hidden) return;
  const frameInterval = 1000 / renderSettings.fps;
  const elapsed = timeMilliseconds - previousRenderTime;
  if (previousRenderTime > 0 && elapsed < frameInterval - 0.5) return;
  previousRenderTime =
    previousRenderTime === 0 ? timeMilliseconds : timeMilliseconds - (elapsed % frameInterval);
  const seconds = timeMilliseconds / 1000;
  updateMotion(seconds);
  updateGaze(seconds);
  controls.update();
  renderer.render(scene, camera);
}

resizeRenderer();
requestAnimationFrame(animate);

void desktopApi.isAlwaysOnTop().then((isPinned) => {
  pinButton.setAttribute("aria-pressed", String(isPinned));
});

void desktopApi.getInteractionMode().then((mode) => {
  interactionMode = mode;
  applyInteractionMode();
});

void desktopApi.getGazeMode().then((mode) => {
  gazeMode = mode;
  updateGazeButton();
});

void desktopApi.getRenderSettings().then(applyRenderSettings);

void Promise.all([desktopApi.isPhysicsEnabled(), mmdLoaderPromise]).then(([isEnabled]) => {
  physicsEnabled = isEnabled;
  updatePhysicsButton();
});

void desktopApi.isIdleMotionEnabled().then((isEnabled) => {
  idleMotionEnabled = isEnabled;
  idleButton.setAttribute("aria-pressed", String(isEnabled));
});

void desktopApi.getSavedModel().then((info) => {
  if (info) void loadModel(info);
});
