// BVH 解析器(tokenizer 方式,兼容 CMU 格式)+ 待机片段质量评估
import fs from 'node:fs';

export function parseBVH(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const toks = txt.split(/\s+/).filter(Boolean);
  let i = 0;
  const jointOrder = [];
  const channels = [];
  const offsets = [];
  const parents = [];
  const next = () => toks[i++];
  const peek = () => toks[i];
  const expect = (s) => { const t = next(); if (t !== s) throw new Error('expected "' + s + '" got "' + t + '" @' + i); };
  const num = () => parseFloat(next());

  const parseJoint = (parent) => {
    const name = next();
    const id = jointOrder.length;
    jointOrder.push(name);
    parents.push(parent);
    expect('{');
    expect('OFFSET');
    offsets.push([num(), num(), num()]);
    if (peek() === 'CHANNELS') {
      next();
      const n = parseInt(next());
      const ch = [];
      for (let k = 0; k < n; k++) ch.push(next());
      channels.push(ch);
    } else channels.push([]);
    while (peek() === 'JOINT' || peek() === 'End') {
      if (peek() === 'JOINT') { next(); parseJoint(id); }
      else { next(); expect('Site'); expect('{'); expect('OFFSET'); num(); num(); num(); expect('}'); }
    }
    expect('}');
  };

  expect('HIERARCHY');
  expect('ROOT');
  parseJoint(-1);
  expect('MOTION');
  expect('Frames:');
  const frames = parseInt(next());
  expect('Frame');
  expect('Time:');
  const frameTime = parseFloat(next());
  const totalCh = channels.reduce((a, c) => a + c.length, 0);
  const values = [];
  for (let f = 0; f < frames; f++) {
    const row = [];
    for (let c = 0; c < totalCh; c++) row.push(num());
    values.push(row);
  }
  return { jointOrder, channels, offsets, parents, frames, frameTime, values };
}

// 各关节局部旋转幅度(度)
export function amplitudeStats(file) {
  const b = parseBVH(file);
  const axisIdx = { Xrotation: 0, Yrotation: 1, Zrotation: 2, xrotation: 0, yrotation: 1, zrotation: 2 };
  // 每关节通道在帧行里的起始偏移
  const chStart = [];
  let acc = 0;
  for (const ch of b.channels) { chStart.push(acc); acc += ch.length; }
  const stats = {};
  for (const j of ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'RightArm']) {
    const i = b.jointOrder.indexOf(j);
    if (i < 0) continue;
    const ch = b.channels[i];
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const f of b.values) {
      for (let c = 0; c < ch.length; c++) {
        const ax = axisIdx[ch[c]];
        if (ax === undefined) continue;
        const v = f[chStart[i] + c];
        if (v < min[ax]) min[ax] = v;
        if (v > max[ax]) max[ax] = v;
      }
    }
    stats[j] = { rx: (max[0] - min[0]).toFixed(1) + '°', ry: (max[1] - min[1]).toFixed(1) + '°', rz: (max[2] - min[2]).toFixed(1) + '°' };
  }
  return { duration: (b.frames * b.frameTime).toFixed(1) + 's', ...stats };
}
