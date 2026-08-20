// 查看米游社搜索结果的完整字段,找图片所在位置
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };

(async () => {
  const u = 'https://bbs-api.miyoushe.com/post/wapi/searchPosts?gids=2&keyword=' + encodeURIComponent('须弥 地理志') + '&page_size=5&page_num=1';
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  const posts = j.data?.posts || [];
  for (const p of posts.slice(0, 3)) {
    console.log('=== keys of post wrapper:', Object.keys(p).join(','));
    const post = p.post || {};
    console.log('=== keys of post:', Object.keys(post).join(','));
    console.log('post_id:', post.post_id, '| subject:', post.subject);
    console.log('images field:', JSON.stringify(post.images)?.slice(0, 300));
    console.log('cover field:', JSON.stringify(post.cover)?.slice(0, 200));
    console.log('content first 400:', (post.content || '').slice(0, 400).replace(/\s+/g, ' '));
    console.log();
  }
})();
