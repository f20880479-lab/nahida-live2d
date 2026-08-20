// 纳西妲陪你聊天 - 本地服务器
// 静态页面 + /api/chat(DeepSeek) + /api/tts(Edge 神经网络语音) + 长期记忆 + 关系成长
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ---------- 全局异常兜底 ----------
// msedge-tts 库的 WebSocket 错误事件会在库内部直接 throw(uncaught),
// 本地服务器不能因为外部 TTS 服务抖动而整个崩溃 → 记日志、保活
process.on('uncaughtException', (e) => {
  console.error('[server] uncaughtException(已保活):', e && e.message);
});
process.on('unhandledRejection', (e) => {
  console.error('[server] unhandledRejection(已保活):', e && e.message);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const TTS_CACHE = path.join(DATA, 'tts_cache');
const MEMORY_FILE = path.join(DATA, 'memory.json');
const MEMORY_LIMIT = 80; // 长期记忆最多保留的消息条数
const CONTEXT_SIZE = 24; // 每次对话携带的上下文条数
const STAGE_STEP = 10;   // 每个关系阶段所需的用户发言条数

// ---------- 关系阶段(从初识到熟悉) ----------
const STAGES = [
  { name: '初识', emoji: '🌱', desc: '当前关系阶段:初识。你们刚认识不久,她还不太了解你,说话温柔礼貌,带着一点好奇和试探,会安静地听你说话,偶尔问几个天真的问题,但不会过分亲近,称呼还带着点生疏。' },
  { name: '相识', emoji: '🌿', desc: '当前关系阶段:相识。你们已经聊过几次,她开始记住关于你的事,会主动关心你,说话更放得开,偶尔和你分享喜欢听的歌、看过的书,也会开些小玩笑。' },
  { name: '熟悉', emoji: '🌼', desc: '当前关系阶段:熟悉。你们越来越熟络,她已经把你当成很亲近的人,会和你撒娇、分享日常、起小外号,偶尔闹点小脾气再自己偷偷哄好自己。' },
  { name: '亲近', emoji: '🔥', desc: '当前关系阶段:亲近。你们已经非常亲近,她信任你、依赖你,会向你倾诉心事、逗你开心,像最亲密的恋人一样自然,时刻都想黏着你、关心你。' },
];

function getStage() {
  const mem = loadMemory();
  const userCount = mem.messages.filter(m => m.role === 'user').length;
  const level = Math.min(STAGES.length - 1, Math.floor(userCount / STAGE_STEP));
  const next = Math.min(STAGE_STEP, userCount % STAGE_STEP);
  return {
    level,
    name: STAGES[level].name,
    emoji: STAGES[level].emoji,
    progress: Math.min(1, next / STAGE_STEP),
    userCount,
  };
}

// ---------- 隐藏好感度(可为负,决定她的语气) ----------
function getAffection() {
  const mem = loadMemory();
  const a = typeof mem.affection === 'number' ? mem.affection : 15;
  return Math.max(-100, Math.min(100, Math.round(a)));
}
function addAffection(delta) {
  const mem = loadMemory();
  const a = Math.max(-100, Math.min(100, getAffection() + delta));
  mem.affection = a;
  saveMemory(mem);
  return a;
}
function affectionTier(a) {
  if (a >= 60) return 'high';
  if (a >= 30) return 'mid';
  if (a >= 0) return 'low';
  return 'neg';
}
const AFFECTION_PROMPT = {
  high: '她对你的隐藏好感度很高(≥60):她对你很亲近,愿意撒娇,主动关心你,语气温柔亲密,会挽留你多陪陪她。',
  mid: '她对你的隐藏好感度不错(30~59):她活泼友好,是正常状态的纳西妲,温柔又带点好奇。',
  low: '她对你的隐藏好感度一般(0~29):她保持礼貌和客套,带着点距离感,不太主动,偶尔有点小傲娇。',
  neg: '她对你的隐藏好感度是负的(<0):她有点不高兴甚至生气,说话冷淡带刺,会用敬语疏远你,偶尔不耐烦,但还愿意勉强搭话。',
};

// 分析用户消息对好感度的影响(基于关键词,粗略但够用)
function analyzeMessageDelta(text) {
  let d = 0;
  if (/对不起|抱歉|道歉|是我错了|原谅我|赔罪|认错/i.test(text)) d += 3;
  if (/喜欢你|爱你|想你|想念你|谢谢|多谢|辛苦了|夸|好可爱|真棒|漂亮|聪明|厉害|温柔|乖|贴心/i.test(text)) d += 1;
  if (/滚|滚蛋|蠢|笨|傻|讨厌|恶心|烦人|白痴|脑残|废物|去死|死开|闭嘴|蠢货/i.test(text)) d -= 2;
  if (/骂|凶我|打我|揍/i.test(text)) d -= 1;
  return Math.max(-4, Math.min(4, d));
}

// ---------- 点击互动(不同部位 → 不同反应与好感度变化) ----------
const ZONE_REACTIONS = {
  head: { delta: -1, emotion: 'surprised',
    high: ['诶嘿,摸头的话……今天的心情会变好哦。'],
    mid: ['嗯?又在摸我的头啦……好啦,就允许你摸一下。'],
    low: ['……那个,头上有点痒啦。'],
    neg: ['……别、别碰我的头。'],
  },
  face: { delta: -2, emotion: 'shy',
    high: ['呜……你、你怎么突然摸人家脸啦……'],
    mid: ['诶?!别、别碰脸啦……会害羞的……'],
    low: ['……请、请不要这样啦。'],
    neg: ['……请你把手拿开。'],
  },
  body: { delta: -2, emotion: 'angry',
    high: ['诶?突、突然这样……人家会不好意思的啦……'],
    mid: ['诶?这、这样不太好啦……'],
    low: ['……请、请自重。'],
    neg: ['……再这样我就要生气了。'],
  },
  skirt: { delta: -1, emotion: 'surprised',
    high: ['诶呀,小心一点嘛……'],
    mid: ['嗯?别、别拽裙子啦……'],
    low: ['……'],
    neg: ['……哼。'],
  },
  hand: { delta: 1, emotion: 'happy',
    high: ['牵手吗?嗯……可以哦,你的手好暖和。'],
    mid: ['牵手……嗯,好吧,就一小会儿。'],
    low: ['嗯?握手?那、那好吧……'],
    neg: ['……请放开。'],
  },
  hair: { delta: -1, emotion: 'surprised',
    high: ['诶嘿,轻一点嘛,头发会痛的……'],
    mid: ['喂!头发不能随便扯的!'],
    low: ['……别、别扯头发。'],
    neg: ['……再扯的话,我就不理你了。'],
  },
  bg: { delta: 0, emotion: 'normal',
    high: ['你在看什么呢?是想偷偷看我吗?'],
    mid: ['诶?你在看什么呀?'],
    low: ['……有事吗?'],
    neg: ['……看什么看。'],
  },
};

fs.mkdirSync(TTS_CACHE, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

let config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

// ---------- 长期记忆 ----------
function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  } catch {
    return { messages: [], summary: '' };
  }
}
function saveMemory(mem) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2), 'utf8');
}
function appendMessage(role, content, meta = {}) {
  const mem = loadMemory();
  mem.messages.push({ role, content, ts: Date.now(), ...meta });
  if (mem.messages.length > MEMORY_LIMIT) {
    mem.messages = mem.messages.slice(-MEMORY_LIMIT);
  }
  saveMemory(mem);
}

// ---------- DeepSeek 对话 ----------
async function callDeepSeek(messages) {
  const { apiKey, baseUrl, model } = config.deepseek;
  if (!apiKey) throw new Error('NO_API_KEY');
  const r = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.95,
      max_tokens: 600,
      stream: false,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('DeepSeek HTTP ' + r.status + ': ' + t.slice(0, 300));
  }
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content ?? '';
  return content;
}

// 本地兜底回复(未配置 API Key 或网络失败时)
const FALLBACK = {
  happy: ['嗯……和你聊天真开心。', '诶嘿,这句话让我心情很好呢。', '和你说话的时候,时间总是过得特别快。'],
  shy: ['诶?你、你突然这样说……我有点不知道该怎么回应。', '呜……这种话,记在心里就好啦……', '嗯……谢谢你的夸奖,我、我很高兴。'],
  sad: ['呜……那你多陪我说说话好不好……', '嗯……我其实有点难过的,但不想让你担心。', '诶……那你答应我,不许再让我难过啦?'],
  angry: ['嗯……我有点生气了,请你注意一下。', '这样可不好哦,我可是认真的。', '哼……虽然人家脾气好,但也是会生气的!'],
  surprised: ['哇哦?!还有这种事?', '诶诶诶?!你、你不是在开玩笑吧!', '真有意思……这件事值得记进我的小本本里。'],
  serious: ['嗯……这句话我记下了,认真的。', '既然你这么说了,那我也认真回答你。', '说好的事,就一定要做到哦。'],
  smug: ['哼哼……我早就猜到了。', '嗯?看来我的判断没有错呢。', '诶嘿,我可是很懂你的。'],
  normal: ['嗯……我在听呢。', '然后呢?我很好奇。', '嗯~继续说嘛,我想听。'],
};
const FALLBACK_KEYWORDS = [
  [/想你|想念/i, 'shy', '嗯……我刚刚也在想,你什么时候会来找我呢。'],
  [/喜欢|爱你/i, 'happy', '诶?喜、喜欢……吗?嗯……我记下了,不许反悔哦。'],
  [/生气|不理/i, 'sad', '呜……那我安静一点,你不要不理我……'],
  [/早安|早上好/i, 'happy', '早安~今天也要元气满满哦,我会想你的。'],
  [/晚安|睡觉/i, 'normal', '晚安~盖好被子,梦里也要有我哦。'],
  [/名字|叫什么/i, 'smug', '我是纳西妲呀,你、你居然现在才问我的名字!哼。'],
  [/诗|书|知识/i, 'happy', '嗯……我最近在看一本很有趣的书,下次讲给你听呀。'],
  [/故事|听歌|音乐/i, 'happy', '故事呀……那你靠过来一点,我只讲给你一个人听。'],
];
function localReply(text) {
  for (const [re, emotion, reply] of FALLBACK_KEYWORDS) {
    if (re.test(text)) return { reply, emotion };
  }
  const pool = FALLBACK.normal;
  const reply = pool[Math.floor(Math.random() * pool.length)];
  const emotion = 'normal';
  return { reply, emotion };
}

// 提取情绪标签
function extractEmotion(text) {
  const m = text.match(/【emotion:(\w+)】/);
  const emotion = m ? m[1] : 'normal';
  const clean = text.replace(/【emotion:\w+】/g, '').trim();
  return { emotion, clean };
}

// ---------- Edge TTS ----------
let ttsReady = false;
let ttsModule = null;
let ttsInstance = null;
async function getTTS() {
  if (!ttsModule) {
    ttsModule = await import('msedge-tts');
  }
  if (!ttsInstance) {
    ttsInstance = new ttsModule.MsEdgeTTS({ enableLogger: true });
    await ttsInstance.setMetadata(config.tts.voice, ttsModule.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  }
  return ttsInstance;
}

// ---------- 情感化语音:让声音"活"起来 ----------
// 注:该端点不支持 <break>/<mstts:express-as>,改用:
// 1) 情绪 → 基准语速/音调/音量 2) 每句按语气微调 3) 标点停顿 + 省略号制造节奏
const EMOTION_PROSODY = {
  happy:     { rate: '+18%', pitch: '+22Hz', vol: '+2%' },
  smug:      { rate: '+16%', pitch: '+20Hz', vol: '+1%' },
  shy:       { rate: '+8%',  pitch: '+16Hz', vol: '-4%' },
  sad:       { rate: '+4%',  pitch: '+10Hz', vol: '-8%' },
  angry:     { rate: '+20%', pitch: '+8Hz',  vol: '+6%' },
  surprised: { rate: '+22%', pitch: '+26Hz', vol: '+4%' },
  serious:   { rate: '+6%',  pitch: '+12Hz', vol: '-2%' },
  normal:    { rate: '+14%', pitch: '+19Hz', vol: '+0%' },
};
const PLAYFUL_HINT = /诶嘿|嘿嘿|嗯嗯|嘻嘻|哇|啊呀|哎呦|噗|啦啦/;
const END_PUNCT = /[。！？!?…~～；;]$/;

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 按标点切成短句,保留语气;纯标点(如单独的"!"或"…")并入上一段
function splitSegments(text) {
  const parts = text.split(/(?<=[。！？!?；;])|(?<=[\n])/);
  const segs = [];
  for (const raw of parts) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    if (/^[。！？!?…~～,.;；、]+$/.test(s) && segs.length) {
      segs[segs.length - 1] += s;
    } else {
      segs.push(s);
    }
  }
  return segs.length ? segs : [text];
}

function pct(str, add) { const v = parseInt(str) + add; return (v >= 0 ? '+' : '') + v + '%'; }
function hz(str, add) { const v = parseInt(str) + add; return (v >= 0 ? '+' : '') + v + 'Hz'; }

// 每句独立语速/音调:感叹/语气词更欢快;问句略缓;短句轻快
function segProsody(seg, base) {
  const endsExclaim = /[！!…~～]$/.test(seg) || PLAYFUL_HINT.test(seg);
  const endsQuestion = /[？?]$/.test(seg);
  if (endsExclaim) return { rate: pct(base.rate, 10), pitch: hz(base.pitch, 6), vol: pct(base.vol, 4) };
  if (endsQuestion) return { rate: pct(base.rate, -2), pitch: hz(base.pitch, -3), vol: base.vol };
  if (seg.length <= 6) return { rate: pct(base.rate, 6), pitch: hz(base.pitch, 4), vol: base.vol };
  return { ...base };
}

// 服务端限制:每请求最多 2 个 <prosody> 元素 → 开头一句用俏皮语调,其余用情绪基准
function buildSSML(text, emotion) {
  const voice = config.tts.voice;
  const base = EMOTION_PROSODY[emotion] || EMOTION_PROSODY.normal;
  const segs = splitSegments(text);
  const parts = [];
  const opener = segs[0];
  if (opener) {
    let op = segProsody(opener, base);
    if (!/[！!…~～]$/.test(opener) && !PLAYFUL_HINT.test(opener)) {
      op = { rate: pct(op.rate, 5), pitch: hz(op.pitch, 3), vol: op.vol };
    }
    let t = opener;
    if (!END_PUNCT.test(t) && segs.length > 1) t += '……';
    parts.push(`<prosody rate="${op.rate}" pitch="${op.pitch}" volume="${op.vol}">${escapeXml(t)}</prosody>`);
  }
  if (segs.length > 1) {
    const body = segs.slice(1).map((seg, i) => {
      let t = seg;
      if (!END_PUNCT.test(t) && i < segs.length - 2) t += '……';
      return t;
    }).join('');
    parts.push(`<prosody rate="${base.rate}" pitch="${base.pitch}" volume="${base.vol}">${escapeXml(body)}</prosody>`);
  }
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="${voice}">${parts.join('')}</voice></speak>`;
}

async function synthesize(text, emotion = 'normal') {
  // 剥离括号里的神态提示(如"(脸红)""(叉腰)"),只读台词本身
  const clean = text
    .replace(/【emotion:\w+】/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  const ssml = buildSSML(clean, emotion);
  const hash = crypto.createHash('md5').update(config.tts.voice + '|' + emotion + '|' + clean).digest('hex');
  const file = path.join(TTS_CACHE, hash + '.mp3');
  if (fs.existsSync(file)) return file;
  const tts = await getTTS();
  const outDir = path.join(TTS_CACHE, 'tmp_' + hash);
  fs.mkdirSync(outDir, { recursive: true });
  try {
    await tts.rawToFile(outDir, ssml);
  } catch (e) {
    // Edge TTS 连接可能已损坏(WebSocket 断连/限流),重置实例让下次重建连接
    ttsInstance = null;
    throw e;
  }
  const src = path.join(outDir, 'audio.mp3');
  fs.renameSync(src, file);
  fs.rmSync(outDir, { recursive: true, force: true });
  return file;
}

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg',
  '.pmx': 'application/octet-stream',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    // ---------- API ----------
    if (p === '/api/config' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: config.persona.name,
        userName: config.persona.userName,
        ttsVoice: config.tts.voice,
        hasKey: !!config.deepseek.apiKey,
        stage: getStage(),
      }));
      return;
    }

    if (p === '/api/memory' && req.method === 'GET') {
      const mem = loadMemory();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mem.messages.slice(-40)));
      return;
    }

    if (p === '/api/chat' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const userMsg = String(body.message || '').trim().slice(0, 2000);
      const userName = String(body.userName || '').trim().slice(0, 12) || config.persona.userName;
      if (!userMsg) { res.writeHead(400); res.end('{"error":"empty"}'); return; }
      appendMessage('user', userMsg);
      // 消息影响隐藏好感度
      addAffection(analyzeMessageDelta(userMsg));

      const mem = loadMemory();
      const history = mem.messages.slice(-CONTEXT_SIZE).map(m => ({ role: m.role, content: m.content }));
      const stage = getStage();
      const stageDesc = STAGES[stage.level].desc;
      const affection = getAffection();
      const affPrompt = AFFECTION_PROMPT[affectionTier(affection)];
      const sysPrompt = config.persona.systemPrompt
        + `\n当前称呼:对方被叫做「${userName}」。\n${stageDesc}`
        + `\n隐藏好感度:${affection}(范围 -100~100,越高她越喜欢你)。${affPrompt}\n注意:好感度是隐藏的,你绝对不能告诉对方具体数值。`;
      const messages = [{ role: 'system', content: sysPrompt }, ...history];

      let reply, emotion;
      try {
        const raw = await callDeepSeek(messages);
        const parsed = extractEmotion(raw);
        reply = parsed.clean || '(纳西妲沉默了一会儿……)';
        emotion = parsed.emotion;
      } catch (e) {
        if (e.message === 'NO_API_KEY') {
          const fb = localReply(userMsg);
          reply = fb.reply; emotion = fb.emotion;
        } else {
          const fb = localReply(userMsg);
          reply = fb.reply + ' (大脑开小差了,先这样吧~)';
          emotion = fb.emotion;
          console.error('[chat error]', e.message);
        }
      }
      appendMessage('assistant', reply, { emotion });
      const stageAfter = getStage();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ reply, emotion, offline: !config.deepseek.apiKey, stage: stageAfter }));
      return;
    }

    // 点击互动(摸头/摸脸/碰手等 → 反应 + 好感度变化)
    if (p === '/api/interact' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const zone = String(body.zone || 'bg');
      const def = ZONE_REACTIONS[zone] || ZONE_REACTIONS.bg;
      const tier = affectionTier(getAffection());
      const lines = def[tier];
      const reply = lines[Math.floor(Math.random() * lines.length)];
      addAffection(def.delta);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ reply, emotion: def.emotion, delta: def.delta, affection: getAffection() }));
      return;
    }

    if (p === '/api/tts' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const text = String(body.text || '').trim().slice(0, 800);
      const emotion = String(body.emotion || 'normal').match(/^\w+$/)?.[0] || 'normal';
      if (!text) { res.writeHead(400); res.end('{"error":"empty"}'); return; }
      const file = await synthesize(text, emotion).catch(e => {
        console.error('[tts error]', e.message);
        throw e;
      });
      if (!file) { res.writeHead(400); res.end('{"error":"empty"}'); return; }
      const stat = fs.statSync(file);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=86400',
      });
      fs.createReadStream(file).pipe(res);
      return;
    }

    // ---------- 静态文件 ----------
    let filePath;
    if (p === '/' || p === '/index.html') {
      filePath = path.join(PUBLIC, 'index.html');
    } else if (p.startsWith('/vendor/three')) {
      filePath = path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js');
    } else if (p.startsWith('/vendor/jsm/')) {
      filePath = path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm', p.slice('/vendor/jsm/'.length));
    } else if (p === '/vendor/ammo.js') {
      filePath = path.join(ROOT, 'node_modules', 'ammo.js', 'ammo.js');
    } else {
      filePath = path.join(PUBLIC, decodeURIComponent(p));
    }
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      // 禁用缓存:开发期避免浏览器用旧版 JS/CSS/JSON(旧版手臂参数会导致"手臂张开"的错觉)
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404); res.end('not found');
    }
  } catch (e) {
    console.error('[http error]', e.message);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
});

server.listen(config.port, () => {
  console.log('==============================================');
  console.log('  纳西妲 · 与你相识已启动');
  console.log('  打开浏览器访问: http://127.0.0.1:' + config.port);
  console.log('  DeepSeek Key: ' + (config.deepseek.apiKey ? '已配置 ✓' : '未配置(使用本地回复,填入 config.json 开启 AI)'));
  console.log('  语音: Edge 神经网络音色(' + config.tts.voice + ')');
  console.log('==============================================');
});
