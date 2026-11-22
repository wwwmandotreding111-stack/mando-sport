const FEEDS = [
  // Official Arabic-language beIN SPORTS MENA channel.
  { name: 'beIN SPORTS', id: 'UCJUCcJUeh0Cz2xyKwkw5Q1w' }
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

function readTag(entry, name) {
  const start = '<' + name + '>';
  const end = '</' + name + '>';
  const from = entry.indexOf(start);
  if (from < 0) return '';
  const to = entry.indexOf(end, from + start.length);
  if (to < 0) return '';
  return decodeXml(entry.slice(from + start.length, to).replace(/<[^>]*>/g, ''));
}

function extractJsonObject(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = source.indexOf('{', markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try { return JSON.parse(source.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

async function checkCountryAvailability(videoId, country) {
  if (!country) return 'unknown';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const url = new URL('https://www.youtube.com/watch');
    url.searchParams.set('v', videoId);
    url.searchParams.set('gl', country);
    url.searchParams.set('hl', 'en');
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' }
    });
    if (!response.ok) return 'unknown';
    const html = await response.text();
    const player = extractJsonObject(html, '"playabilityStatus":');
    if (!player || !player.status) return 'unknown';
    if (player.status === 'OK') return 'available';
    const lowerHtml = html.toLowerCase();
    const regionalBlock = [
      'not available in your country',
      'not available in your region',
      'uploader has not made this video available in your country',
      'this video is not available in your country'
    ].some(phrase => lowerHtml.includes(phrase));
    return player.status === 'UNPLAYABLE' && regionalBlock ? 'blocked' : 'unknown';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timeout);
  }
}

async function translateToArabic(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  // Avoid sending text that is already Arabic through machine translation.
  if (/[\\u0600-\\u06FF]/.test(value)) return value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', 'auto');
    url.searchParams.set('tl', 'ar');
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', value);
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) throw new Error('Translation unavailable');
    const data = await response.json();
    const translated = Array.isArray(data?.[0]) ? data[0].map(part => part?.[0] || '').join('').trim() : '';
    return translated || 'أهداف وملخصات كرة القدم';
  } catch {
    return 'أهداف وملخصات كرة القدم';
  } finally {
    clearTimeout(timeout);
  }
}

function arabicSource(source) {
  const value = String(source || '').toLowerCase();
  if (value.includes('bein')) return 'بي إن سبورتس';
  return 'قناة رياضية رسمية';
}

function isMatchHighlight(title) {
  const value = title.toLowerCase();
  const excluded = ['fpl', 'fantasy', 'podcast', 'preview', 'predict', 'press conference', 'interview', 'quiz', 'on the spot', 'behind the scenes', 'training', 'transfer', 'reaction', 'watchalong', 'watch along'];
  if (excluded.some(word => value.includes(word))) return false;
  const included = ['highlights', 'highlight', 'all goals', 'every goal', 'goals |', 'matchday', 'best moments', 'top goals', 'goal of the', 'extended highlights', 'short highlights', 'ملخص', 'أهداف', 'اهداف', 'لقطات', 'أبرز اللحظات'];
  return included.some(word => value.includes(word));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const results = await Promise.allSettled(FEEDS.map(async feed => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5500);
    try {
      const response = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + feed.id, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 MANDO-SPORT/1.0' }
      });
      if (!response.ok) throw new Error('YouTube feed unavailable');
      const xml = await response.text();
      return xml.split('<entry>').slice(1).map(part => {
        const entry = part.split('</entry>')[0];
        const id = readTag(entry, 'yt:videoId');
        const title = readTag(entry, 'title');
        const publishedAt = readTag(entry, 'published');
        const author = readTag(entry, 'name') || feed.name;
        if (!id || !title || !isMatchHighlight(title)) return null;
        return {
          id,
          title,
          source: author,
          publishedAt,
          url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(id),
          embedUrl: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id)
        };
      }).filter(Boolean);
    } finally {
      clearTimeout(timeout);
    }
  }));

  const countryHeader = req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '';
  const country = /^[A-Za-z]{2}$/.test(countryHeader) ? countryHeader.toUpperCase() : '';

  const videos = [];
  const feedDiagnostics = results.map((result, index) => ({ source: FEEDS[index].name, ok: result.status === 'fulfilled', entries: result.status === 'fulfilled' ? result.value.length : 0 }));
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

  // Check newest candidates against the visitor's country before displaying them.
  // Unknown checks are retained because YouTube may throttle server-side page requests.
  const candidates = videos.slice(0, 8);
  const checked = await Promise.all(candidates.map(async video => {
    const [title, source] = await Promise.all([
      translateToArabic(video.title),
      Promise.resolve(arabicSource(video.source))
    ]);
    return {
      ...video,
      title,
      source,
      availability: await checkCountryAvailability(video.id, country)
    };
  }));
  const visibleVideos = checked.filter(video => video.availability !== 'blocked');
  // Never leave the highlights section empty solely because the regional check
  // could not confidently classify the videos.
  const safeFallbackVideos = visibleVideos.length ? visibleVideos : candidates;

  res.status(200).json({
    videos: safeFallbackVideos.slice(0, 12),
    availabilityFallback: visibleVideos.length === 0 && candidates.length > 0,
    country: country || null,
    availabilityCheck: country ? 'country-aware-best-effort' : 'not-available',
    feedDiagnostics,
    updatedAt: new Date().toISOString(),
    sources: FEEDS.map(feed => feed.name)
  });
}
