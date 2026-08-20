// 模拟验证动作分类算法:方向翻转状态机
// 场景:静止噪声 / 摇头 / 点头 / 挥手 / 举手
function directionChanges(values, deadband) {
  let dir = 0, changes = 0, last = values[0];
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - last;
    last = values[i];
    if (Math.abs(d) < deadband) continue;
    const ndir = d > 0 ? 1 : -1;
    if (dir !== 0 && ndir !== dir) changes++;
    dir = ndir;
  }
  return changes;
}

function classifyWindow(win) {
  const nx = win.map(s => s.nx), ny = win.map(s => s.ny);
  const xChanges = directionChanges(nx, 0.012);
  const yChanges = directionChanges(ny, 0.012);
  const xRange = Math.max(...nx) - Math.min(...nx);
  const yRange = Math.max(...ny) - Math.min(...ny);
  if (xChanges >= 2 && xRange > 0.03 && xRange > yRange * 1.3) return 'shake';
  if (yChanges >= 2 && yRange > 0.03 && yRange > xRange * 1.3) return 'nod';
  return null;
}

// 生成测试数据
function gen(fn, n = 8, noise = 0.004) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = fn(i);
    out.push({ nx: v.x + (Math.random() - 0.5) * noise, ny: v.y + (Math.random() - 0.5) * noise });
  }
  return out;
}

const tests = [
  ['静止(轻微噪声)', gen(() => ({ x: 0.5, y: 0.5 }), 8, 0.006), null],
  ['摇头(正弦横向)', gen(i => ({ x: 0.5 + 0.06 * Math.sin(i * 1.1), y: 0.5 })), 'shake'],
  ['点头(正弦纵向)', gen(i => ({ x: 0.5, y: 0.5 + 0.06 * Math.sin(i * 1.1) })), 'nod'],
  ['轻微晃动(噪声+慢漂移)', gen(i => ({ x: 0.5 + 0.012 * Math.sin(i * 0.5), y: 0.5 }), 8, 0.006), null],
  ['明显侧头一次(无翻转)', gen(i => ({ x: 0.5 + (i > 4 ? 0.05 : 0), y: 0.5 })), null],
  ['快速摇头两次', gen(i => ({ x: 0.5 + 0.07 * Math.sin(i * 2.2), y: 0.5 })), 'shake'],
  ['点头两次', gen(i => ({ x: 0.5, y: 0.5 + 0.07 * Math.sin(i * 2.2) })), 'nod'],
];

let pass = 0;
for (const [name, win, expect] of tests) {
  const got = classifyWindow(win);
  const ok = got === expect;
  if (ok) pass++;
  console.log((ok ? '✅' : '❌') + ' ' + name + ' → ' + (got || '无') + (expect ? ' (期望 ' + expect + ')' : ' (期望无动作)'));
}
console.log('\n通过 ' + pass + '/' + tests.length);
