// MANDO SPORT - Automatic football headlines via the open GDELT Project DOC API.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const queries = [
    { query: '(soccer OR football OR "Premier League" OR "Champions League" OR "كرة القدم" OR "الدوري" OR "مباراة" OR "دوري أبطال أوروبا")', timespan: '2d' },
    { query: '(soccer OR football OR "كرة القدم" OR "الدوري" OR "كأس")', timespan: '7d' }
  ];

  const footballTerms = /\b(soccer|football|premier league|champions league|europa league|conference league|la liga|serie a|bundesliga|ligue 1|fa cup|league cup|world cup|afcon|copa america|club world cup|fifa|uefa|transfer|striker|goalkeeper|midfielder|defender|manager|coach|fixture|matchday|kick.?off|hat.?trick|penalty|red card|yellow card|offside|goal|goals|draw|win|defeat|arsenal|chelsea|liverpool|manchester|barcelona|real madrid|bayern|juventus|milan|inter milan|psg|tottenham|newcastle|brighton|leeds|cristiano ronaldo|lionel messi|mohamed salah|mbappe|haaland)\b|كرة\s*القدم|الدوري|البطولة|البطولات|كأس|مباراة|مباريات|هدف|أهداف|هداف|تسجيل|انتقال|صفقة|مدرب|حارس|لاعب|لاعبين|حكم|تحكيم|ركلة جزاء|ركلات الترجيح|دوري أبطال|كأس العالم|فيفا|يويفا|برشلونة|ريال مدريد|ليفربول|مانشستر|أرسنال|تشيلسي|بايرن|يوفنتوس|الهلال|النصر|الأهلي|الزمالك|منتخب/iu;
  const americanFootballTerms = /\b(nfl|ncaa|cfp|college football|american football|touchdown|quarterback|super bowl)\b/i;

  function normalizeDate(value) {
    if (!value) return null;
    const raw = String(value);
    const gdelt = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
    const normalized = gdelt
      ? `${gdelt[1]}-${gdelt[2]}-${gdelt[3]}T${gdelt[4]}:${gdelt[5]}:${gdelt[6]}Z`
      : raw;
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }

  try {
    let payload = null;
    let lastError = '';
    for (const item of queries) {
      const params = new URLSearchParams({
        query: item.query, mode: 'ArtList', format: 'json',
        maxrecords: '100', timespan: item.timespan, sort: 'DateDesc'
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
        const title = String(item.title || '').trim();
        return supported && title && footballTerms.test(title) && !americanFootballTerms.test(title)
          && item.url && /^https?:\/\//i.test(item.url);
      })
      .map(item => ({
        title: String(item.title).slice(0, 240),
        url: item.url,
        image: /^https?:\/\//i.test(String(item.socialimage || '')) ? String(item.socialimage) : '',
        source: String(item.domain || new URL(item.url).hostname).slice(0, 100),
        language: String(item.language || ''),
        publishedAt: normalizeDate(item.seendate)
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
