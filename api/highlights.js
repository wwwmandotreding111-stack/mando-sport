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
async function leagueVideos(league) {
  const endpoint = "https://site.api.espn.com/apis/site/v2/sports/soccer/" + league.slug + "/videos?region=us&lang=en&contentorigin=espn&limit=10";
  const response = await fetch(endpoint, { headers: { "Accept": "application/json", "User-Agent": "MANDO-SPORT/2.0" } });
  if (!response.ok) throw new Error("ESPN videos HTTP " + response.status);
  const data = await response.json();
  return (data.videos || []).map(video => {
    const link = video.links?.web?.href || video.links?.source?.href || video.links?.mobile?.href || "";
    const image = video.thumbnail || video.images?.[0]?.url || video.links?.thumbnail?.href || "";
    return {
      id: video.id || link,
      title: video.headline || video.title || "",
      description: video.description || "",
      url: link,
      image,
      league: league.name,
      publishedAt: video.published || video.lastModified || null
    };
  }).filter(video => video.title && /^https?:\/\//i.test(video.url));
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
  if (!highlights.length) return res.status(502).json({ error: "لا تتوفر لقطات فيديو حالياً." });
  return res.status(200).json({ provider: "ESPN", updatedAt: new Date().toISOString(), highlights: highlights.slice(0, 24), partial: results.some(result => result.status === "rejected") });
};
