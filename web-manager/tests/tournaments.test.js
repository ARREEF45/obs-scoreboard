import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { initialSchedule, knockout, groupTables } from "../src/tournaments.js";
test("knockout byes produce complete elimination trees for 2 through 65 teams", () => {
  for (let n = 2; n <= 65; n++) {
    let ids = Array.from({ length: n }, (_, i) => String(i)),
      count = 0;
    while (ids.length > 1) {
      const p = knockout(ids);
      assert.equal(
        new Set([
          ...p.state.byes,
          ...p.rows.flatMap((m) => [m.home_id, m.away_id]),
        ]).size,
        ids.length,
      );
      count += p.rows.length;
      ids = [...p.state.byes, ...p.rows.map((m) => m.home_id)];
    }
    assert.equal(count, n - 1);
  }
});
test("group fixtures and standings isolate groups and exclude knockout matches", () => {
  const c = {
    id: "c",
    format: "groups",
    group_count: 2,
    win_points: 3,
    draw_points: 1,
    loss_points: 0,
  };
  const plan = initialSchedule(c, ["a", "b", "c", "d"], false, {
    a: "1",
    b: "1",
    c: "2",
    d: "2",
  });
  assert.equal(plan.rows.length, 2);
  const matches = plan.rows.map((m, i) => ({
    ...m,
    id: String(i),
    competition_id: "c",
    status: "finished",
    obs_home_score: 2,
    obs_away_score: 0,
  }));
  matches.push({
    id: "ko",
    competition_id: "c",
    stage: "knockout",
    home_id: "a",
    away_id: "c",
    status: "finished",
    obs_home_score: 9,
    obs_away_score: 0,
  });
  const groups = groupTables(
    c,
    ["a", "b", "c", "d"].map((id) => ({ id, name: id })),
    matches,
    [],
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[0].rows[0].gf, 2);
  assert.throws(() =>
    initialSchedule(c, ["a", "b", "c"], false, { a: "1", b: "1", c: "2" }),
  );
});
test("competition hierarchy, season cloning, qualifiers, atomic scheduling and public metadata", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    for (const f of [
      "001_football_manager.sql",
      "003_broadcast_results.sql",
      "004_public_competitions.sql",
      "005_competition_structure.sql",
    ])
      await db.exec(
        fs.readFileSync(
          new URL("../supabase/migrations/" + f, import.meta.url),
          "utf8",
        ),
      );
    const owner = "00000000-0000-4000-8000-000000000001",
      other = "00000000-0000-4000-8000-000000000002";
    await db.exec(
      `insert into auth.users values('${owner}'),('${other}');set role authenticated;set request.jwt.claim.sub='${owner}'`,
    );
    const root = (
      await db.query(
        "insert into fm_competitions(name,season,series_key) values('IFC','2569',gen_random_uuid()) returning *",
      )
    ).rows[0];
    const province = (
      await db.query(
        "insert into fm_competitions(name,season,parent_id,advance_count) values('Province','2569',$1,2) returning *",
        [root.id],
      )
    ).rows[0];
    const finals = (
      await db.query(
        "insert into fm_competitions(name,season,parent_id,format) values('Champions','2569',$1,'knockout') returning *",
        [root.id],
      )
    ).rows[0];
    await assert.rejects(
      db.query("update fm_competitions set parent_id=$1 where id=$2", [
        province.id,
        root.id,
      ]),
      /Circular/,
    );
    await db.query("update fm_competitions set advance_to=$1 where id=$2", [
      finals.id,
      province.id,
    ]);
    const teams = (
      await db.query(
        "insert into fm_teams(name) values('A'),('B'),('C') returning *",
      )
    ).rows;
    for (const t of teams)
      await db.query(
        "insert into fm_entries(competition_id,team_id) values($1,$2)",
        [province.id, t.id],
      );
    await assert.rejects(
      db.query("select fm_advance_teams($1,2,$2)", [
        province.id,
        teams.slice(0, 2).map((t) => t.id),
      ]),
      /Complete/,
    );
    await db.query(
      "insert into fm_matches(competition_id,home_id,away_id,status) values($1,$2,$3,'finished')",
      [province.id, teams[0].id, teams[1].id],
    );
    await assert.rejects(
      db.query("select fm_advance_teams($1,2,$2)", [
        province.id,
        [teams[0].id],
      ]),
      /count/,
    );
    await db.query("select fm_advance_teams($1,2,$2)", [
      province.id,
      teams.slice(0, 2).map((t) => t.id),
    ]);
    assert.equal(
      (
        await db.query("select * from fm_entries where competition_id=$1", [
          finals.id,
        ])
      ).rows.length,
      2,
    );
    const rows = [
      {
        home_id: teams[0].id,
        away_id: teams[1].id,
        round: 1,
        stage: "knockout",
        kickoff: null,
      },
    ];
    await db.query("select fm_save_schedule($1,1,$2,$3)", [
      finals.id,
      JSON.stringify(rows),
      JSON.stringify({ phase: "knockout", round: 1, byes: [] }),
    ]);
    await assert.rejects(
      db.query("select fm_save_schedule($1,1,$2,$3)", [
        finals.id,
        JSON.stringify(rows),
        JSON.stringify({ phase: "knockout", round: 1 }),
      ]),
      /changed/,
    );
    await assert.rejects(
      db.query("update fm_competitions set format='league' where id=$1", [
        finals.id,
      ]),
      /structure/,
    );
    const copied = (
      await db.query("select fm_copy_season($1,'2570',true) as id", [root.id])
    ).rows[0].id;
    const children = (
      await db.query("select * from fm_competitions where parent_id=$1", [
        copied,
      ])
    ).rows;
    assert.equal(children.length, 2);
    assert.equal(
      children.find((c) => c.name === "Province").advance_to,
      children.find((c) => c.name === "Champions").id,
    );
    assert.equal(
      (
        await db.query(
          "select * from fm_matches where competition_id=any($1::uuid[])",
          [children.map((c) => c.id)],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      children.every(
        (c) => !c.is_public && Object.keys(c.tournament_state).length === 0,
      ),
      true,
    );
    await assert.rejects(
      db.query("select fm_copy_season($1,'2570',false)", [root.id]),
      /unique/,
    );
    await db.query("select fm_set_public_competition($1,true,'{}')", [
      finals.id,
    ]);
    await db.exec("set role anon");
    const pub = (
      await db.query("select fm_public_competition($1) as data", [finals.id])
    ).rows[0].data;
    assert.equal(pub.competition.format, "knockout");
    assert.equal(pub.matches[0].stage, "knockout");
    assert.equal(JSON.stringify(pub).includes("owner_id"), false);
    await assert.rejects(
      db.query("select fm_copy_season($1,'2571',false)", [root.id]),
      /permission/,
    );
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${other}'`,
    );
    await assert.rejects(
      db.query("select fm_copy_season($1,'2571',false)", [root.id]),
      /Choose/,
    );
  } finally {
    await db.close();
  }
});
