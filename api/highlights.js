// MANDO SPORT — Arabic football highlights from verified official channels.
const FEEDS = [
  { channelId: "UCJUCcJUeh0Cz2xyKwkw5Q1w", league: "أبرز مباريات كرة القدم", channelName: "beIN SPORTS" },
  { channelId: "UCS_yHXNb5w5S74KQL_TK8Yw", league: "كرة القدم العربية", channelName: "قنوات الكاس" },
  { channelId: "UCqXAWrjSgLb0EPa_icPt-pw", league: "الدوري السعودي", channelName: "الدوري السعودي للمحترفين" }
];
function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function tag(xml, name) {
  const match = xml.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">"));
  return match ? decodeXml(match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()) : "";
}
async function fetchFeed(feed) {
  const url = "https://www.youtube.com/feeds/videos.xml?channel_id=" + encodeURIComponent(feed.channelId);
  const response = await fetch(url, {
    headers: { Accept: "application/atom+xml, application/xml, text/xml", "User-Agent": "Mozilla/5.0 MANDO-SPORT" }
  });
  if (!response.ok) throw new Error(feed.channelName + " feed HTTP " + response.status);
  const xml = await response.text();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries.map(entry => {
    const id = tag(entry, "yt:videoId");
    const channel = tag(entry, "name") || feed.channelName;
    const title = tag(entry, "title");
    const publishedAt = tag(entry, "published");
    if (!id || !title) return null;
    return {
      id, title,
      url: "https://www.youtube.com/watch?v=" + encodeURIComponent(id),
      image: "https://i.ytimg.com/vi/" + encodeURIComponent(id) + "/hqdefault.jpg",
      league: feed.league, channel, publishedAt
    };
  }).filter(Boolean);
}
module.exports = async function handler(req, res) {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  results.forEach((result, index) => console.info("[highlights-feed]", FEEDS[index].channelName, result.status === "fulfilled" ? { count: result.value.length } : { error: String(result.reason) }));
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
    provider: "YouTube — Arabic official football channels",
    updatedAt: new Date().toISOString(),
    highlights,
    partial: results.some(result => result.status === "rejected"),
    message: highlights.length ? null : "لا توجد مقاطع عربية متاحة حالياً من القنوات الرسمية."
  });
};
