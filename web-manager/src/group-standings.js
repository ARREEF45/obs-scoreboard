import {qualificationTable} from './qualification-table.js';
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
  const knockout=matches.filter(m=>m.competition_id===c.id&&m.stage==='knockout');
  if(!c.tournament_state?.group_qualifiers&&knockout.length)c={...c,tournament_state:{...c.tournament_state,group_qualifiers:[...new Set([...knockout.flatMap(m=>[m.home_id,m.away_id]),...(c.tournament_state?.byes||[])])]}};
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
          `<div class="panel"><h2>กลุ่ม ${escape(g.name)}</h2>${qualificationTable(g.rows,c)}</div>`,
      )
      .join("") || "<p>ยังไม่มีโปรแกรมรอบแบ่งกลุ่ม</p>"
  );
}
