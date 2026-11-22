const FEEDS = [
  { name: 'Premier League', id: 'UCG5qGWdu8nIRZqJ_GgDwQ-w' },
  { name: 'UEFA', id: 'UCyGa1YEx9ST66rYrJTGIKOw' },
  { name: 'Sky Sports Football', id: 'UCNAf1k0yIjyGu3k9BwAg3lg' }
];

function decodeXml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function tag(entry, name) {
  const match = entry.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>'));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, '')) : '';
}

function isMatchHighlight(title) {
  const value = title.toLowerCase();
  const exclude = /\b(fpl|fantasy|podcast|preview|predict|press conference|interview|quiz|on the spot|behind the scenes|training|transfer|reaction|watchalong|watch along)\b/i;
  const include = /\b(highlights?|all goals|every goal|goals?\s*\|?|matchday|best moments|top goals|goal of the|greatest goals|extended highlights|short highlights)\b/i;
  return include.test(value) && !exclude.test(value);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const results = await Promise.allSettled(FEEDS.map(async feed => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      try {
        const response = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + feed.id, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 MANDO-SPORT/1.0' }
        });
        if (!response.ok) throw new Error('YouTube feed unavailable');
        const xml = await response.text();
        return [...xml.matchAll(/<entry>([\\s\\S]*?)<\\/entry>/g)].map(match => {
          const entry = match[1];
          const id = tag(entry, 'yt:videoId');
          const title = tag(entry, 'title');
          const publishedAt = tag(entry, 'published');
          const author = tag(entry, 'name') || feed.name;
          if (!id || !title || !isMatchHighlight(title)) return null;
          return {
            id,
            title,
            source: author || feed.name,
            publishedAt,
            url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(id),
            embedUrl: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id)
          };
        }).filter(Boolean);
      } finally {
        clearTimeout(timeout);
      }
    }));

    const videos = [];
    const seen = new Set();
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const video of result.value) {
        if (seen.has(video.id)) continue;
        seen.add(video.id);
        videos.push(video);
      }
    }
    videos.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    res.status(200).json({
      videos: videos.slice(0, 12),
      updatedAt: new Date().toISOString(),
      sources: FEEDS.map(feed => feed.name)
    });
  } catch (error) {
    res.status(200).json({ videos: [], updatedAt: new Date().toISOString(), error: 'تعذر جلب اللقطات حالياً.' });
  }
}
