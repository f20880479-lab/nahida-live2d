// 验证两个修复已生效
(async () => {
  const appjs = await (await fetch('http://127.0.0.1:5179/app.js')).text();
  console.log('app.js: speak 支持语调覆盖 =', appjs.includes('emotionOverride'));
  console.log('app.js: 摄像头反馈用 normal 语调 =', appjs.includes("speak(line, 'normal')"));
  const cam = await (await fetch('http://127.0.0.1:5179/camera.js')).text();
  console.log('camera.js: 每帧重绘视频 =', cam.includes('drawFrame()'));
  console.log('camera.js: 检测节流 350ms =', cam.includes('}, 350)'));
  const idx = await (await fetch('http://127.0.0.1:5179/')).text();
  console.log('index: face-api 脚本 =', idx.includes('/vendor/face-api/face-api.js'));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
