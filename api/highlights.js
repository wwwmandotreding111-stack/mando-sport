// MANDO SPORT — verified football highlights from official YouTube channels.
const FEEDS = [
  { query: "Premier League official highlights", league: "الدوري الإنجليزي" },
  { query: "UEFA Champions League official highlights", league: "دوري أبطال أوروبا" },
  { query: "LALIGA official highlights", league: "الدوري الإسباني" },
  { query: "FIFA official football highlights", league: "كرة القدم العالمية" },
  { query: "Saudi Pro League official highlights", league: "الدوري السعودي" }
];
const OFFICIAL_CHANNEL = /(premier league|uefa|laliga|la liga|fifa|saudi pro league|roshn)/i;
function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&#(\\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function tag(xml, name) {
  const match = xml.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">"));
  return match ? decodeXml(match[1].replace(/<!\\[CDATA\\[|\\]\\]>/g, "").trim()) : "";
}
async function fetchFeed(feed) {
  const url = "https://www.youtube.com/feeds/videos.xml?search_query=" + encodeURIComponent(feed.query);
  const response = await fetch(url, { headers: { "Accept": "application/atom+xml, application/xml, text/xml", "User-Agent": "Mozilla/5.0 MANDO-SPORT" } });
  if (!response.ok) throw new Error("YouTube feed HTTP " + response.status);
  const xml = await response.text();
  return [...xml.matchAll(/<entry>([\\s\\S]*?)<\\/entry>/g)].map(match => {
    const entry = match[1];
    const id = tag(entry, "yt:videoId");
    const channel = tag(entry, "name");
    const title = tag(entry, "title");
    const publishedAt = tag(entry, "published");
    if (!id || !title || !OFFICIAL_CHANNEL.test(channel)) return null;
    return {
      id, title, url: "https://www.youtube.com/watch?v=" + encodeURIComponent(id),
      image: "https://i.ytimg.com/vi/" + encodeURIComponent(id) + "/hqdefault.jpg",
      league: feed.league, channel, publishedAt
    };
  }).filter(Boolean);
}
module.exports = async function handler(req, res) {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const unique = new Map();
  results.forEach(result => {
    if (result.status !== "fulfilled") return;
    result.value.forEach(video => {
      if (!unique.has(video.id)) unique.set(video.id, video);
    });
  });
  const highlights = [...unique.values()]
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, 24);
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
  return res.status(200).json({
    provider: "YouTube — official football channels",
    updatedAt: new Date().toISOString(),
    highlights,
    partial: results.some(result => result.status === "rejected"),
    message: highlights.length ? null : "لم تُرجع القنوات الرسمية مقاطع متاحة حالياً."
  });
};
