// MANDO SPORT — recent football video highlights from ESPN.
const LEAGUES = [
  { slug: "eng.1", name: "الدوري الإنجليزي" },
  { slug: "esp.1", name: "الدوري الإسباني" },
  { slug: "ita.1", name: "الدوري الإيطالي" },
  { slug: "ger.1", name: "الدوري الألماني" },
  { slug: "fra.1", name: "الدوري الفرنسي" },
  { slug: "uefa.champions", name: "دوري أبطال أوروبا" },
  { slug: "ksa.1", name: "الدوري السعودي" }
];
function href(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.href === "string") return value.href;
  return "";
}
function imageUrl(video) {
  const first = Array.isArray(video.images) ? video.images[0] : null;
  return href(video.thumbnail) || href(video.image) || href(first) ||
    href(video.links?.thumbnail) || href(video.links?.image) || "";
}
async function leagueVideos(league) {
  const endpoint = "https://site.api.espn.com/apis/site/v2/sports/soccer/" + league.slug + "/videos?region=us&lang=en&contentorigin=espn&limit=20";
  const response = await fetch(endpoint, { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 MANDO-SPORT" } });
  if (!response.ok) throw new Error("ESPN videos HTTP " + response.status);
  const data = await response.json();
  const entries = Array.isArray(data.videos) ? data.videos :
    Array.isArray(data.items) ? data.items :
    Array.isArray(data.results) ? data.results : [];
  return entries.map(video => {
    const id = video.id || video.guid || "";
    const links = video.links || {};
    const link = href(links.web) || href(links.source) || href(links.mobile) ||
      href(video.link) || (id ? "https://www.espn.com/video/clip/_/id/" + encodeURIComponent(id) : "");
    return {
      id: id || link,
      title: video.headline || video.title || video.name || "",
      description: video.description || "",
      url: link,
      image: imageUrl(video),
      league: league.name,
      publishedAt: video.published || video.date || video.lastModified || null
    };
  }).filter(video => video.title && /^https?:\\/\\//i.test(video.url));
}
module.exports = async function handler(req, res) {
  const results = await Promise.allSettled(LEAGUES.map(league => leagueVideos(league)));
  const unique = new Map();
  results.forEach(result => {
    if (result.status !== "fulfilled") return;
    result.value.forEach(video => {
      if (!unique.has(video.url)) unique.set(video.url, video);
    });
  });
  const highlights = [...unique.values()].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
  if (!highlights.length) return res.status(200).json({ provider: "ESPN", updatedAt: new Date().toISOString(), highlights: [], partial: true, message: "لم يُرجع مصدر الفيديوهات مقاطع قابلة للعرض حالياً." });
  return res.status(200).json({ provider: "ESPN", updatedAt: new Date().toISOString(), highlights: highlights.slice(0, 24), partial: results.some(result => result.status === "rejected") });
};
