// Local Supabase-compatible transport over real PostgreSQL (PGlite).
// This test never connects to a user's Supabase project.
import { PGlite } from "@electric-sql/pglite";
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const db = new PGlite(),
  owner = "00000000-0000-4000-8000-000000000001";
await db.exec(
  `create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${owner}');`,
);
await db.exec(
  fs.readFileSync("supabase/migrations/001_football_manager.sql", "utf8"),
);
await db.exec(fs.readFileSync('supabase/migrations/003_broadcast_results.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/004_public_competitions.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/005_competition_structure.sql','utf8'));
await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
const seeded = await db.query(
  "insert into fm_teams(name) values('Bangkok FC'),('South United') returning *",
);
const [home, away] = seeded.rows;
await db.query(
  "insert into fm_players(team_id,name,number) values($1,'Striker','9'),($1,'Playmaker','10'),($2,'Defender','5')",
  [home.id, away.id],
);
const {
  rows: [cup],
} = await db.query(
  "insert into fm_competitions(name) values('Test Cup') returning *",
);
await db.query(
  "insert into fm_entries(competition_id,team_id) values($1,$2),($1,$3)",
  [cup.id, home.id, away.id],
);
const {
  rows: [fixture],
} = await db.query(
  "insert into fm_matches(competition_id,home_id,away_id,status) values($1,$2,$3,$4) returning *",
  [cup.id, home.id, away.id, "live"],
);
let browser;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const route = url.pathname;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,DELETE,OPTIONS",
  );
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }
  try {
    if (route.startsWith("/auth/v1/")) {
      const payload = {
        sub: owner,
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const token =
        Buffer.from("{}").toString("base64url") +
        "." +
        Buffer.from(JSON.stringify(payload)).toString("base64url") +
        ".test";
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          access_token: token,
          refresh_token: "test-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user: {
            id: owner,
            email: "admin@test.local",
            aud: "authenticated",
            role: "authenticated",
          },
        }),
      );
      return;
    }
    if (route.startsWith("/rest/v1/")) {
      let text = "";
      for await (const chunk of req) text += chunk;
      const body = text ? JSON.parse(text) : null;
      let rows;
      if (route.includes("/rpc/")) {
        const name = path.basename(route);
        assert.ok(["fm_save_lineup", "fm_import_team", "fm_copy_season", "fm_save_schedule", "fm_advance_teams"].includes(name));
        const names = Object.keys(body);
        const args = names.map((name, i) => `${name} := $${i + 1}`).join(",");
        rows = (
          await db.query(
            `select public.${name}(${args})`,
            Object.values(body).map((v) =>
              typeof v === "object" && !(name==='fm_advance_teams'&&Array.isArray(v)) ? JSON.stringify(v) : v,
            ),
          )
        ).rows;
      } else {
        const table = path.basename(route);
        assert.match(
          table,
          /^fm_(teams|players|entries|competitions|matches|lineups|events)$/,
        );
        const args = [],
          conditions = [];
        for (const [key, value] of url.searchParams) {
          if (["select", "order", "limit", "offset"].includes(key)) continue;
          assert.match(key, /^[a-z_]+$/);
          if (value.startsWith("eq.")) {
            args.push(value.slice(3));
            conditions.push(`${key}=$${args.length}`);
          } else if (value.startsWith("in.(")) {
            const vals = value.slice(4, -1).split(",");
            const terms = vals.map((v) => {
              args.push(v);
              return "$" + args.length;
            });
            conditions.push(`${key} in (${terms.join(",")})`);
          }
        }
        const where = conditions.length
          ? " where " + conditions.join(" and ")
          : "";
        if (req.method === "GET")
          rows = (
            await db.query(
              `select * from ${table}${where} order by id limit ${Number(url.searchParams.get("limit") || 1000)} offset ${Number(url.searchParams.get("offset") || 0)}`,
              args,
            )
          ).rows;
        else if (req.method === "POST")
          rows = await db.transaction(async (tx) => {
            const result = [];
            for (const record of Array.isArray(body) ? body : [body]) {
              const keys = Object.keys(record);
              keys.forEach((k) => assert.match(k, /^[a-z_]+$/));
              result.push(
                ...(
                  await tx.query(
                    `insert into ${table}(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning *`,
                    Object.values(record),
                  )
                ).rows,
              );
            }
            return result;
          });
        else if (req.method === "PATCH") {
          const values = Object.entries(body).map(([key, value]) => {
            assert.match(key, /^[a-z_]+$/);
            args.push(value);
            return `${key}=$${args.length}`;
          });
          rows = (
            await db.query(
              `update ${table} set ${values.join(",")}${where} returning *`,
              args,
            )
          ).rows;
        } else
          rows = (
            await db.query(`delete from ${table}${where} returning *`, args)
          ).rows;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify(
          req.headers.accept?.includes("vnd.pgrst.object") ? rows[0] : rows,
        ),
      );
      return;
    }
    const file = path.resolve("dist", "." + route);
    assert.ok(
      file.startsWith(path.resolve("dist") + path.sep) || route === "/",
    );
    const target = route === "/" ? path.resolve("dist/index.html") : file;
    res.setHeader(
      "Content-Type",
      target.endsWith(".js")
        ? "text/javascript"
        : target.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(fs.readFileSync(target));
  } catch (error) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: error.message, code: error.code }));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const executablePath =
    process.env.BROWSER_PATH ||
    [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ].find(fs.existsSync);
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/fonts.googleapis.com/**", (route) => route.abort());
  await page.route('https://ascxzymhwswfwpjwzcdx.supabase.co/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    const response=await page.request.fetch(base+url.pathname+url.search,{method:req.method(),headers:req.headers(),data:req.postData()||undefined});
    await route.fulfill({response});
  });
  await page.addInitScript(
    (config) =>
      localStorage.setItem("football.cloud.config", JSON.stringify(config)),
    { url: base, key: "sb_publishable_test" },
  );
  await page.goto(base);
  await page.getByLabel("อีเมล").fill("admin@test.local");
  await page.getByLabel("รหัสผ่าน").fill("test-password");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.getByRole("heading", { name: "ภาพรวม", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "โปรแกรมการแข่งขัน", exact: true })
    .click();
  await page.getByRole("button", { name: "เปิดแมตช์", exact: true }).click();
  await page
    .getByRole("button", { name: "ตัวจริง / ตัวสำรอง", exact: true })
    .click();
  await page.getByRole("button", { name: "จัดผู้เล่นนัดนี้" }).first().click();
  const lineup = page.locator("#modal select");
  await lineup.nth(0).selectOption("starter");
  await lineup.nth(1).selectOption("starter");
  await page
    .locator("#modal")
    .getByRole("button", { name: "บันทึก", exact: true })
    .click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "เหตุการณ์ / ผลการแข่งขัน", exact: true })
    .click();
  await page.getByRole("button", { name: "+ บันทึกประตู / ใบ" }).click();
  await page.locator("#f-player_id").selectOption({ label: "9 Striker" });
  await page.locator("#f-assist_id").selectOption({ label: "10 Playmaker" });
  await page.getByLabel("นาที", { exact: true }).fill("23");
  await page
    .locator("#modal")
    .getByRole("button", { name: "บันทึก", exact: true })
    .click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  await page.waitForFunction(()=>document.querySelector('.match-head .score')?.textContent==='1 : 0');
  await page.getByRole("button", { name: "สถิตินักเตะ", exact: true }).click();
  assert.match(await page.locator("tbody").textContent(), /Striker/);
  const striker = page.locator("tr").filter({ hasText: "Striker" });
  assert.equal(await striker.locator("td").nth(2).textContent(), "1");
  const assistant = page.locator("tr").filter({ hasText: "Playmaker" });
  assert.equal(await assistant.locator("td").nth(3).textContent(), "1");
  await page.getByRole("button", { name: "ทีมทั้งหมด", exact: true }).click();
  await page.getByRole("button", { name: "+ เพิ่มทีม", exact: true }).click();
  await page.getByLabel("ชื่อทีม", { exact: true }).fill("New Team");
  await page
    .locator("#modal")
    .getByRole("button", { name: "บันทึก", exact: true })
    .click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "New Team", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "โปรแกรมการแข่งขัน", exact: true })
    .click();
  await page.getByRole("button", { name: "บันทึกผล", exact: true }).click();
  await page.getByLabel('สกอร์ทีมเหย้า',{exact:true}).fill('3');
  await page.getByLabel('สกอร์ทีมเยือน',{exact:true}).fill('2');
  await page.getByLabel("สถานะ", { exact: true }).selectOption("finished");
  await page
    .locator("#modal")
    .getByRole("button", { name: "บันทึก", exact: true })
    .click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "ตารางคะแนน", exact: true }).click();
  await page.locator("#competition-filter").selectOption(cup.id);
  const winner = page.locator("tr").filter({ hasText: "Bangkok FC" });
  assert.equal(await winner.locator("td").last().textContent(), "3");
  fs.mkdirSync("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/standings-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "ทีมทั้งหมด", exact: true }).click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "artifacts/teams-mobile.png", fullPage: true });
  await page.locator('[data-action="nav"][data-id="competitions"]').click();
  await page.locator('[data-action="edit-competitions"][data-id=""]').click();
  await page.locator('#f-name').fill('IFC LEAGUE');
  await page.locator('#f-season').fill('2569');
  await page.locator('#f-recurrence').selectOption('recurring');
  await page.locator('#f-format').selectOption('groups');
  await page.locator('#modal button[type="submit"]').click();
  await page.locator('#modal').waitFor({state:'hidden'});
  const mainCard=page.locator('article').filter({has:page.getByRole('heading',{name:'IFC LEAGUE',exact:true})});
  await mainCard.locator('[data-action="child-competition"]').click();
  await page.locator('#f-name').fill('Province A');
  await page.locator('#f-format').selectOption('knockout');
  await page.locator('#modal button[type="submit"]').click();
  await page.locator('#modal').waitFor({state:'hidden'});
  await page.getByRole('heading',{name:'Province A',exact:true}).waitFor();
  await mainCard.locator('[data-action="copy-season"]').click();
  await page.locator('#f-season').fill('2570');
  await page.locator('#modal button[type="submit"]').click();
  await page.locator('#modal').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelectorAll('[data-action="copy-season"]').length===3);
  assert.equal((await db.query("select * from fm_competitions where name='Province A' and season='2570'")).rows.length,1);
  await page.screenshot({path:'artifacts/competitions-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const province=(await db.query("select * from fm_competitions where name='Province A' and season='2569'")).rows[0];
  await db.query('insert into fm_entries(competition_id,team_id) select $1,id from fm_teams',[province.id]);
  await page.locator('[data-action="refresh"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-action="refresh"]').disabled);
  await page.locator('[data-action="nav"][data-id="matches"]').click();
  await page.locator('#competition-filter').selectOption(province.id);
  await page.locator('[data-action="schedule"]').click();
  assert.equal(await page.locator('#schedule-preview p').count(),2);
  await page.locator('#f-start').fill('2026-11-01T18:00');
  await page.locator('#modal button[type="submit"]').click();
  await page.locator('#modal').waitFor({state:'hidden'});
  await db.query("update fm_matches set status='finished',obs_home_score=2,obs_away_score=1 where competition_id=$1",[province.id]);
  await page.locator('[data-action="refresh"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-action="refresh"]').disabled);
  await page.locator('[data-action="schedule"]').click();
  await page.locator('#f-start').fill('2026-11-08T18:00');
  await page.locator('#modal button[type="submit"]').click();
  await page.locator('#modal').waitFor({state:'hidden'});
  assert.equal((await db.query('select * from fm_matches where competition_id=$1',[province.id])).rows.length,2);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: login, cloud CRUD, lineup, goal + assist, stats, final result standings, responsive mobile, zero browser errors",
  );
} finally {
  await browser?.close();
  server.close();
  await db.close();
}
