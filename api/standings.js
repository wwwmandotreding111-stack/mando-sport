// Vercel Serverless Function: retrieve standings for supported competitions.
const ALLOWED = {
  PL: "الدوري الإنجليزي الممتاز",
  PD: "الدوري الإسباني",
  SA: "الدوري الإيطالي",
  BL1: "الدوري الألماني",
  FL1: "الدوري الفرنسي",
  CL: "دوري أبطال أوروبا"
};

module.exports = async function handler(req, res) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return res.status(500).json({ error: "إعداد مفتاح بيانات المباريات غير مكتمل." });

  const code = typeof req.query.competition === "string" ? req.query.competition.toUpperCase() : "PL";
  if (!Object.prototype.hasOwnProperty.call(ALLOWED, code)) {
    return res.status(400).json({ error: "البطولة المطلوبة غير مدعومة حالياً." });
  }

  try {
    const upstream = await fetch("https://api.football-data.org/v4/competitions/" + code + "/standings", {
      headers: { "X-Auth-Token": token }
    });
    if (upstream.status === 429) {
      res.setHeader("Retry-After", upstream.headers.get("Retry-After") || "60");
      return res.status(429).json({ error: "وصلنا إلى حد الطلبات المسموح مؤقتاً. حاول بعد قليل." });
    }
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.message || "تعذر جلب ترتيب البطولة حالياً." });
    }

    const table = data.standings?.find(item => item.type === "TOTAL")?.table || data.standings?.[0]?.table || [];
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).json({
      competition: ALLOWED[code],
      season: data.season?.startDate && data.season?.endDate ? data.season.startDate.slice(0,4) + " / " + data.season.endDate.slice(0,4) : "",
      table: table.map(row => ({
        position: row.position,
        team: row.team?.shortName || row.team?.name || "فريق",
        played: row.playedGames,
        won: row.won,
        drawn: row.draw,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        points: row.points
      }))
    });
  } catch (error) {
    return res.status(502).json({ error: "تعذر الاتصال بمصدر ترتيب البطولات." });
  }
};
