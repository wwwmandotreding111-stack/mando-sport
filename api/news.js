// MANDO SPORT — Arabic football headlines plus international football news.
const GOOGLE_FEEDS = [
  { query: '("الدوري الإنجليزي" OR "مانشستر سيتي" OR "ليفربول") (site:kooora.com OR site:filgoal.com OR site:yallakora.com OR site:winwin.com OR site:beinsports.com)', category: "أخبار عربية" },
  { query: '("دوري أبطال أوروبا" OR "ريال مدريد" OR "برشلونة" OR "انتقالات") (site:kooora.com OR site:filgoal.com OR site:yallakora.com OR site:winwin.com OR site:beinsports.com)', category: "أخبار عربية" },
  { query: '("الدوري السعودي" OR "الهلال" OR "النصر" OR "كريستيانو رونالدو") (site:kooora.com OR site:filgoal.com OR site:yallakora.com OR site:winwin.com OR site:beinsports.com)', category: "أخبار عربية" }
];
const ESPN_LEAGUES = [
  { slug: "eng.1", category: "الدوري الإنجليزي" },
  { slug: "esp.1", category: "الدوري الإسباني" },
  { slug: "ita.1", category: "الدوري الإيطالي" },
  { slug: "ger.1", category: "الدوري الألماني" },
  { slug: "fra.1", category: "الدوري الفرنسي" },
  { slug: "uefa.champions", category: "دوري أبطال أوروبا" },
  { slug: "ksa.1", category: "الدوري السعودي" }
];
function decode(value) {
  return String(value || "").replace(/<!\[CDATA\[|\]\]>/g,"").replace(/&nbsp;/g," ").replace(/&#160;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}
function safeIsoDate(value) { const time = Date.parse(value || ""); return Number.isFinite(time) ? new Date(time).toISOString() : null; }
function tag(xml, name) {
  const match = xml.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
  return match ? decode(match[1]) : "";
}
async function googleFeed(feed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const q = encodeURIComponent(feed.query);
  const url = "https://news.google.com/rss/search?q=" + q + "&hl=ar&gl=SY&ceid=SY:ar";
  let response;
  try { response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 MANDO-SPORT/2.0", "Accept": "application/rss+xml, application/xml, text/xml" } }); }
  finally { clearTimeout(timer); }
  if (!response.ok) throw new Error("Google News HTTP " + response.status);
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => {
    const item = match[1], source = item.match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);
    const media = item.match(/<(?:media:content|enclosure)[^>]*url=["']([^"']+)["']/i);
    return {
      id: tag(item,"guid") || tag(item,"link"),
      title: tag(item,"title"),
      excerpt: tag(item,"description").slice(0,260),
      url: tag(item,"link"),
      image: media ? media[1] : "",
      source: source ? decode(source[1]) : "Google News",
      category: feed.category,
      language: "ar",
      publishedAt: safeIsoDate(tag(item,"pubDate"))
    };
  }).filter(item => item.title && /[\u0600-\u06FF]/.test(item.title) && /^https?:\/\//i.test(item.url));
}
async function espnFeed(league) {
  const url = "https://site.api.espn.com/apis/site/v2/sports/soccer/" + league.slug + "/news?limit=12";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let response;
  try { response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "MANDO-SPORT/2.0", "Accept": "application/json" } }); }
  finally { clearTimeout(timer); }
  if (!response.ok) throw new Error("ESPN HTTP " + response.status);
  const data = await response.json();
  return (data.articles || []).map(item => {
    const image = (item.images || []).find(img => img.url || img.href);
    const href = item.links?.web?.href || item.links?.api?.news?.href || "";
    return { id:item.id||href, title:item.headline||item.title||"", excerpt:item.description||item.summary||"", url:href, image:image?.url||image?.href||"", source:"ESPN", category:league.category, language:"en", publishedAt:safeIsoDate(item.published||item.lastModified) };
  }).filter(item => item.title && /^https?:\/\//i.test(item.url));
}
module.exports = async function handler(req, res) {
  const tasks = [
    ...GOOGLE_FEEDS.map(feed => googleFeed(feed)),
    ...ESPN_LEAGUES.map(league => espnFeed(league))
  ];
  const results = await Promise.allSettled(tasks);
  const seen = new Set(), articles = [];
  results.forEach((result, index) => {
    const sourceName = index < GOOGLE_FEEDS.length ? "Google News " + (index + 1) : "ESPN " + ESPN_LEAGUES[index - GOOGLE_FEEDS.length].slug;
    if (result.status !== "fulfilled") { console.warn("[news-feed]", sourceName, String(result.reason?.message || result.reason)); return; }
    console.info("[news-feed]", sourceName, "articles:", result.value.length);
    result.value.forEach(item => {
      const key = item.url || item.title;
      if (!seen.has(key)) { seen.add(key); articles.push(item); }
    });
  });
  articles.sort((a,b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
  const arabicArticles = articles.filter(item => item.language === "ar" && /[\u0600-\u06FF]/.test(item.title));
  if (!arabicArticles.length) { console.error("[news-feed] no Arabic headlines returned by approved Arabic search queries"); return res.status(502).json({ error:"لا تتوفر أخبار عربية موثوقة حالياً. حاول لاحقاً." }); }
  return res.status(200).json({ provider:"مصادر أخبار عربية عبر Google News", updatedAt:new Date().toISOString(), articles:arabicArticles.slice(0,50), partial:results.some(result=>result.status==="rejected") });
};
