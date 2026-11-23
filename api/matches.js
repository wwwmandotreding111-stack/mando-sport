// MANDO SPORT — multi-competition football scoreboard using ESPN's public soccer data.
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
const STATUS = (event) => {
  const type = event?.status?.type || {};
  const state = String(type.state || "").toLowerCase();
  const name = String(type.name || "").toUpperCase();
  if (state === "in" || name.includes("IN_PROGRESS")) return "IN_PLAY";
  if (name.includes("HALFTIME") || name.includes("PAUSE")) return "PAUSED";
  if (state === "post" || type.completed || name.includes("FINAL")) return "FINISHED";
  if (name.includes("POSTPONED")) return "POSTPONED";
  if (name.includes("CANCEL")) return "CANCELLED";
  return "SCHEDULED";
};
async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "MANDO-SPORT/2.0", "Accept": "application/json" } });
    if (!response.ok) throw new Error("ESPN HTTP " + response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}
module.exports = async function handler(req, res) {
  const date = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "صيغة التاريخ غير صحيحة." });
  const code = typeof req.query.competition === "string" ? req.query.competition.toUpperCase() : "";
  const selected = code && LEAGUES[code] ? [[code, LEAGUES[code]]] : Object.entries(LEAGUES);
  if (code && !LEAGUES[code]) return res.status(400).json({ error: "البطولة المطلوبة غير مدعومة." });
  const compactDate = date.replace(/-/g, "");
  const outcomes = await Promise.allSettled(selected.map(async ([key, league]) => {
    const url = "https://site.api.espn.com/apis/site/v2/sports/soccer/" + league.slug + "/scoreboard?dates=" + compactDate + "&limit=100";
    const data = await getJson(url);
    return (Array.isArray(data.events) ? data.events : []).map(event => {
      const comp = (event.competitions || [])[0] || {};
      const competitors = comp.competitors || [];
      const home = competitors.find(team => team.homeAway === "home") || competitors[0] || {};
      const away = competitors.find(team => team.homeAway === "away") || competitors[1] || {};
      const teamName = team => team.team?.shortDisplayName || team.team?.displayName || team.team?.name || "فريق";
      const scoreValue = team => team.score === undefined || team.score === null || team.score === "" ? null : Number(team.score);
      const logos = event.league?.logos || [];
      return {
        id: event.id,
        competitionCode: key,
        competition: event.league?.name || league.name,
        competitionEmblem: logos[0]?.href || "",
        home: teamName(home), away: teamName(away),
        homeTeamId: home.team?.id || "", awayTeamId: away.team?.id || "",
        homeCrest: home.team?.logo || home.team?.logos?.[0]?.href || "",
        awayCrest: away.team?.logo || away.team?.logos?.[0]?.href || "",
        utcDate: event.date || comp.date || null,
        status: STATUS(event),
        homeScore: scoreValue(home), awayScore: scoreValue(away),
        venue: comp.venue?.fullName || ""
      };
    });
  }));
  const matches = [];
  const errors = [];
  outcomes.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") matches.push(...outcome.value);
    else errors.push(String(outcome.reason?.message || outcome.reason));
  });
  matches.sort((a,b) => String(a.utcDate || "").localeCompare(String(b.utcDate || "")));
  res.setHeader("Cache-Control", req.query.push === "1" ? "no-store" : "s-maxage=60, stale-while-revalidate=120");
  if (!matches.length && errors.length === selected.length) {
    return res.status(502).json({ error: "تعذر الاتصال بمصدر المباريات حالياً.", details: errors[0] });
  }
  return res.status(200).json({ date, provider: "ESPN", updatedAt: new Date().toISOString(), matches, partial: errors.length > 0, unavailableCompetitions: errors.length });
};
