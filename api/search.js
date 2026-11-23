// MANDO SPORT — football team and player search powered by ESPN.
module.exports = async function handler(req, res) {
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  if (query.length < 2) return res.status(400).json({ error: "اكتب حرفين على الأقل للبحث." });
  try {
    const url = "https://site.web.api.espn.com/apis/search/v2?query=" + encodeURIComponent(query) + "&limit=30&sport=soccer";
    const response = await fetch(url, { headers: { "User-Agent": "MANDO-SPORT/2.0", "Accept": "application/json" } });
    if (!response.ok) throw new Error("ESPN HTTP " + response.status);
    const data = await response.json();
    const candidates = [];
    const visit = (node, depth = 0) => {
      if (!node || depth > 7) return;
      if (Array.isArray(node)) { node.forEach(item => visit(item, depth + 1)); return; }
      if (typeof node !== "object") return;
      const title = node.displayName || node.fullName || node.name || node.headline;
      const linkList = Array.isArray(node.links) ? node.links : [];
      const href = node.links?.web?.href || node.links?.mobile?.href || linkList.find(link => (link.rel || []).includes("web"))?.href || linkList.find(link => (link.rel || []).includes("mobile"))?.href || node.href || node.link;
      if (title && href && /^https?:\/\//i.test(href)) {
        const kind = String(node.type?.type || node.type || node.contentType || "").toLowerCase();
        const isPlayer = kind.includes("athlete") || kind.includes("player");
        const isTeam = kind.includes("team");
        candidates.push({
          id: node.id || node.uid || href,
          title: String(title).slice(0, 160),
          description: String(node.description || node.subtitle || node.shortName || "").slice(0, 220),
          type: isPlayer ? "لاعب" : isTeam ? "فريق" : "نتيجة",
          image: node.image?.href || node.image || node.headshot?.href || node.images?.[0]?.url || node.logos?.[0]?.href || "",
          url: href
        });
      }
      Object.entries(node).forEach(([key, value]) => {
        if (key !== "links" && key !== "image" && key !== "headshot" && key !== "logos") visit(value, depth + 1);
      });
    };
    visit(data.results || data);
    const seen = new Set();
    const items = candidates.filter(item => {
      const key = item.url;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 24);
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ provider: "ESPN", query, items });
  } catch (error) {
    return res.status(502).json({ error: "تعذر تنفيذ البحث الرياضي حالياً." });
  }
};
