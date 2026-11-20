// Vercel Serverless Function: fetch today's football matches securely.
module.exports = async function handler(req, res) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "إعداد مفتاح بيانات المباريات غير مكتمل." });
  }

  const requestedDate = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return res.status(400).json({ error: "صيغة التاريخ غير صحيحة." });
  }

  try {
    const upstream = await fetch(
      "https://api.football-data.org/v4/matches?dateFrom=" + requestedDate + "&dateTo=" + requestedDate,
      { headers: { "X-Auth-Token": token } }
    );

    if (upstream.status === 429) {
      res.setHeader("Retry-After", upstream.headers.get("Retry-After") || "60");
      return res.status(429).json({ error: "وصلنا إلى حد الطلبات المسموح مؤقتاً. حاول بعد قليل." });
    }

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data.message || "تعذر جلب بيانات المباريات حالياً."
      });
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      date: requestedDate,
      matches: (data.matches || []).map((m) => ({
        id: m.id,
        competitionCode: m.competition?.code || "",
        competition: m.competition?.name || "بطولة",
        home: m.homeTeam?.shortName || m.homeTeam?.name || "الفريق المضيف",
        away: m.awayTeam?.shortName || m.awayTeam?.name || "الفريق الضيف",
        utcDate: m.utcDate,
        status: m.status,
        homeScore: m.score?.fullTime?.home ?? null,
        awayScore: m.score?.fullTime?.away ?? null
      }))
    });
  } catch (error) {
    return res.status(502).json({ error: "تعذر الاتصال بمصدر بيانات المباريات." });
  }
};
