// 米游社帖子详情:尝试多种头组合拿全文图片
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const uniq = a => [...new Set(a)];

const HEADERS_SET = [
  { 'User-Agent': UA, 'Referer': 'https://www.miyoushe.com/', 'x-rpc-client_type': '2' },
  { 'User-Agent': UA, 'Referer': 'https://www.miyoushe.com/', 'x-rpc-client_type': '2', 'x-rpc-app_version': '2.62.1', 'Cookie': 'mi18nLang=zh-cn' },
  { 'User-Agent': UA, 'Referer': 'https://www.miyoushe.com/', 'x-rpc-client_type': '5' },
  { 'User-Agent': UA, 'Referer': 'https://www.miyoushe.com/ys/article/', 'x-rpc-client_type': '2', 'Origin': 'https://www.miyoushe.com' },
];

async function getPost(postId, hdrs) {
  const u = `https://bbs-api.miyoushe.com/post/wapi/getPostFull?post_id=${postId}`;
  const r = await fetch(u, { headers: hdrs, signal: AbortSignal.timeout(15000) });
  const t = await r.text();
  if (r.status !== 200) return { status: r.status, body: t.slice(0, 60) };
  try {
    const j = JSON.parse(t);
    if (j.retcode !== 0) return { status: r.status, retcode: j.retcode, message: j.message };
    const content = j.data?.post?.content || '';
    const imgs = uniq([...content.matchAll(/https?:\/\/[^"'\\\s\])]+\.(?:jpg|jpeg|png|webp)/gi)].map(m => m[0]))
      .filter(x => !/\.(css|js|svg)/i.test(x));
    return { status: r.status, retcode: 0, imgs, subject: (j.data?.post?.subject || '').slice(0, 40) };
  } catch (e) {
    return { status: r.status, parseError: e.message, body: t.slice(0, 80) };
  }
}

(async () => {
  const ids = ['74598410', '74598434', '61417529', '61452165', '77268932', '76873211'];
  for (const id of ids) {
    for (let hi = 0; hi < HEADERS_SET.length; hi++) {
      const res = await getPost(id, HEADERS_SET[hi]);
      if (res.retcode === 0 && res.imgs?.length) {
        console.log(`== [${id}] ${res.subject} | hdrs#${hi} -> ${res.imgs.length} imgs`);
        res.imgs.slice(0, 12).forEach(x => console.log('   ', x.slice(0, 140)));
        break;
      } else {
        console.log(`  [${id}] hdrs#${hi} -> ${JSON.stringify(res).slice(0, 120)}`);
      }
    }
  }
})();
