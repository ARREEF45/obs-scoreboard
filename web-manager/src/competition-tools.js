import {
  formats,
  competitionLabel,
  initialSchedule,
  knockout,
  groupTables,
} from "./tournaments.js";
import { score } from "./domain.js";
export function competitionTools({
  getDB,
  client,
  modal,
  input,
  select,
  escape,
  button,
}) {
  const rpc = async (name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      if (error.code === "PGRST202")
        throw Error(
          "กรุณาติดตั้ง SQL 005_competition_structure.sql ก่อนใช้โครงสร้างการแข่งขัน",
        );
      throw error;
    }
    return data;
  };
  const label = (c) => competitionLabel(c);
  const choices = () =>
    getDB().competitions.map((c) => ({ ...c, name: label(c) }));
  function fields(r) {
    return (
      "<fieldset><legend>โครงสร้างการแข่งขัน</legend>" +
      select(
        "recurrence",
        "ลักษณะรายการ",
        [
          { id: "once", name: "จัดครั้งเดียว" },
          { id: "recurring", name: "จัดต่อเนื่องหลายฤดูกาล" },
        ],
        r.series_key ? "recurring" : "once",
      ) +
      `<label>อยู่ภายใต้รายการ / ฤดูกาล</label><select name="parent_id"><option value="">เป็นรายการหลัก</option>${choices()
        .filter((c) => c.id !== r.id)
        .map(
          (c) =>
            `<option value="${c.id}" ${c.id === r.parent_id ? "selected" : ""}>${escape(c.name)}</option>`,
        )
        .join("")}</select>` +
      select(
        "format",
        "รูปแบบการแข่งขัน",
        Object.entries(formats).map(([id, name]) => ({ id, name })),
        r.format || "league",
      ) +
      input(
        "group_count",
        "จำนวนกลุ่ม (สำหรับแบ่งกลุ่ม)",
        r.group_count || 2,
        "number",
        'min="2" max="64" required',
      ) +
      input("starts_on", "วันเริ่ม", r.starts_on || "", "date") +
      input("ends_on", "วันสิ้นสุด", r.ends_on || "", "date") +
      `<label>ส่งทีมที่ผ่านไปยังรายการ / รอบ</label><select name="advance_to"><option value="">ยังไม่กำหนด / รอบสุดท้าย</option>${choices()
        .filter((c) => c.id !== r.id)
        .map(
          (c) =>
            `<option value="${c.id}" ${c.id === r.advance_to ? "selected" : ""}>${escape(c.name)}</option>`,
        )
        .join("")}</select>` +
      input(
        "advance_count",
        "จำนวนทีมที่ผ่านไปยังรอบปลายทาง",
        r.advance_count || 1,
        "number",
        'min="1" max="128" required',
      ) +
      `<label for="qualification-rules">กติกา / เงื่อนไขผ่านเข้ารอบ</label><textarea id="qualification-rules" name="qualification_rules" maxlength="5000" rows="4">${escape(r.qualification_rules||'')}</textarea><p class="form-help">ระบุเงื่อนไข เช่น อันดับ 1–2 ผ่าน หากคะแนนเท่ากันใช้เฮดทูเฮด ผู้จัดตรวจและยืนยันตามกติกานี้ ข้อความจะเผยแพร่เมื่อเปิดรายการสาธารณะ</p>`+
      '<p class="form-help">ตัวอย่าง: IFC LEAGUE 2569 → รอบจังหวัดสงขลา / รอบจังหวัดปัตตานี / Champions League แล้วกำหนดให้แต่ละจังหวัดส่งทีมไป Champions League การผ่านเข้ารอบต้องให้ผู้จัดยืนยันก่อน</p></fieldset>'
    );
  }
  function payload(data, r) {
    const parent = getDB().competitions.find((c) => c.id === data.parent_id);
    data.series_key =
      data.recurrence === "recurring" && !parent
        ? r.series_key || crypto.randomUUID()
        : null;
    delete data.recurrence;
    data.parent_id = data.parent_id || null;
    data.advance_to = data.advance_to || null;
    if (parent) data.season = parent.season;
    if (data.series_key && !data.season.trim())
      throw Error("ระบุฤดูกาล / ปีที่จัด สำหรับรายการต่อเนื่อง");
    data.starts_on = data.starts_on || null;
    data.ends_on = data.ends_on || null;
    if (data.starts_on && data.ends_on && data.ends_on < data.starts_on)
      throw Error("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
    data.group_count = Number(data.group_count);
    data.advance_count = Number(data.advance_count);
    return data;
  }
  function extra(c) {
    const db = getDB(),
      parent = db.competitions.find((x) => x.id === c.parent_id),
      destination = db.competitions.find((x) => x.id === c.advance_to);
    return `<p>${escape(formats[c.format] || formats.league)} · ${c.series_key ? "ต่อเนื่องหลายฤดูกาล" : c.parent_id ? "รอบย่อย" : "รายการครั้งเดียว"}</p>${parent ? `<p>ภายใต้ ${escape(label(parent))}</p>` : ""}${destination ? `<p>ผ่าน ${c.advance_count} ทีม → ${escape(label(destination))}</p>` : ""}<div class="actions">${button("เพิ่มรอบ / จังหวัด", "child-competition", c.id)}${!c.parent_id ? button("สร้างฤดูกาลใหม่", "copy-season", c.id) : ""}${destination ? button("ยืนยันทีมผ่านเข้ารอบ", "advance-teams", c.id) : ""}</div>`;
  }
  function copy(id) {
    const c = getDB().competitions.find((c) => c.id === id);
    modal(
      "สร้างฤดูกาลใหม่ · " + c.name,
      input("season", "ฤดูกาล / ปีใหม่", "", "text", "required") +
        '<label><input type="checkbox" name="teams"> คัดลอกทีมที่เข้าร่วมทุกระดับ</label><p>คัดลอกโครงสร้างและเงื่อนไขเข้ารอบ ผลการแข่งขัน โปรแกรม สถิติ และการเปิดเผยสาธารณะเริ่มใหม่</p>',
      (f) =>
        rpc("fm_copy_season", {
          p_id: id,
          p_season: f.get("season"),
          p_copy_teams: f.has("teams"),
        }),
    );
  }
  function advance(id) {
    const db = getDB(),
      c = db.competitions.find((c) => c.id === id),
      entries = db.entries.filter((e) => e.competition_id === id);
    modal(
      "ยืนยันทีมผ่านเข้ารอบ",
      `<p>เลือก ${c.advance_count} ทีม ผู้จัดตรวจผลและเกณฑ์ตัดสินก่อนยืนยัน</p><p style="white-space:pre-wrap">${escape(c.qualification_rules||'')}</p>` +
        entries
          .map(
            (e) =>
              `<label><input type="checkbox" name="teams" value="${e.team_id}"> ${escape(db.teams.find((t) => t.id === e.team_id)?.name)}</label>`,
          )
          .join(""),
      (f) =>
        rpc("fm_advance_teams", {
          p_source: id,
          p_version: c.version,
          p_teams: f.getAll("teams"),
        }),
    );
  }
  function schedule(id) {
    const db = getDB(),
      c = db.competitions.find((c) => c.id === id);
    if (!c) throw Error("เลือกรายการแข่งขันก่อน");
    const games = db.matches.filter((m) => m.competition_id === id),
      ids = db.entries
        .filter((e) => e.competition_id === id)
        .map((e) => e.team_id),
      state = c.tournament_state || {};
    const name = (id) => db.teams.find((t) => t.id === id)?.name || id;
    if (ids.length < 2) throw Error("ลงทะเบียนอย่างน้อย 2 ทีมก่อน");
    if (games.length && !state.phase)
      throw Error("รายการนี้มีโปรแกรมที่จัดเองแล้ว กรุณาเพิ่มคู่แข่งขันเอง");
    if (state.phase === "league")
      throw Error("สร้างโปรแกรมลีกแล้ว สามารถแก้ไขแต่ละนัดได้");
    let additional = "",
      latest = [],
      tables = [];
    if (state.phase === "knockout") {
      latest = games.filter(
        (m) => m.stage === "knockout" && m.round === state.round,
      );
      if (latest.some((m) => m.status !== "finished"))
        throw Error("บันทึกผลให้ครบทุกคู่ของรอบล่าสุดก่อน");
      if (latest.length === 1 && !state.byes?.length)
        throw Error("ถึงรอบชิงชนะเลิศแล้ว ไม่มีรอบถัดไป");
      additional =
        "<h3>ยืนยันผู้ชนะของรอบล่าสุด</h3>" +
        latest
          .map((m) => {
            const s = score(m, db.events);
            return select(
              "winner-" + m.id,
              `${escape(name(m.home_id))} ${s.home} : ${s.away} ${escape(name(m.away_id))}`,
              [m.home_id, m.away_id].map((id) => ({ id, name: name(id) })),
              s.home === s.away ? "" : s.home > s.away ? m.home_id : m.away_id,
            );
          })
          .join("") +
        "<p>หากเสมอ ให้เลือกผู้ชนะหลังต่อเวลาหรือจุดโทษตามกติกา</p>";
    } else if (state.phase === "group") {
      if (games.some((m) => m.status !== "finished"))
        throw Error("บันทึกผลรอบแบ่งกลุ่มให้ครบก่อน");
      tables = groupTables(c, db.teams, games, db.events);
      additional =
        "<h3>เลือกทีมเข้ารอบน็อกเอาต์</h3><p>เลือกจำนวนทีมจากแต่ละกลุ่มได้เอง ตรวจเกณฑ์กรณีคะแนนเท่ากันก่อนยืนยัน</p>" +
        tables
          .map(
            (g, gi) =>
              `<fieldset><legend>กลุ่ม ${escape(g.name)}</legend>${g.rows.map((t, i) => `<label><input type="checkbox" name="qualified" value="${t.id}" ${i < 2 ? "checked" : ""}> ${i + 1}. ${escape(t.name)} (${t.points} คะแนน)</label>${input("seed-" + t.id, "ลำดับจัดคู่", ids.indexOf(t.id) + 1, "number", 'min="1" required')}`).join("")}</fieldset>`,
          )
          .join("");
    } else if (c.format === "groups") {
      additional =
        "<h3>กำหนดกลุ่มของแต่ละทีม</h3>" +
        ids
          .map((id, i) =>
            select(
              "group-" + id,
              escape(name(id)),
              Array.from({ length: c.group_count }, (_, j) => ({
                id: String(j + 1),
                name: "กลุ่ม " + (j + 1),
              })),
              String((i % c.group_count) + 1),
            ),
          )
          .join("");
    } else if (!state.phase && c.format === "knockout") {
      additional =
        "<h3>กำหนดลำดับจัดคู่ / สิทธิ์ผ่านรอบแรก</h3>" +
        ids
          .map((id, i) =>
            input(
              "seed-" + id,
              escape(name(id)),
              i + 1,
              "number",
              'min="1" required',
            ),
          )
          .join("");
    }
    function planFrom(f) {
      const ordered = (selected) => {
        const values = selected.map((id) => Number(f.get("seed-" + id)));
        if (
          values.some((v) => !Number.isInteger(v) || v < 1) ||
          new Set(values).size !== values.length
        )
          throw Error("กำหนดลำดับจัดคู่เป็นจำนวนเต็มที่ไม่ซ้ำกัน");
        return [...selected].sort(
          (a, b) => Number(f.get("seed-" + a)) - Number(f.get("seed-" + b)),
        );
      };
      let plan;
      if (state.phase === "knockout")
        plan = knockout(
          [
            ...(state.byes || []),
            ...latest.map((m) => f.get("winner-" + m.id)),
          ],
          state.round + 1,
        );
      else if (state.phase === "group")
        plan = knockout(ordered(f.getAll("qualified")), state.round + 1);
      else
        plan = initialSchedule(
          c,
          c.format === "knockout" ? ordered(ids) : ids,
          f.has("double"),
          Object.fromEntries(ids.map((id) => [id, f.get("group-" + id)])),
        );
      return plan;
    }
    modal(
      "สร้างโปรแกรม · " + (formats[c.format] || formats.league),
      additional +
        input(
          "start",
          "วันเวลาเริ่ม (ประเทศไทย)",
          "",
          "datetime-local",
          "required",
        ) +
        input("gap", "จำนวนวันระหว่างรอบ", 7, "number", 'min="1" required') +
        input("venue", "สนาม") +
        (!state.phase && c.format !== "knockout"
          ? '<label><input name="double" type="checkbox"> พบกันเหย้า–เยือน</label>'
          : "") +
        '<p>ลำดับแรกได้รับสิทธิ์ผ่านรอบแรกเมื่อจำนวนทีมไม่ลงตัว นัดในรอบเดียวกันเริ่มเวลาเดียวกัน แก้เวลาแต่ละคู่ได้หลังสร้าง</p><div id="schedule-preview" aria-live="polite"></div>',
      async (f) => {
        const plan = planFrom(f);
        const start = new Date(f.get("start") + ":00+07:00").getTime(),
          first = Math.min(...plan.rows.map((m) => m.round));
        const rows = plan.rows.map((m) => ({
          ...m,
          kickoff: new Date(
            start + (m.round - first) * Number(f.get("gap")) * 86400000,
          ).toISOString(),
          venue: f.get("venue"),
        }));
        await rpc("fm_save_schedule", {
          p_id: id,
          p_version: c.version,
          p_rows: rows,
          p_state: plan.state,
        });
      },
    );
    const form = document.querySelector("#modal-form"),
      preview = document.querySelector("#schedule-preview");
    const show = () => {
      try {
        const plan = planFrom(new FormData(form));
        preview.innerHTML =
          "<h3>ตรวจคู่แข่งขันก่อนบันทึก</h3>" +
          plan.rows
            .map(
              (m) =>
                `<p>รอบ ${m.round}${m.group_name ? " · กลุ่ม " + escape(m.group_name) : ""}: ${escape(name(m.home_id))} — ${escape(name(m.away_id))}</p>`,
            )
            .join("") +
          (plan.state.byes.length
            ? "<p>ผ่านรอบแรก: " +
              plan.state.byes.map((id) => escape(name(id))).join(", ") +
              "</p>"
            : "");
      } catch (e) {
        preview.textContent = e.message;
      }
    };
    form.addEventListener("input", show);
    form.addEventListener("change", show);
    show();
  }
  return { fields, payload, extra, copy, advance, schedule };
}
