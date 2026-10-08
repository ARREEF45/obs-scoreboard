import { roundRobin, standings } from "./domain.js";
export const formats = {
  league: "ลีกพบกันหมด",
  knockout: "น็อกเอาต์",
  groups: "แบ่งกลุ่มแล้วน็อกเอาต์",
};
export const competitionLabel = (c) =>
  c ? `${c.name}${c.season ? " · " + c.season : ""}` : "";
export const stageLabel = (m) =>
  `${m.stage === "group" ? "กลุ่ม " + m.group_name + " · " : m.stage === "knockout" ? "น็อกเอาต์ · " : ""}รอบ ${m.round}`;
export function competitionTree(rows) {
  const result = [],
    seen = new Set();
  function visit(parent, depth) {
    for (const c of rows
      .filter((c) => (c.parent_id || null) === parent)
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "th") ||
          b.season.localeCompare(a.season, "th"),
      )) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      result.push({ ...c, depth });
      visit(c.id, depth + 1);
    }
  }
  visit(null, 0);
  for (const c of rows) if (!seen.has(c.id)) result.push({ ...c, depth: 0 });
  return result;
}
export function knockout(ids, round = 1) {
  if (ids.length < 2 || new Set(ids).size !== ids.length)
    throw Error("เลือกอย่างน้อย 2 ทีมที่ไม่ซ้ำกัน");
  const size = 2 ** Math.ceil(Math.log2(ids.length)),
    byeCount = size - ids.length;
  const byes = ids.slice(0, byeCount),
    playing = ids.slice(byeCount),
    rows = [];
  for (let i = 0; i < playing.length; i += 2)
    rows.push({
      home_id: playing[i],
      away_id: playing[i + 1],
      round,
      stage: "knockout",
      group_name: "",
    });
  return { rows, state: { phase: "knockout", round, byes } };
}
export function groupTables(c, teams, matches, events) {
  const groups = [
    ...new Set(
      matches.filter((m) => m.stage === "group").map((m) => m.group_name),
    ),
  ].sort();
  return groups.map((name) => {
    const games = matches.filter(
      (m) => m.stage === "group" && m.group_name === name,
    );
    const ids = new Set(games.flatMap((m) => [m.home_id, m.away_id]));
    return {
      name,
      rows: standings(
        c,
        teams.filter((t) => ids.has(t.id)),
        games,
        events,
      ),
    };
  });
}
export function initialSchedule(c, ids, doubleLeg = false, assignments = {}) {
  if (c.format === "knockout") return knockout(ids);
  let rows;
  if (c.format === "groups") {
    const groups = new Map();
    for (const id of ids) {
      const group = assignments[id];
      if (!group) throw Error("กำหนดกลุ่มให้ครบทุกทีม");
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(id);
    }
    if (groups.size !== c.group_count)
      throw Error("จำนวนกลุ่มไม่ตรงกับที่กำหนด");
    rows = [...groups].flatMap(([name, teams]) =>
      roundRobin(teams, doubleLeg).map((m) => ({
        ...m,
        stage: "group",
        group_name: name,
      })),
    );
  } else
    rows = roundRobin(ids, doubleLeg).map((m) => ({
      ...m,
      stage: "league",
      group_name: "",
    }));
  return {
    rows,
    state: {
      phase: c.format === "groups" ? "group" : "league",
      round: Math.max(...rows.map((m) => m.round)),
      byes: [],
    },
  };
}
