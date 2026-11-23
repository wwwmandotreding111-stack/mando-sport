// MANDO SPORT — curated football headlines from ESPN league news feeds.
const LEAGUES = [
  { slug: "eng.1", category: "الدوري الإنجليزي" },
  { slug: "esp.1", category: "الدوري الإسباني" },
  { slug: "ita.1", category: "الدوري الإيطالي" },
  { slug: "ger.1", category: "الدوري الألماني" },
  { slug: "fra.1", category: "الدوري الفرنسي" },
  { slug: "uefa.champions", category: "دوري أبطال أوروبا" },
  { slug: "ksa.1", category: "الدوري السعودي" }
];
async function fetchNews(league) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const url = "https://site.api.espn.com/apis/site/v2/sports/soccer/" + league.slug + "/news?limit=18";
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "MANDO-SPORT/2.0", "Accept": "application/json" } });
    if (!response.ok) throw new Error("ESPN HTTP " + response.status);
    const data = await response.json();
    return (data.articles || []).map(item => {
      const image = (item.images || []).find(img => img.url || img.href);
      const href = item.links?.web?.href || item.links?.api?.news?.href || "";
      return {
        id: item.id || href || item.headline,
        title: item.headline || item.title || "",
        excerpt: item.description || item.summary || "",
        url: href,
        image: image?.url || image?.href || "",
        source: "ESPN",
        category: league.category,
        publishedAt: item.published || item.lastModified || null
      };
    }).filter(item => item.title && /^https?:\/\//i.test(item.url));
  } finally { clearTimeout(timer); }
}
module.exports = async function handler(req, res) {
  const results = await Promise.allSettled(LEAGUES.map(fetchNews));
  const seen = new Set();
  const articles = [];
  results.forEach(result => {
    if (result.status !== "fulfilled") return;
    result.value.forEach(item => {
      const key = item.url || item.title;
      if (!seen.has(key)) { seen.add(key); articles.push(item); }
    });
  });
  articles.sort((a,b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
  if (!articles.length && results.every(result => result.status === "rejected")) {
    return res.status(502).json({ error: "تعذر جلب الأخبار الرياضية حالياً." });
  }
  return res.status(200).json({ provider: "ESPN", updatedAt: new Date().toISOString(), articles: articles.slice(0, 40), partial: results.some(result => result.status === "rejected") });
};
