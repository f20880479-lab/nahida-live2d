// ============ 纳西妲 · Live2D 渲染层 ============
// 技术栈参考 anime-desktop-pet:pixi.js v7 UMD + pixi-live2d-display UMD(纯 script 标签)
// API: Live2DModel.from() 加载、model.motion(组名) 动作、model.focus() 视线跟随、参数驱动嘴型/情绪
(function () {
  const API = {
    _ready: false,
    _model: null,
    _app: null,
    _state: { mouth: 0, emotion: 'normal', speaking: false },
    onReady: null,
    onError: null,

    async init(container) {
      if (!window.PIXI || !window.PIXI.live2d) {
        this.onError && this.onError('pixi-live2d-display 缺失');
        return;
      }
      try {
        this._app = new PIXI.Application({
          width: window.innerWidth,
          height: window.innerHeight,
          transparent: true,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resizeTo: window,
        });
        container.appendChild(this._app.view);
        const v = this._app.view;
        v.style.position = 'absolute';
        v.style.inset = '0';
        v.style.width = '100%';
        v.style.height = '100%';
        v.style.pointerEvents = 'none';
        window.addEventListener('resize', () => this._layout());
        await this._loadModel();
        this._app.ticker.add((ticker) => this._update(ticker.deltaMS / 1000));
        this._ready = true;
        console.log('[live2d] 明石猫娘加载完成(pixi-live2d-display)');
        this.onReady && this.onReady();
      } catch (e) {
        const msg = String((e && e.message) || e);
        console.error('[live2d] init 失败:', e);
        // 把真实原因暴露给界面,便于定位
        this.onError && this.onError(msg);
      }
    },

    async _loadModel() {
      // 等待 Cubism 核心 wasm 就绪(内嵌 wasm 异步初始化,最多等 3 秒)
      await this._waitForCore();
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          this._model = await PIXI.live2d.Live2DModel.from('/live2d/nahida/Nahida_1080.model3.json', {
            autoInteract: true, // 自动交互(命中测试/点击),参考 anime-desktop-pet
          });
          this._layout();
          this._app.stage.addChild(this._model);
          // 动作播完自动回到 Idle(参考 anime-desktop-pet 的 idle 循环思路)
          this._model.on('motionfinish', () => this.playMotion('Idle'));
          this.playMotion('Idle');
          return;
        } catch (e) {
          lastErr = e;
          console.warn('[live2d] 模型加载第', attempt + 1, '次失败:', e && e.message);
          await new Promise(r => setTimeout(r, 500));
        }
      }
      throw lastErr || new Error('模型加载失败');
    },

    // 等待核心可用:_isStarted 置位或 Moc 可调用
    async _waitForCore() {
      for (let i = 0; i < 60; i++) {
        try {
          if (window.Live2DCubismCore && window.Live2DCubismCore._isStarted) return;
          if (window.Live2DCubismCore && window.Live2DCubismCore.Moc && window.Live2DCubismCore.Moc.fromArrayBuffer) {
            // 探测:用 4 字节空 moc3 试一次(能走通说明 asm 已就绪)
            const probe = new Uint8Array([0x4d, 0x4f, 0x43, 0x33, 1, 0, 0, 0]).buffer;
            const m = window.Live2DCubismCore.Moc.fromArrayBuffer(probe);
            if (m) { window.Live2DCubismCore._isStarted = true; return; }
            window.Live2DCubismCore._isStarted = false;
          }
        } catch (e) { /* 核心未就绪,继续等 */ }
        await new Promise(r => setTimeout(r, 50));
      }
    },

    // 布局:anime-desktop-pet 同款——按容器等比缩放,底部对齐
    _layout() {
      if (!this._model) return;
      const W = this._app.renderer.width, H = this._app.renderer.height;
      const m = this._model;
      try {
        const scale = Math.min(W / m.width, H / m.height) * 0.92;
        m.scale.set(scale);
        m.anchor.set(0.5, 0.9);
        m.x = W * 0.5;
        m.y = H * 0.98;
      } catch (e) { console.warn('[live2d] 布局失败', e.message); }
    },

    _update(dt) {
      if (!this._model || !this._model.internalModel) return;
      const core = this._model.internalModel.coreModel;
      if (!core) return;
      const s = this._state;
      // 嘴型:说话时随音频音量开合(参数名来自模型动作曲线)
      core.setParameterValueById('ParamMouthOpenY', s.speaking ? s.mouth * 0.9 + 0.2 : 0);
      // 情绪:眉毛/嘴型/腮红/表情眼,平滑混合
      this._applyEmotion(dt);
    },

    // 情绪 → 参数(拉菲模型的参数名:ParamBrowLY/RY、ParamMouthForm、ParamCheek、PARAM_Smile_eye 等)
    _applyEmotion(dt) {
      const core = this._model.internalModel.coreModel;
      const e = this._state.emotion;
      const T = {
        happy:     { ParamBrowLY: 0.18, ParamBrowRY: 0.18, ParamMouthForm: 0.7,  ParamCheek: 0.5, PARAM_Smile_eye: 1.0, PARAM_Angry_eye: 0 },
        shy:       { ParamBrowLY: 0.08, ParamBrowRY: 0.08, ParamMouthForm: -0.2, ParamCheek: 0.9, PARAM_Smile_eye: 0.3, PARAM_Angry_eye: 0 },
        sad:       { ParamBrowLY: -0.3, ParamBrowRY: -0.3, ParamMouthForm: -0.4, ParamCheek: 0,   PARAM_Smile_eye: 0,   PARAM_Angry_eye: 0 },
        angry:     { ParamBrowLY: -0.55, ParamBrowRY: -0.55, ParamMouthForm: 0.3,  ParamCheek: 0.2, PARAM_Smile_eye: 0,   PARAM_Angry_eye: 1.0 },
        surprised: { ParamBrowLY: 0.5,  ParamBrowRY: 0.5,  ParamMouthForm: 0.4,  ParamCheek: 0.1, PARAM_Smile_eye: 0,   PARAM_Angry_eye: 0 },
        serious:   { ParamBrowLY: -0.2, ParamBrowRY: -0.2, ParamMouthForm: 0,    ParamCheek: 0,   PARAM_Smile_eye: 0,   PARAM_Angry_eye: 0.2 },
        smug:      { ParamBrowLY: 0.35, ParamBrowRY: -0.25, ParamMouthForm: 0.55, ParamCheek: 0.3, PARAM_Smile_eye: 0.6, PARAM_Angry_eye: 0 },
        normal:    { ParamBrowLY: 0,    ParamBrowRY: 0,    ParamMouthForm: 0,    ParamCheek: 0,   PARAM_Smile_eye: 0,   PARAM_Angry_eye: 0 },
      };
      const t = T[e] || T.normal;
      const s = 1 - Math.exp(-8 * (dt || 0.016));
      const cur = this._emCur || (this._emCur = {});
      for (const k of Object.keys(T.normal)) {
        if (cur[k] === undefined) cur[k] = t[k];
        else cur[k] += (t[k] - cur[k]) * s;
        core.setParameterValueById(k, cur[k]);
      }
    },

    playMotion(group) {
      if (!this._model) return;
      try { this._model.motion(group); } catch (e) { console.warn('[live2d] motion', group, e.message); }
    },

    // 外部 API
    setMouth(v) { this._state.mouth = Math.max(0, Math.min(1, v)); },
    setSpeaking(on) { this._state.speaking = !!on; },
    setEmotion(name) { if (name) this._state.emotion = name; },
    // 视线跟随(anime-desktop-pet 同款:传 canvas 相对像素坐标)
    setPointer(x, y) {
      if (this._model && this._model.focus) this._model.focus(x, y);
    },
    tap() {
      const pool = ['TapBody', 'TapHead', 'TapBody', 'TapBody', 'TapSpecial'];
      this.playMotion(pool[Math.floor(Math.random() * pool.length)]);
    },
    get ready() { return this._ready; },
  };

  window.TaffyLive2D = API;
})();
