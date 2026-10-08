import { groupTables } from "./tournaments.js";
const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function groupStandingsHTML(c, teams, matches, events) {
  if (c?.format === "knockout")
    return '<div class="panel"><p>รายการน็อกเอาต์ ดูคู่แข่งขันและผลในหน้าโปรแกรมการแข่งขัน</p></div>';
  if (c?.format !== "groups") return null;
  const groups = groupTables(
    c,
    teams,
    matches.filter((m) => m.competition_id === c.id),
    events,
  );
  return (
    groups
      .map(
        (g) =>
          `<div class="panel"><h2>กลุ่ม ${escape(g.name)}</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>ทีม</th><th>แข่ง</th><th>ชนะ</th><th>เสมอ</th><th>แพ้</th><th>ได้</th><th>เสีย</th><th>คะแนน</th></tr></thead><tbody>${g.rows.map((t, i) => `<tr><td>${i + 1}</td><td>${escape(t.name)}</td><td>${t.played}</td><td>${t.won}</td><td>${t.drawn}</td><td>${t.lost}</td><td>${t.gf}</td><td>${t.ga}</td><td>${t.points}</td></tr>`).join("")}</tbody></table></div></div>`,
      )
      .join("") || "<p>ยังไม่มีโปรแกรมรอบแบ่งกลุ่ม</p>"
  );
}
