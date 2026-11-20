// MANDO SPORT - Automatic football headlines via the open GDELT Project DOC API.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const queries = [
    { query: '(football OR soccer OR "Premier League" OR "Champions League" OR "كرة القدم" OR "الدوري" OR "مباراة" OR "دوري أبطال أوروبا")', timespan: '2d' },
    { query: '(football OR soccer OR "كرة القدم" OR "الدوري")', timespan: '7d' }
  ];

  try {
    let payload = null;
    let lastError = '';
    for (const item of queries) {
      const params = new URLSearchParams({
        query: item.query, mode: 'ArtList', format: 'json',
        maxrecords: '75', timespan: item.timespan, sort: 'DateDesc'
      });
      const response = await fetch('https://api.gdeltproject.org/api/v2/doc/doc?' + params.toString(), {
        headers: { 'User-Agent': 'MANDO-SPORT/1.0' }
      });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || !type.includes('json')) {
        lastError = 'News provider returned HTTP ' + response.status;
        continue;
      }
      const candidate = await response.json();
      if (Array.isArray(candidate.articles) && candidate.articles.length) {
        payload = candidate;
        break;
      }
      payload = candidate;
    }

    if (!payload) throw new Error(lastError || 'No valid response from news provider');
    const seen = new Set();
    const articles = (Array.isArray(payload.articles) ? payload.articles : [])
      .filter(item => {
        const lang = String(item.language || '').toLowerCase();
        const supported = lang.includes('arab') || lang === 'ara' || lang.includes('english') || lang === 'eng';
        return supported && item.title && item.url && /^https?:\\/\\//i.test(item.url);
      })
      .map(item => ({
        title: String(item.title).slice(0, 240),
        url: item.url,
        image: /^https?:\\/\\//i.test(String(item.socialimage || '')) ? String(item.socialimage) : '',
        source: String(item.domain || new URL(item.url).hostname).slice(0, 100),
        language: String(item.language || ''),
        publishedAt: item.seendate || null
      }))
      .filter(item => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      })
      .slice(0, 24);

    return res.status(200).json({
      provider: 'GDELT Project',
      attribution: 'بيانات العناوين من مشروع GDELT',
      attributionUrl: 'https://www.gdeltproject.org/',
      updatedAt: new Date().toISOString(),
      articles
    });
  } catch (error) {
    return res.status(502).json({
      error: 'تعذر جلب الأخبار حالياً. ستظهر الأخبار مجدداً عند عودة المصدر.',
      details: String(error.message || error).slice(0, 180)
    });
  }
};
