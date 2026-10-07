export function score(match, events) {
  const result = { home: 0, away: 0 };
  for (const event of events.filter((e) => e.match_id === match.id)) {
    if (!["goal", "own_goal"].includes(event.kind)) continue;
    let side = event.team_id === match.home_id ? "home" : "away";
    if (event.kind === "own_goal") side = side === "home" ? "away" : "home";
    result[side]++;
  }
  return result;
}
export function standings(competition, teams, matches, events) {
  const rows = new Map(
    teams.map((t) => [
      t.id,
      { ...t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 },
    ]),
  );
  for (const m of matches.filter(
    (m) => m.competition_id === competition.id && m.status === "finished",
  )) {
    const h = rows.get(m.home_id),
      a = rows.get(m.away_id);
    if (!h || !a) continue;
    const s = score(m, events);
    h.played++;
    a.played++;
    h.gf += s.home;
    h.ga += s.away;
    a.gf += s.away;
    a.ga += s.home;
    if (s.home === s.away) {
      h.drawn++;
      a.drawn++;
      h.points += competition.draw_points;
      a.points += competition.draw_points;
    } else {
      const w = s.home > s.away ? h : a,
        l = s.home > s.away ? a : h;
      w.won++;
      l.lost++;
      w.points += competition.win_points;
      l.points += competition.loss_points;
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.gf - b.ga - (a.gf - a.ga) ||
      b.gf - a.gf ||
      a.name.localeCompare(b.name, "th"),
  );
}
export function playerStats(players, matches, events, competitionId = "") {
  const eligible = new Set(
    matches
      .filter(
        (m) =>
          (!competitionId || m.competition_id === competitionId) &&
          ["live", "finished"].includes(m.status),
      )
      .map((m) => m.id),
  );
  const rows = new Map(
    players.map((p) => [
      p.id,
      { ...p, goals: 0, assists: 0, yellow: 0, red: 0, own_goals: 0 },
    ]),
  );
  for (const e of events) {
    if (!eligible.has(e.match_id)) continue;
    const p = rows.get(e.player_id),
      assist = rows.get(e.assist_id);
    if (e.kind === "goal") {
      if (p) p.goals++;
      if (assist) assist.assists++;
    }
    if (p) {
      if (["yellow", "second_yellow"].includes(e.kind)) p.yellow++;
      if (["red", "second_yellow"].includes(e.kind)) p.red++;
      if (e.kind === "own_goal") p.own_goals++;
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.goals - a.goals ||
      b.assists - a.assists ||
      a.name.localeCompare(b.name, "th"),
  );
}
export function roundRobin(ids, doubleLeg = false) {
  if (ids.length < 2 || new Set(ids).size !== ids.length)
    throw Error("เลือกอย่างน้อย 2 ทีมที่ไม่ซ้ำกัน");
  const ring = [...ids];
  if (ring.length % 2) ring.push(null);
  const matches = [];
  for (let round = 1; round < ring.length; round++) {
    for (let i = 0; i < ring.length / 2; i++) {
      let h = ring[i],
        a = ring[ring.length - 1 - i];
      if (!h || !a) continue;
      if ((round + i) % 2 === 0) [h, a] = [a, h];
      matches.push({ round, home_id: h, away_id: a });
    }
    ring.splice(1, 0, ring.pop());
  }
  return doubleLeg
    ? [
        ...matches,
        ...matches.map((m) => ({
          round: m.round + ring.length - 1,
          home_id: m.away_id,
          away_id: m.home_id,
        })),
      ]
    : matches;
}
export const kindLabels = {
  goal: "ประตู",
  own_goal: "ทำเข้าประตูตัวเอง",
  yellow: "ใบเหลือง",
  second_yellow: "เหลืองที่สอง → แดง",
  red: "ใบแดง",
};
export const statusLabels = {
  scheduled: "ยังไม่แข่ง",
  live: "กำลังแข่ง",
  finished: "จบการแข่งขัน",
  postponed: "เลื่อน",
  cancelled: "ยกเลิก",
};
