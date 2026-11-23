// MANDO SPORT — league standings from ESPN's public soccer data.
const LEAGUES = {
  PL: { slug: "eng.1", name: "الدوري الإنجليزي الممتاز" },
  PD: { slug: "esp.1", name: "الدوري الإسباني" },
  SA: { slug: "ita.1", name: "الدوري الإيطالي" },
  BL1: { slug: "ger.1", name: "الدوري الألماني" },
  FL1: { slug: "fra.1", name: "الدوري الفرنسي" },
  CL: { slug: "uefa.champions", name: "دوري أبطال أوروبا" },
  SPL: { slug: "ksa.1", name: "الدوري السعودي" },
  MLS: { slug: "usa.1", name: "الدوري الأمريكي" }
};
function findEntries(value, depth = 0) {
  if (!value || depth > 8) return null;
  if (Array.isArray(value)) {
    if (value.length && value.some(item => item && item.team && Array.isArray(item.stats))) return value;
    for (const item of value) { const found = findEntries(item, depth + 1); if (found) return found; }
  } else if (typeof value === "object") {
    if (Array.isArray(value.entries) && value.entries.some(item => item && item.team && Array.isArray(item.stats))) return value.entries;
    for (const item of Object.values(value)) { const found = findEntries(item, depth + 1); if (found) return found; }
  }
  return null;
}
function stat(entry, names) {
  const stats = entry.stats || [];
  const item = stats.find(s => names.includes(String(s.name || s.abbreviation || "").toLowerCase()));
  return item ? (item.value ?? item.displayValue ?? item.summary ?? null) : null;
}
module.exports = async function handler(req, res) {
  const code = typeof req.query.competition === "string" ? req.query.competition.toUpperCase() : "PL";
  const league = LEAGUES[code];
  if (!league) return res.status(400).json({ error: "البطولة المطلوبة غير مدعومة." });
  try {
    const response = await fetch("https://site.api.espn.com/apis/v2/sports/soccer/" + league.slug + "/standings", { headers: { "User-Agent": "MANDO-SPORT/2.0", "Accept": "application/json" } });
    if (!response.ok) throw new Error("ESPN HTTP " + response.status);
    const data = await response.json();
    const entries = findEntries(data) || [];
    const table = entries.map((entry, index) => {
      const team = entry.team || {};
      return {
        position: stat(entry, ["rank", "playoffseed", "position"]) ?? index + 1,
        team: team.shortDisplayName || team.displayName || team.name || "فريق",
        crest: team.logos?.[0]?.href || team.logo || "",
        played: stat(entry, ["gamesplayed", "played", "gp"]),
        won: stat(entry, ["wins", "won", "w"]),
        drawn: stat(entry, ["ties", "draws", "drawn", "d"]),
        lost: stat(entry, ["losses", "lost", "l"]),
        goalsFor: stat(entry, ["pointsfor", "goalsfor", "gf"]),
        goalsAgainst: stat(entry, ["pointsagainst", "goalsagainst", "ga"]),
        goalDifference: stat(entry, ["pointdifferential", "goaldifference", "gd"]),
        points: stat(entry, ["points", "pts"])
      };
    });
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    return res.status(200).json({ competition: league.name, season: data.season?.year || data.season?.displayName || "", provider: "ESPN", updatedAt: new Date().toISOString(), table });
  } catch (error) {
    return res.status(502).json({ error: "تعذر جلب ترتيب البطولة حالياً.", details: String(error.message || error).slice(0, 120) });
  }
};
