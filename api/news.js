// MANDO SPORT - Automatic football headlines via the open GDELT Project DOC API.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const query = '(football OR soccer OR "Premier League" OR "Champions League" OR "كرة القدم" OR "الدوري" OR "مباراة" OR "دوري أبطال أوروبا")';
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: '75',
    timespan: '2d',
    sort: 'DateDesc'
  });

  try {
    const response = await fetch('https://api.gdeltproject.org/api/v2/doc/doc?' + params.toString(), {
      headers: { 'User-Agent': 'MandoSport/1.0 (sports headlines; https://mando-sport.vercel.app)' }
    });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !type.includes('json')) {
      const detail = (await response.text()).slice(0, 180);
      throw new Error('News provider returned an unavailable response: ' + detail);
    }

    const payload = await response.json();
    const seen = new Set();
    const articles = (Array.isArray(payload.articles) ? payload.articles : [])
      .filter(item => {
        const lang = String(item.language || '').toLowerCase();
        const isSupportedLanguage = lang.includes('arab') || lang === 'ara' || lang.includes('english') || lang === 'eng';
        return isSupportedLanguage && item.title && item.url && /^https?:\/\//i.test(item.url);
      })
      .map(item => {
        const url = item.url;
        return {
          title: String(item.title).slice(0, 240),
          url,
          image: /^https?:\\/\\//i.test(String(item.socialimage || '')) ? String(item.socialimage) : '',
          source: String(item.domain || new URL(url).hostname).slice(0, 100),
          language: String(item.language || ''),
          publishedAt: item.seendate || null
        };
      })
      .filter(item => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      })
      .slice(0, 24);

    res.status(200).json({
      provider: 'GDELT Project',
      attribution: 'بيانات العناوين من مشروع GDELT',
      attributionUrl: 'https://www.gdeltproject.org/',
      updatedAt: new Date().toISOString(),
      articles
    });
  } catch (error) {
    res.status(502).json({
      error: 'تعذر جلب الأخبار حالياً. ستظهر الأخبار مجدداً عند عودة المصدر.',
      details: String(error.message || error).slice(0, 180)
    });
  }
};
