import "./style.css";
import {
  client,
  config,
  configure,
  fetchAll,
  save,
  remove,
  logoURL,
  uploadLogo,
} from "./api.js";
import {
  score,
  standings,
  playerStats,
  roundRobin,
  kindLabels,
  statusLabels,
} from "./domain.js";
const $ = (s) => document.querySelector(s),
  escape = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let db = {
    teams: [],
    players: [],
    competitions: [],
    entries: [],
    matches: [],
    lineups: [],
    events: [],
  },
  user,
  view = "dashboard",
  competition = "",
  matchId = "",
  tab = "events",
  busy = false,
  lastSync = "",
  timer,
  noticeTimer;
const logos = new Map(),
  labels = {
    dashboard: "ภาพรวม",
    teams: "ทีมทั้งหมด",
    players: "นักเตะ",
    competitions: "รายการแข่งขัน",
    matches: "โปรแกรมการแข่งขัน",
    standings: "ตารางคะแนน",
    stats: "สถิตินักเตะ",
    settings: "ตั้งค่า / นำเข้าข้อมูล",
  };
const team = (id) => db.teams.find((t) => t.id === id),
  player = (id) => db.players.find((p) => p.id === id),
  match = () => db.matches.find((m) => m.id === matchId),
  comp = () => db.competitions.find((c) => c.id === competition);
const button = (text, action, id = "", cls = "") =>
  `<button class="${cls}" data-action="${action}" data-id="${escape(id)}">${text}</button>`;
const badge = (s) =>
  `<span class="badge ${s === "live" ? "live" : ""}">${statusLabels[s] || escape(s)}</span>`;
const date = (s) =>
  s
    ? new Date(s).toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "ยังไม่กำหนดเวลา";
const crest = (id) =>
  logos.get(team(id)?.logo_path)
    ? `<img class="crest" src="${escape(logos.get(team(id).logo_path))}" alt="">`
    : '<span class="crest" style="display:inline-grid;place-items:center;font-size:24px">⚽</span>';
function notify(text, error = false) {
  $("#notice").textContent = text;
  $("#notice").classList.toggle("error", error);
  $("#notice").style.display = "block";
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(
    () => ($("#notice").style.display = "none"),
    error ? 10000 : 4500,
  );
}
function message(error) {
  if (error.code === "23503")
    return "ข้อมูลนี้เชื่อมกับนักเตะ รายชื่อ หรือเหตุการณ์ในแมตช์แล้ว กรุณาตรวจรายการที่เกี่ยวข้อง";
  if (error.code === "23505")
    return "มีข้อมูลนี้แล้ว กรุณาตรวจชื่อทีม/ทีมที่ลงทะเบียน";
  return error.message || String(error);
}
async function perform(work) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    await work();
  } catch (e) {
    notify(message(e), true);
  } finally {
    busy = false;
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}
async function refresh(quiet = false) {
  if (!client || !user) return;
  try {
    const next = await fetchAll();
    db = next;
    await Promise.all(
      db.teams.map(async (t) => {
        if (t.logo_path) logos.set(t.logo_path, await logoURL(t.logo_path));
      }),
    );
    if (competition && !comp()) competition = "";
    lastSync = new Date().toLocaleTimeString("th-TH");
    render();
  } catch (e) {
    if (!quiet) throw e;
    const el = $(".connection");
    if (el) el.textContent = "ขาดการเชื่อมต่อ — กำลังลองใหม่";
  }
}
function options(rows, value = "", blank = "เลือก…") {
  return (
    `<option value="">${blank}</option>` +
    rows
      .map(
        (r) =>
          `<option value="${escape(r.id)}" ${r.id === value ? "selected" : ""}>${escape(r.name)}</option>`,
      )
      .join("")
  );
}
function chooseCompetition() {
  return `<select id="competition-filter" aria-label="รายการแข่งขัน">${options(db.competitions, competition, "ทุกรายการ")}</select>`;
}
function table(headers, rows) {
  return rows.length
    ? `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : '<div class="empty">ยังไม่มีข้อมูลในส่วนนี้</div>';
}
function render() {
  if (!user) return;
  const title = view === "match" ? "จัดการแมตช์" : labels[view];
  $("#app").innerHTML =
    `<div class="shell"><aside><div class="brand">สนาม<span style="color:#58dca2">.</span><small>FOOTBALL MANAGER</small></div><nav>${Object.entries(
      labels,
    )
      .map(([key, label]) =>
        button(label, "nav", key, view === key ? "active" : ""),
      )
      .join(
        "",
      )}</nav><div class="foot">ฐานข้อมูลฟุตบอลของคุณ<br>Supabase · OBS Scoreboard</div></aside><main><header><div><h1>${title}</h1><small>จัดการการแข่งขัน เชื่อมข้อมูลทุกอุปกรณ์</small></div><div class="actions"><span class="connection"><i class="status-dot"></i>ซิงค์ ${lastSync}</span>${button("รีเฟรช", "refresh")}${button("ออกจากระบบ", "logout")}</div></header><div id="content">${content()}</div></main></div>`;
}
function matchRows(list) {
  return table(
    ["วัน / เวลา (ไทย)", "รายการ / รอบ", "คู่แข่งขัน", "สกอร์", "สถานะ", ""],
    list
      .sort((a, b) => (a.kickoff || "9999").localeCompare(b.kickoff || "9999"))
      .map((m) => {
        const s = score(m, db.events);
        return [
          date(m.kickoff),
          `${escape(db.competitions.find((c) => c.id === m.competition_id)?.name)} · ${m.round}`,
          `${escape(team(m.home_id)?.name)} — ${escape(team(m.away_id)?.name)}`,
          `<span class="score">${s.home} : ${s.away}</span>`,
          badge(m.status),
          button("เปิดแมตช์", "match", m.id) +
            button("แก้ไข", "edit-matches", m.id),
        ];
      }),
  );
}
function content() {
  if (view === "dashboard")
    return `<div class="metrics">${[
      ["ทีม", db.teams.filter((t) => !t.archived).length],
      ["นักเตะ", db.players.filter((p) => p.active).length],
      ["โปรแกรมแข่งขัน", db.matches.length],
      ["ประตู", db.events.filter((e) => e.kind === "goal").length],
    ]
      .map(
        ([label, n]) =>
          `<div class="metric"><small>${label}</small><strong>${n}</strong></div>`,
      )
      .join(
        "",
      )}</div><div class="panel"><div class="toolbar"><h2>การแข่งขันที่กำลังจะมาถึง</h2>${button("จัดโปรแกรม", "nav", "matches", "primary")}</div>${matchRows(db.matches.filter((m) => ["scheduled", "live", "postponed"].includes(m.status)).slice(0, 10))}</div>`;
  if (view === "teams")
    return `<div class="toolbar"><p class="muted">${db.teams.length} ทีม · เก็บชื่อ โลโก้ และสีชุดไว้ใช้ทุกนัด</p>${button("+ เพิ่มทีม", "edit-teams", "", "primary")}</div><div class="cards">${db.teams.map((t) => `<article class="team-card"><div class="team-head">${crest(t.id)}<div><h3>${escape(t.name)}</h3><small>${t.archived ? "เก็บถาวร" : db.players.filter((p) => p.team_id === t.id && p.active).length + " นักเตะ"}</small></div></div><p class="muted">ผู้คุมทีม ${escape(t.coach) || "—"}</p><p><i class="swatch" style="background:${t.home_color}"></i>เหย้า <i class="swatch" style="background:${t.away_color}"></i>เยือน</p>${button("แก้ไขข้อมูลทีม", "edit-teams", t.id)}</article>`).join("") || '<div class="empty">เริ่มต้นด้วยการเพิ่มทีมแรก</div>'}</div>`;
  if (view === "players")
    return `<div class="panel"><div class="toolbar"><h2>รายชื่อนักเตะทั้งหมด</h2>${button("+ เพิ่มนักเตะ", "edit-players", "", "primary")}</div>${table(
      ["เบอร์", "ชื่อ", "ทีม", "ตำแหน่ง", "สถานะ", ""],
      db.players.map((p) => [
        escape(p.number),
        escape(p.name),
        escape(team(p.team_id)?.name),
        escape(p.position),
        p.active ? "ใช้งาน" : "พักใช้งาน",
        button("แก้ไข", "edit-players", p.id),
      ]),
    )}</div>`;
  if (view === "competitions")
    return `<div class="toolbar"><p class="muted">สร้างรายการ แล้วลงทะเบียนทีมก่อนจัดโปรแกรม</p>${button("+ เพิ่มรายการ", "edit-competitions", "", "primary")}</div><div class="cards">${db.competitions.map((c) => `<article class="team-card"><h2>${escape(c.name)}</h2><p class="muted">${escape(c.season)} · ${db.entries.filter((e) => e.competition_id === c.id).length} ทีม</p><div class="actions">${button("แก้ไข", "edit-competitions", c.id)}${button("ทีมที่เข้าร่วม", "entries", c.id)}</div></article>`).join("")}</div>`;
  if (view === "matches")
    return `<div class="panel"><div class="toolbar">${chooseCompetition()}<div class="actions">${button("สร้างโปรแกรมพบกันหมด", "schedule")}${button("+ เพิ่มแมตช์", "edit-matches", "", "primary")}</div></div>${matchRows(db.matches.filter((m) => !competition || m.competition_id === competition))}</div>`;
  if (view === "standings") {
    const c = comp();
    const rows = c
      ? standings(
          c,
          db.teams.filter((t) =>
            db.entries.some(
              (e) => e.team_id === t.id && e.competition_id === c.id,
            ),
          ),
          db.matches,
          db.events,
        )
      : [];
    return `<div class="panel"><div class="toolbar">${chooseCompetition()}<small>เฉพาะนัดจบแล้ว · คะแนน → ผลต่าง → ประตูได้ → ชื่อทีม</small></div>${
      c
        ? table(
            [
              "#",
              "ทีม",
              "แข่ง",
              "ชนะ",
              "เสมอ",
              "แพ้",
              "ได้",
              "เสีย",
              "+/−",
              "คะแนน",
            ],
            rows.map((r, i) => [
              i + 1,
              escape(r.name),
              r.played,
              r.won,
              r.drawn,
              r.lost,
              r.gf,
              r.ga,
              r.gf - r.ga,
              `<strong>${r.points}</strong>`,
            ]),
          )
        : '<div class="empty">เลือกรายการแข่งขันเพื่อดูตารางคะแนน</div>'
    }</div>`;
  }
  if (view === "stats")
    return `<div class="panel"><div class="toolbar">${chooseCompetition()}<small>นัดกำลังแข่งและจบแล้ว · แอสซิสต์ผูกกับประตู</small></div>${table(
      [
        "นักเตะ",
        "ทีม",
        "ประตู",
        "แอสซิสต์",
        "ใบเหลือง",
        "ใบแดง",
        "เข้าประตูตัวเอง",
      ],
      playerStats(db.players, db.matches, db.events, competition).map((p) => [
        escape(p.name),
        escape(team(p.team_id)?.name),
        p.goals,
        p.assists,
        p.yellow,
        p.red,
        p.own_goals,
      ]),
    )}</div>`;
  if (view === "settings")
    return `<div class="panel"><h2>ฐานข้อมูลกลาง</h2><p>คอมและมือถือใช้เว็บนี้และเข้าสู่ระบบด้วยบัญชีเดียวกัน ข้อมูลทั้งหมดเก็บใน Supabase</p><p class="muted">${escape(config.url)} · ${escape(user.email)}</p><div class="actions">${button("ดาวน์โหลดข้อมูล JSON", "backup")}${button("นำเข้าคลังทีมจาก Portable", "import")}</div><p class="form-help">นำเข้าไฟล์ scoreboard-team-database.json หรือ .scoreboard-state.json ทีมชื่อซ้ำจะข้าม เพื่อไม่ทับข้อมูลเดิม</p></div><div class="panel"><h2>ใช้กับ OBS Portable</h2><p>เปิดแมตช์ → จัดรายชื่อ → ดาวน์โหลดไฟล์แมตช์ OBS แล้ว Import แมตช์ในหน้า Control เดิม การดาวน์โหลดเป็นภาพรวมข้อมูล ณ เวลานั้น ยังไม่ซิงค์ OBS อัตโนมัติ</p></div>`;
  if (view === "match") return matchContent();
  return "";
}
function matchContent() {
  const m = match();
  if (!m) return '<div class="empty">ไม่พบแมตช์</div>';
  const s = score(m, db.events);
  const events = db.events
    .filter((e) => e.match_id === m.id)
    .sort((a, b) => a.minute - b.minute || a.added - b.added);
  return `<div class="toolbar">${button("← โปรแกรมการแข่งขัน", "nav", "matches")}<div class="actions">${badge(m.status)}${button("แก้ไขเวลา / สถานะ", "edit-matches", m.id)}${button("ดาวน์โหลดแมตช์ OBS", "obs", m.id)}</div></div><div class="match-head"><div>${crest(m.home_id)}${escape(team(m.home_id)?.name)}</div><div><span class="score">${s.home} : ${s.away}</span><div>${date(m.kickoff)}</div><small>${escape(m.venue)}</small></div><div>${crest(m.away_id)}${escape(team(m.away_id)?.name)}</div></div><div class="tabs">${button("เหตุการณ์ / ผลการแข่งขัน", "tab", "events", tab === "events" ? "active" : "")}${button("ตัวจริง / ตัวสำรอง", "tab", "lineups", tab === "lineups" ? "active" : "")}</div>${
    tab === "lineups"
      ? `<div class="two">${[m.home_id, m.away_id]
          .map(
            (id) =>
              `<div class="panel"><h2>${escape(team(id)?.name)}</h2><p class="muted">${db.lineups.filter((l) => l.match_id === m.id && l.team_id === id && l.role === "starter").length}/11 ตัวจริง</p>${button("จัดผู้เล่นนัดนี้", "lineup", id, "primary")}${table(
                ["เบอร์", "นักเตะ", "สถานะ"],
                db.lineups
                  .filter((l) => l.match_id === m.id && l.team_id === id)
                  .map((l) => [
                    escape(player(l.player_id)?.number),
                    escape(player(l.player_id)?.name),
                    l.role === "starter" ? "ตัวจริง" : "สำรอง",
                  ]),
              )}</div>`,
          )
          .join("")}</div>`
      : `<div class="panel"><div class="toolbar"><h2>เหตุการณ์ในแมตช์</h2>${button("+ บันทึกประตู / ใบ", "event", "", "primary")}</div><p class="form-help">ประตูจะเพิ่มสกอร์อัตโนมัติ เลือกผู้จ่ายเพื่อบันทึกแอสซิสต์ · หากยังไม่ระบุผู้ยิง สามารถเลือก “ไม่ระบุ” ได้</p>${events.map((e) => `<div class="event-row"><time>${e.minute}${e.added ? "+" + e.added : ""}′</time><div class="desc"><strong>${kindLabels[e.kind]}</strong> · ${escape(player(e.player_id)?.name || team(e.team_id)?.name)}<div class="muted">${escape(team(e.team_id)?.name)}${e.assist_id ? " · แอสซิสต์: " + escape(player(e.assist_id)?.name) : ""}</div></div>${button("แก้ไข", "event", e.id)}${button("ลบ", "delete-event", e.id, "danger")}</div>`).join("") || '<div class="empty">ยังไม่มีเหตุการณ์ — สกอร์ 0 : 0</div>'}</div>`
  }`;
}
function modal(title, body, onSave) {
  const d = $("#modal");
  d.innerHTML = `<form id="modal-form"><h2>${escape(title)}</h2>${body}<div class="actions"><button type="button" data-action="close">ยกเลิก</button><button class="primary" type="submit">บันทึก</button></div></form>`;
  d.showModal();
  $("#modal-form").onsubmit = (e) => {
    e.preventDefault();
    perform(async () => {
      await onSave(new FormData(e.target));
      d.close();
      await refresh();
      notify("บันทึกเรียบร้อย");
    });
  };
}
const input = (name, label, value = "", type = "text", extra = "") =>
  `<label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${escape(value)}" ${extra}>`;
const select = (name, label, rows, value = "", blank = "เลือก…") =>
  `<label for="f-${name}">${label}</label><select id="f-${name}" name="${name}" required>${options(rows, value, blank)}</select>`;
function edit(tableName, id) {
  const old = db[tableName].find((r) => r.id === id),
    r = old || {};
  let fields = "";
  if (tableName === "teams")
    fields =
      input("name", "ชื่อทีม", r.name, "text", "required") +
      input("coach", "ผู้คุมทีม", r.coach) +
      `<div class="form-row"><div>${input("home_color", "สีชุดเหย้า", r.home_color || "#1d4ed8", "color")}</div><div>${input("away_color", "สีชุดเยือน", r.away_color || "#dc2626", "color")}</div></div>` +
      input(
        "logo",
        "โลโก้ (PNG/JPG/WebP ไม่เกิน 5 MB)",
        "",
        "file",
        'accept="image/png,image/jpeg,image/webp"',
      ) +
      '<label><input name="clear_logo" type="checkbox"> ล้างโลโก้เดิม</label>' +
      `<label><input name="archived" type="checkbox" ${r.archived ? "checked" : ""}> เก็บทีมถาวร</label>`;
  if (tableName === "players")
    fields =
      select("team_id", "ทีม", db.teams, r.team_id) +
      input("name", "ชื่อนักเตะ", r.name, "text", "required") +
      input("number", "เบอร์", r.number) +
      select(
        "position",
        "ตำแหน่ง",
        ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "ST"].map(
          (x) => ({ id: x, name: x }),
        ),
        r.position || "CM",
      ) +
      `<label><input name="active" type="checkbox" ${r.active !== false ? "checked" : ""}> ใช้งาน</label><p class="form-help">นักเตะที่มีประวัติการแข่งขันแล้วควรพักใช้งานแทนการเปลี่ยนทีม เพื่อรักษาสถิติเดิม</p>`;
  if (tableName === "competitions")
    fields =
      input("name", "ชื่อรายการ", r.name, "text", "required") +
      input("season", "ฤดูกาล", r.season) +
      input(
        "win_points",
        "คะแนนชนะ",
        r.win_points ?? 3,
        "number",
        'min="0" required',
      ) +
      input(
        "draw_points",
        "คะแนนเสมอ",
        r.draw_points ?? 1,
        "number",
        'min="0" required',
      ) +
      input(
        "loss_points",
        "คะแนนแพ้",
        r.loss_points ?? 0,
        "number",
        'min="0" required',
      );
  if (tableName === "matches") {
    const cid = r.competition_id || competition;
    const eligible = db.teams.filter((t) =>
      db.entries.some((e) => e.competition_id === cid && e.team_id === t.id),
    );
    fields =
      select("competition_id", "รายการ", db.competitions, cid) +
      select("home_id", "ทีมเหย้า", eligible, r.home_id) +
      select("away_id", "ทีมเยือน", eligible, r.away_id) +
      input(
        "kickoff",
        "วันเวลาแข่ง (ประเทศไทย)",
        r.kickoff
          ? new Date(new Date(r.kickoff).getTime() + 7 * 3600000)
              .toISOString()
              .slice(0, 16)
          : "",
        "datetime-local",
      ) +
      input("venue", "สนาม", r.venue) +
      input("round", "รอบ", r.round || 1, "number", 'min="1" required') +
      select(
        "status",
        "สถานะ",
        Object.entries(statusLabels).map(([id, name]) => ({ id, name })),
        r.status || "scheduled",
      );
  }
  modal(
    (old ? "แก้ไข" : "เพิ่ม") +
      " " +
      {
        teams: "ทีม",
        players: "นักเตะ",
        competitions: "รายการแข่งขัน",
        matches: "แมตช์",
      }[tableName],
    fields,
    async (f) => {
      let data = Object.fromEntries(f);
      if (tableName === "teams") {
        const file = f.get("logo");
        data = {
          name: data.name.trim(),
          coach: data.coach,
          home_color: data.home_color,
          away_color: data.away_color,
          archived: f.has("archived"),
          logo_path: f.has("clear_logo") ? "" : r.logo_path || "",
        };
        if (file?.size) data.logo_path = await uploadLogo(file, user.id);
      }
      if (tableName === "players") data.active = f.has("active");
      if (tableName === "competitions")
        for (const key of ["win_points", "draw_points", "loss_points"])
          data[key] = Number(data[key]);
      if (tableName === "matches") {
        if (data.home_id === data.away_id)
          throw Error("ทีมเหย้าและเยือนต้องต่างกัน");
        data.round = Number(data.round);
        data.kickoff = data.kickoff
          ? new Date(data.kickoff + ":00+07:00").toISOString()
          : null;
      }
      await save(tableName, data, old);
    },
  );
  if (tableName === "matches")
    $("#f-competition_id").onchange = (e) => {
      const eligible = db.teams.filter((t) =>
        db.entries.some(
          (x) => x.competition_id === e.target.value && x.team_id === t.id,
        ),
      );
      $("#f-home_id").innerHTML = options(eligible);
      $("#f-away_id").innerHTML = options(eligible);
    };
}
function entryEditor(id) {
  const selected = db.entries.filter((e) => e.competition_id === id);
  modal(
    "ทีมที่เข้าร่วม",
    `<div class="checklist">${db.teams
      .filter((t) => !t.archived || selected.some((e) => e.team_id === t.id))
      .map(
        (t) =>
          `<label><input type="checkbox" name="teams" value="${t.id}" ${selected.some((e) => e.team_id === t.id) ? "checked" : ""}> ${escape(t.name)}</label>`,
      )
      .join("")}</div>`,
    async (f) => {
      const ids = f.getAll("teams");
      const additions = ids.filter(
        (id) => !selected.some((e) => e.team_id === id),
      );
      const deletions = selected.filter((e) => !ids.includes(e.team_id));
      if (
        deletions.some((e) =>
          db.matches.some(
            (m) =>
              m.competition_id === id &&
              [m.home_id, m.away_id].includes(e.team_id),
          ),
        )
      )
        throw Error("ทีมที่มีโปรแกรมแข่งขันแล้วไม่สามารถนำออกได้");
      if (additions.length) {
        const { error } = await client
          .from("fm_entries")
          .insert(
            additions.map((team_id) => ({ competition_id: id, team_id })),
          );
        if (error) throw error;
      }
      if (deletions.length) {
        const { error } = await client
          .from("fm_entries")
          .delete()
          .in(
            "id",
            deletions.map((e) => e.id),
          );
        if (error) throw error;
      }
    },
  );
}
function schedule() {
  if (!competition) throw Error("เลือกรายการแข่งขันก่อนสร้างโปรแกรม");
  const entries = db.entries.filter((e) => e.competition_id === competition);
  if (entries.length < 2) throw Error("ลงทะเบียนอย่างน้อย 2 ทีมก่อน");
  if (db.matches.some((m) => m.competition_id === competition))
    throw Error("รายการนี้มีโปรแกรมแล้ว ใช้เพิ่มแมตช์เพื่อป้องกันโปรแกรมซ้ำ");
  modal(
    "สร้างโปรแกรมพบกันหมด",
    input(
      "start",
      "วันเวลาเริ่ม (ประเทศไทย)",
      "",
      "datetime-local",
      "required",
    ) +
      input("gap", "ห่างกันกี่วันต่อรอบ", 7, "number", 'min="1" required') +
      input("venue", "สนามเริ่มต้น") +
      '<label><input type="checkbox" name="double"> เหย้า–เยือน (สองเลก)</label><p class="form-help">นัดในรอบเดียวกันเริ่มเวลาเดียวกัน สามารถแก้เวลาแต่ละคู่ภายหลังได้</p>',
    async (f) => {
      const cid = competition;
      const { data: existing, error: check } = await client
        .from("fm_matches")
        .select("id")
        .eq("competition_id", cid)
        .limit(1);
      if (check) throw check;
      if (existing.length)
        throw Error("มีโปรแกรมจากอีกเครื่องแล้ว กรุณารีเฟรช");
      const start = new Date(f.get("start") + ":00+07:00").getTime(),
        gap = Number(f.get("gap")) * 86400000;
      const rows = roundRobin(
        entries.map((e) => e.team_id),
        f.has("double"),
      ).map((m) => ({
        ...m,
        competition_id: cid,
        kickoff: new Date(start + (m.round - 1) * gap).toISOString(),
        venue: f.get("venue"),
      }));
      const { error } = await client.from("fm_matches").insert(rows);
      if (error) throw error;
    },
  );
}
function lineupEditor(teamId) {
  const m = match(),
    selected = db.lineups.filter(
      (l) => l.match_id === m.id && l.team_id === teamId,
    );
  const list = db.players.filter(
    (p) =>
      p.team_id === teamId &&
      (p.active || selected.some((l) => l.player_id === p.id)),
  );
  modal(
    "จัดรายชื่อ · " + team(teamId).name,
    `<p class="form-help">ไม่เลือก = ไม่แสดงในกราฟิก · ตัวจริงสูงสุด 11 คน</p>${list
      .map(
        (p) =>
          `<div class="lineup-row"><span>${escape(p.number)}</span><span>${escape(p.name)}</span><select name="${p.id}">${[
            ["", "ไม่ลงนัดนี้"],
            ["starter", "ตัวจริง"],
            ["substitute", "สำรอง"],
          ]
            .map(
              ([v, t]) =>
                `<option value="${v}" ${selected.find((l) => l.player_id === p.id)?.role === v ? "selected" : ""}>${t}</option>`,
            )
            .join("")}</select></div>`,
      )
      .join("")}`,
    async (f) => {
      const players = [...f]
        .filter(([, role]) => role)
        .map(([player_id, role]) => ({ player_id, role }));
      if (players.filter((p) => p.role === "starter").length > 11)
        throw Error("เลือกตัวจริงได้ไม่เกิน 11 คน");
      const { error } = await client.rpc("fm_save_lineup", {
        p_match: m.id,
        p_team: teamId,
        p_players: players,
        p_expected: selected
          .map((l) => ({ player_id: l.player_id, role: l.role }))
          .sort((a, b) => a.player_id.localeCompare(b.player_id)),
      });
      if (error) throw error;
    },
  );
}
function eventEditor(id) {
  const old = db.events.find((e) => e.id === id),
    r = old || {},
    m = match();
  modal(
    "บันทึกเหตุการณ์",
    select(
      "kind",
      "ประเภท",
      Object.entries(kindLabels).map(([id, name]) => ({ id, name })),
      r.kind || "goal",
    ) +
      select(
        "team_id",
        "ทีมของนักเตะ (ทำเข้าตัวเอง เลือกทีมผู้ทำ)",
        [team(m.home_id), team(m.away_id)],
        r.team_id || m.home_id,
      ) +
      `<label>นักเตะ</label><select id="f-player_id" name="player_id"></select><label>ผู้จ่ายแอสซิสต์ (เฉพาะประตู)</label><select id="f-assist_id" name="assist_id"></select><div class="form-row"><div>${input("minute", "นาที", r.minute || 0, "number", 'min="0" max="180" required')}</div><div>${input("added", "ทดเวลา", r.added || 0, "number", 'min="0" max="60" required')}</div></div>`,
    async (f) => {
      const data = Object.fromEntries(f);
      data.match_id = m.id;
      data.minute = Number(data.minute);
      data.added = Number(data.added);
      data.player_id = data.player_id || null;
      data.assist_id = data.kind === "goal" ? data.assist_id || null : null;
      if (data.assist_id && data.assist_id === data.player_id)
        throw Error("ผู้ยิงและผู้จ่ายต้องเป็นคนละคน");
      if (data.assist_id && !data.player_id)
        throw Error("ระบุผู้ยิงก่อนเลือกแอสซิสต์");
      await save("events", data, old);
    },
  );
  const updatePlayers = () => {
    const list = db.players
      .filter((p) =>
        db.lineups.some(
          (l) =>
            l.match_id === m.id &&
            l.team_id === $("#f-team_id").value &&
            l.player_id === p.id,
        ),
      )
      .map((p) => ({ id: p.id, name: `${p.number} ${p.name}` }));
    $("#f-player_id").innerHTML = options(list, r.player_id, "ไม่ระบุผู้ยิง");
    $("#f-assist_id").innerHTML = options(list, r.assist_id, "ไม่มีแอสซิสต์");
  };
  $("#f-team_id").onchange = updatePlayers;
  $("#f-kind").onchange = () => {
    $("#f-assist_id").disabled = $("#f-kind").value !== "goal";
  };
  updatePlayers();
  $("#f-kind").onchange();
}
function download(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function exportOBS() {
  const m = match(),
    s = score(m, db.events),
    output = {
      homeScore: String(s.home),
      awayScore: String(s.away),
      timer: "00:00",
      timerRunning: false,
      period: m.status === "finished" ? "FULL TIME" : "FIRST HALF",
      lineupDisplay: "none",
      showMainDisplay: true,
      showTopDisplay: false,
      exportVersion: 1,
    };
  for (const [side, id] of [
    ["home", m.home_id],
    ["away", m.away_id],
  ]) {
    const t = team(id);
    output[side + "Name"] = t.name;
    output[side + "Coach"] = t.coach;
    output[side + "KitColor"] = side === "home" ? t.home_color : t.away_color;
    output[side + "Players"] = db.lineups
      .filter((l) => l.match_id === m.id && l.team_id === id)
      .map((l) => ({ ...player(l.player_id), status: l.role }));
    output[side + "Logo"] = "";
    if (t.logo_path) {
      const { data, error } = await client.storage
        .from("fm-logos")
        .download(t.logo_path);
      if (error) throw error;
      output[side + "Logo"] = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(data);
      });
    }
  }
  download("obs-match-" + m.id + ".json", output);
}
async function importLegacy(file) {
  if (!file) return;
  const content = JSON.parse(await file.text());
  const list = Array.isArray(content.teams)
    ? content.teams
    : Object.entries(content)
        .filter(([key]) => key.startsWith("rosterLibrary_"))
        .map(([, v]) => v);
  if (!list.length) throw Error("ไม่พบคลังทีมในไฟล์นี้");
  if (!confirm(`นำเข้า ${list.length} ทีม? ทีมชื่อซ้ำจะข้าม`)) return;
  let count = 0;
  for (const t of list) {
    if (!t?.name || !Array.isArray(t.players))
      throw Error("รูปแบบข้อมูลทีมไม่ถูกต้อง");
    if (db.teams.some((old) => old.name === t.name)) continue;
    let path = "";
    if (t.logo?.startsWith("data:image/")) {
      const blob = await (await fetch(t.logo)).blob();
      if (["image/png", "image/jpeg", "image/webp"].includes(blob.type))
        path = await uploadLogo(blob, user.id);
    }
    const payload = {
      name: t.name,
      coach: t.coach || "",
      home_color: /^#[a-f0-9]{6}$/i.test(t.homeKitColor)
        ? t.homeKitColor
        : "#1d4ed8",
      away_color: /^#[a-f0-9]{6}$/i.test(t.awayKitColor)
        ? t.awayKitColor
        : "#dc2626",
      logo_path: path,
    };
    const players = t.players
      .filter((p) => p.name)
      .map((p) => ({
        name: p.name,
        number: String(p.number || ""),
        position: p.position || "",
      }));
    const { data: saved, error } = await client.rpc("fm_import_team", {
      p_team: payload,
      p_players: players,
    });
    if (error) throw error;
    db.teams.push(saved);
    count++;
  }
  await refresh();
  notify(`นำเข้า ${count} ทีมแล้ว`);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b || busy) return;
  const a = b.dataset.action,
    id = b.dataset.id;
  try {
    if (a === "close") {
      $("#modal").close();
      return;
    }
    if (a === "nav") {
      view = id;
      render();
      return;
    }
    if (a === "tab") {
      tab = id;
      render();
      return;
    }
    if (a === "match") {
      matchId = id;
      view = "match";
      tab = "events";
      render();
      return;
    }
    if (a.startsWith("edit-")) {
      edit(a.slice(5), id);
      return;
    }
    if (a === "entries") {
      entryEditor(id);
      return;
    }
    if (a === "schedule") {
      schedule();
      return;
    }
    if (a === "lineup") {
      lineupEditor(id);
      return;
    }
    if (a === "event") {
      eventEditor(id);
      return;
    }
    perform(async () => {
      if (a === "refresh") await refresh();
      if (a === "logout") {
        await client.auth.signOut();
        location.reload();
      }
      if (
        a === "delete-event" &&
        confirm("ลบเหตุการณ์นี้? สกอร์และสถิติจะคำนวณใหม่")
      ) {
        await remove(
          "events",
          db.events.find((e) => e.id === id),
        );
        await refresh();
      }
      if (a === "backup")
        download(
          "football-data-" + new Date().toISOString().slice(0, 10) + ".json",
          db,
        );
      if (a === "obs") await exportOBS();
      if (a === "import") {
        const picker = document.createElement("input");
        picker.type = "file";
        picker.accept = ".json";
        picker.onchange = () => perform(() => importLegacy(picker.files[0]));
        picker.click();
      }
    });
  } catch (error) {
    notify(message(error), true);
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "competition-filter") {
    competition = e.target.value;
    render();
  }
});
function login() {
  const setup = !client;
  $("#app").innerHTML =
    `<div class="auth panel"><div class="brand">สนาม<span style="color:#199369">.</span></div><h2>${setup ? "เชื่อมต่อฐานข้อมูล" : "เข้าสู่ระบบจัดการแข่งขัน"}</h2><p>${setup ? "ใส่ Project URL และ Publishable key จาก Supabase หลังติดตั้งตารางตามคู่มือ" : "ใช้บัญชีเดียวกันบนคอมและมือถือเพื่อจัดการข้อมูลชุดเดียวกัน"}</p><form id="auth-form">${setup ? input("url", "Supabase Project URL", "", "url", "required") + input("key", "Publishable key", "", "text", "required") : input("email", "อีเมล", "", "email", 'required autocomplete="username"') + input("password", "รหัสผ่าน", "", "password", 'required autocomplete="current-password"')}<button type="submit" class="primary">${setup ? "บันทึกการเชื่อมต่อ" : "เข้าสู่ระบบ"}</button><p class="auth-error" id="auth-error"></p></form><small>${setup ? "ห้ามใช้ service-role หรือ secret key ในหน้าเว็บ" : "บัญชีผู้ใช้สร้างผ่าน Supabase Authentication โดยผู้ดูแล"}</small></div>`;
  $("#auth-form").onsubmit = (e) => {
    e.preventDefault();
    perform(async () => {
      const f = new FormData(e.target);
      if (setup) configure(f.get("url").trim(), f.get("key").trim());
      else {
        const { data, error } = await client.auth.signInWithPassword({
          email: f.get("email").trim(),
          password: f.get("password"),
        });
        if (error) {
          const reasons = {
            invalid_credentials: "อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือยังไม่มีบัญชีในระบบนี้ ให้ผู้ดูแลตรวจใน Supabase → Authentication → Users (บัญชีเข้าเว็บ Supabase/GitHub ไม่ใช่บัญชีของระบบนี้)",
            email_not_confirmed: "บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ",
            user_banned: "บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแล",
            over_request_rate_limit: "ลองเข้าสู่ระบบถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
          };
          const detail = reasons[error.code] ||
            (error.status === 429 ? "ลองเข้าสู่ระบบถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" :
              error.name === "AuthRetryableFetchError" ? "เชื่อมต่อบริการเข้าสู่ระบบไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่" :
              "บริการเข้าสู่ระบบขัดข้อง กรุณาแจ้งรหัสข้อผิดพลาดด้านล่างแก่ผู้ดูแล");
          $("#auth-error").textContent = detail + " [" + (error.code || error.name || "auth_error") + "]";
          return;
        }
        user = data.user;
        await refresh();
        startPolling();
      }
    });
  };
}
function startPolling() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!busy && !document.hidden && !$("#modal").open) refresh(true);
  }, 8000);
}
async function start() {
  if (!client) {
    login();
    return;
  }
  const { data } = await client.auth.getSession();
  user = data.session?.user;
  if (!user) {
    login();
    return;
  }
  try {
    await refresh();
    startPolling();
  } catch (e) {
    render();
    notify("โหลดฐานข้อมูลไม่สำเร็จ: " + message(e), true);
  }
  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      user = null;
      clearInterval(timer);
      login();
    }
  });
}
start();
