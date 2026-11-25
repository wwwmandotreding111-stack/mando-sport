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
  if (name.includes("HALFTIME") || name.includes("PAUSE")) return "PAUSED";
  if (state === "in" || name.includes("IN_PROGRESS")) return "IN_PLAY";
  if (state === "post" || type.completed || name.includes("FINAL")) return "FINISHED";
  if (name.includes("POSTPONED")) return "POSTPONED";
  if (name.includes("CANCEL")) return "CANCELLED";
  return "SCHEDULED";
};
function shiftDate(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}
async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
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
  // ESPN's Site scoreboard rejects date ranges on several leagues.
  // Fetch each local calendar day separately: yesterday, selected day, tomorrow.
  const startDate = shiftDate(date, -1);
  const endDate = shiftDate(date, 1);
  const requestedDates = [startDate, date, endDate];
  const outcomes = await Promise.allSettled(selected.map(async ([key, league]) => {
    const daily = await Promise.allSettled(requestedDates.map(async day => {
      const compactDate = day.replace(/-/g, "");
      const url = "https://site.api.espn.com/apis/site/v2/sports/soccer/" + league.slug + "/scoreboard?dates=" + compactDate + "&limit=100";
      const data = await getJson(url);
      return Array.isArray(data.events) ? data.events : [];
    }));
    const events = [];
    let failedDays = 0;
    daily.forEach(result => {
      if (result.status === "fulfilled") events.push(...result.value);
      else failedDays++;
    });
    if (failedDays === requestedDates.length) throw new Error("ESPN " + league.slug + " unavailable for all requested dates");
    return {
      key,
      matches: events.map(event => {
        const comp = (event.competitions || [])[0] || {};
        const competitors = comp.competitors || [];
        const home = competitors.find(team => team.homeAway === "home") || competitors[0] || {};
        const away = competitors.find(team => team.homeAway === "away") || competitors[1] || {};
        const teamName = team => team.team?.shortDisplayName || team.team?.displayName || team.team?.name || "فريق";
        const status = STATUS(event);
        const scoreValue = team => status === "SCHEDULED" || status === "POSTPONED" || team.score === undefined || team.score === null || team.score === "" ? null : Number(team.score);
        const logos = event.league?.logos || [];
        return {
          id: event.id,
          competitionCode: key,
          competitionSlug: league.slug,
          competition: event.league?.name || league.name,
          competitionEmblem: logos[0]?.href || "",
          home: teamName(home), away: teamName(away),
          homeTeamId: home.team?.id || "", awayTeamId: away.team?.id || "",
          homeCrest: home.team?.logo || home.team?.logos?.[0]?.href || "",
          awayCrest: away.team?.logo || away.team?.logos?.[0]?.href || "",
          utcDate: event.date || comp.date || null,
          status,
          homeScore: scoreValue(home), awayScore: scoreValue(away),
          venue: comp.venue?.fullName || ""
        };
      }),
      failedDays
    };
  }));
  const matches = [];
  const errors = [];
  let unavailableDays = 0;
  const diagnostics = [];
  outcomes.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      matches.push(...outcome.value.matches);
      unavailableDays += outcome.value.failedDays;
      diagnostics.push({ competition: outcome.value.key, count: outcome.value.matches.length, failedDays: outcome.value.failedDays });
    } else {
      const message = String(outcome.reason?.message || outcome.reason);
      errors.push(message);
      diagnostics.push({ competition: selected[index][0], error: message });
    }
  });
  // Safety net: some ESPN league scoreboards can omit fixtures that are present
  // in the global soccer scoreboard. Use it only when the league feeds returned
  // no usable events, then map known competitions back to our supported codes.
  const needsChampionsFallback = selected.some(([key]) => key === "CL") && !matches.some(match => match.competitionCode === "CL");
  if (matches.length === 0 || needsChampionsFallback) {
    const aliases = [
      ["CL", ["uefa champions", "uefa.champions", "champions league"]],
      ["PL", ["premier league", "english premier league"]],
      ["PD", ["laliga", "la liga", "spanish primera"]],
      ["SA", ["serie a", "italian serie"]],
      ["BL1", ["bundesliga", "german bundesliga"]],
      ["FL1", ["ligue 1", "french ligue"]],
      ["SPL", ["saudi pro league", "saudi professional league"]],
      ["MLS", ["major league soccer", " mls"]]
    ];
    const globalResults = await Promise.allSettled(requestedDates.map(async day => {
      const compactDate = day.replace(/-/g, "");
      const url = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=" + compactDate + "&limit=300";
      const data = await getJson(url);
      return Array.isArray(data.events) ? data.events : [];
    }));
    const globalEvents = [];
    globalResults.forEach(result => {
      if (result.status === "fulfilled") globalEvents.push(...result.value);
    });
    for (const event of globalEvents) {
      const eventCompetition = (event.competitions || [])[0] || {};
      // ESPN's global scoreboard does not consistently include event.league.
      // Its competition note (altGameNote) carries the actual tournament name.
      const noteText = [
        event.altGameNote,
        ...(eventCompetition.notes || []).map(note => typeof note === "string" ? note : (note?.headline || note?.text || note?.type?.text || "")),
        event.league?.name, event.league?.abbreviation, event.league?.slug,
        event.season?.name, event.season?.slug
      ].filter(Boolean).join(" ").toLowerCase();
      const found = aliases.find(([, terms]) => terms.some(term => noteText.includes(term)));
      if (!found) continue;
      const [key, league] = found;
      if (code && key !== code) continue;
      const comp = (event.competitions || [])[0] || {};
      const competitors = comp.competitors || [];
      const home = competitors.find(team => team.homeAway === "home") || competitors[0] || {};
      const away = competitors.find(team => team.homeAway === "away") || competitors[1] || {};
      const teamName = team => team.team?.shortDisplayName || team.team?.displayName || team.team?.name || "فريق";
      const status = STATUS(event);
      const scoreValue = team => status === "SCHEDULED" || status === "POSTPONED" || team.score === undefined || team.score === null || team.score === "" ? null : Number(team.score);
      matches.push({
        id: event.id, competitionCode: key, competitionSlug: league.slug,
        competition: event.league?.name || league.name,
        competitionEmblem: event.league?.logos?.[0]?.href || "",
        home: teamName(home), away: teamName(away),
        homeTeamId: home.team?.id || "", awayTeamId: away.team?.id || "",
        homeCrest: home.team?.logo || home.team?.logos?.[0]?.href || "",
        awayCrest: away.team?.logo || away.team?.logos?.[0]?.href || "",
        utcDate: event.date || comp.date || null, status,
        homeScore: scoreValue(home), awayScore: scoreValue(away),
        venue: comp.venue?.fullName || ""
      });
    }
    console.log("[matches-feed] global fallback", {
      requestedDates, globalEvents: globalEvents.length,
      mappedMatches: matches.length,
      leagueNames: [...new Set(globalEvents.map(e => e.altGameNote || e.league?.name).filter(Boolean))].slice(0, 20)
    });
  }
  console.log("[matches-feed] league results", diagnostics, "total:", matches.length);
  const uniqueMatches = [...new Map(matches.map(match => [String(match.id), match])).values()];
  uniqueMatches.sort((a,b) => String(a.utcDate || "").localeCompare(String(b.utcDate || "")));
  res.setHeader("Cache-Control", req.query.push === "1" ? "no-store" : "s-maxage=60, stale-while-revalidate=120");
  if (!uniqueMatches.length && errors.length === selected.length) {
    return res.status(502).json({ error: "تعذر الاتصال بمصدر المباريات حالياً.", details: errors[0] });
  }
  return res.status(200).json({ date, startDate, endDate, provider: "ESPN", updatedAt: new Date().toISOString(), matches: uniqueMatches, partial: errors.length > 0 || unavailableDays > 0, unavailableCompetitions: errors.length, unavailableDays, diagnostics });
};
