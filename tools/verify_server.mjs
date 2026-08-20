// 服务器验证脚本(临时):检查页面/JS/CSS/TTS/聊天接口
(async () => {
  const base = 'http://127.0.0.1:5179';
  const r1 = await fetch(base + '/');
  const html = await r1.text();
  console.log('index:', r1.status, '| has stage:', html.includes('id="stage"'), '| nick placeholder 亲爱的:', html.includes('亲爱的'));

  const r2 = await fetch(base + '/app.js');
  const js = await r2.text();
  console.log('app.js:', r2.status, 'len', js.length,
    '| vnoise:', js.includes('function vnoise'),
    '| 值噪声:', js.includes('平滑值噪声'),
    '| 默认称呼亲爱的:', js.includes("nick: '亲爱的'"),
    '| 旧胡桃ARM(应为false):', js.includes('z: -0.5'));

  const r3 = await fetch(base + '/style.css');
  const css = await r3.text();
  console.log('style.css:', r3.status, 'len', css.length,
    '| nahida vars:', css.includes('--nahida-green'),
    '| 无hutao vars:', !css.includes('--hutao-'));

  const r4 = await fetch(base + '/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '你好呀,今天过得怎么样?', emotion: 'happy' }),
  });
  console.log('tts:', r4.status, '| type:', r4.headers.get('content-type'));

  const r5 = await fetch(base + '/api/interact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone: 'hand' }),
  });
  const j5 = await r5.json();
  console.log('interact:', r5.status, '| reply:', j5.reply, '| emotion:', j5.emotion);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
