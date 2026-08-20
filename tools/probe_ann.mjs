// 官方公告 API:拿须弥时期的官方图(上传自 upload-static.hoyoverse.com)
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };

(async () => {
  const urls = [
    'https://api-os-takumi.hoyoverse.com/common/hk4e_global/announcement/api/getAnnList?game=hk4e&game_biz=hk4e_global&lang=zh-cn&bundle_id=hk4e_global&platform=pc&region=os_asia&level=60&uid=100000000',
    'https://api-takumi.mihoyo.com/common/hk4e_cn/announcement/api/getAnnList?game=hk4e&game_biz=hk4e_cn&lang=zh-cn&bundle_id=hk4e_cn&platform=pc&region=cn_gf01&level=60&uid=100000000',
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
      const t = await r.text();
      console.log('==', r.status, 'len', t.length);
      try {
        const j = JSON.parse(t);
        const lists = j?.data?.list || [];
        console.log('   lists:', lists.length);
        const rows = [];
        for (const l of lists) for (const it of (l.list || [])) rows.push(it);
        console.log('   items:', rows.length);
        for (const it of rows.slice(0, 25)) {
          console.log('   -', (it.title || '').slice(0, 40), '|', (it.banner || it.img || it.image || '').slice(0, 110));
        }
      } catch (e) { console.log('   JSON fail:', e.message, t.slice(0, 200)); }
    } catch (e) { console.log('ERR', u, e.message); }
  }
})();
