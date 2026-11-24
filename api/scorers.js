// MANDO SPORT — top goal scorers from ESPN league leaders.
const LEAGUES = {
  PL: { slug: "eng.1", name: "الدوري الإنجليزي الممتاز" },
  PD: { slug: "esp.1", name: "الدوري الإسباني" },
  SA: { slug: "ita.1", name: "الدوري الإيطالي" },
  BL1: { slug: "ger.1", name: "الدوري الألماني" },
  FL1: { slug: "fra.1", name: "الدوري الفرنسي" },
  SPL: { slug: "ksa.1", name: "الدوري السعودي" },
  MLS: { slug: "usa.1", name: "الدوري الأمريكي" }
};
function collectGroups(value, output = [], depth = 0) {
  if (!value || depth > 9) return output;
  if (Array.isArray(value)) { value.forEach(item => collectGroups(item, output, depth + 1)); return output; }
  if (typeof value !== "object") return output;
  if (Array.isArray(value.leaders)) {
    const label = String(value.displayName || value.name || value.abbreviation || "");
    if (/goal|score|هداف|أهداف/i.test(label)) {
      value.leaders.forEach(row => {
        const athlete = row.athlete || row.player || {};
        const team = row.team || athlete.team || {};
        const amount = row.value ?? row.displayValue ?? row.statistics?.[0]?.displayValue ?? "";
        if (athlete.id && (athlete.displayName || athlete.fullName) && amount !== "") {
          output.push({ id:String(athlete.id), name:athlete.displayName || athlete.fullName, team:team.displayName || team.shortDisplayName || "", teamId:String(team.id || ""), image:athlete.headshot?.href || athlete.headshot || "", goals:amount, competition:"" });
        }
      });
    }
  }
  Object.entries(value).forEach(([key, child]) => {
    if (key !== "leaders") collectGroups(child, output, depth + 1);
  });
  return output;
}
module.exports = async function handler(req, res) {
  const code = typeof req.query.competition === "string" ? req.query.competition.toUpperCase() : "";
  const selected = code ? (LEAGUES[code] ? [[code, LEAGUES[code]]] : null) : Object.entries(LEAGUES);
  if (!selected) return res.status(400).json({ error:"البطولة المطلوبة غير مدعومة." });
  const results = await Promise.allSettled(selected.map(async ([key, league]) => {
    const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/" + league.slug + "/leaders?limit=100", { headers:{ "User-Agent":"MANDO-SPORT/2.0", "Accept":"application/json" } });
    if (!response.ok) throw new Error("ESPN HTTP " + response.status);
    const data = await response.json();
    const rows = collectGroups(data).map(item => ({ ...item, competition:league.name, competitionCode:key, league:league.slug }));
    return rows;
  }));
  const scorers = [], errors = [];
  results.forEach((result,index) => {
    if (result.status === "fulfilled") scorers.push(...result.value);
    else errors.push(String(result.reason?.message || result.reason));
  });
  const seen = new Set();
  const unique = scorers.filter(item => {
    const key = item.competitionCode + ":" + item.id;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a,b) => Number(b.goals) - Number(a.goals)).slice(0,100);
  res.setHeader("Cache-Control","s-maxage=1800, stale-while-revalidate=3600");
  if (!unique.length && errors.length === selected.length) return res.status(502).json({ error:"تعذر جلب ترتيب الهدافين من مصدر البيانات حالياً." });
  return res.status(200).json({ provider:"ESPN", updatedAt:new Date().toISOString(), competition:code || "all", scorers:unique, partial:errors.length>0, unavailableCompetitions:errors.length });
};
