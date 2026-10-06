import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("PostgreSQL schema, RLS, participant constraints, lineup transactions, stale edits, atomic import", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/001_football_manager.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const owner = "00000000-0000-4000-8000-000000000001",
      other = "00000000-0000-4000-8000-000000000002";
    await db.query("insert into auth.users values($1),($2)", [owner, other]);
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${owner}';`,
    );
    const insert = async (table, data) => {
      const keys = Object.keys(data);
      const result = await db.query(
        `insert into public.${table}(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning *`,
        Object.values(data),
      );
      return result.rows[0];
    };
    const a = await insert("fm_teams", { name: "A" }),
      b = await insert("fm_teams", { name: "B" }),
      c = await insert("fm_competitions", { name: "Cup" });
    await insert("fm_entries", { competition_id: c.id, team_id: a.id });
    await insert("fm_entries", { competition_id: c.id, team_id: b.id });
    const m = await insert("fm_matches", {
      competition_id: c.id,
      home_id: a.id,
      away_id: b.id,
    });
    await assert.rejects(
      insert("fm_matches", {
        competition_id: c.id,
        home_id: a.id,
        away_id: a.id,
      }),
      /check constraint/,
    );
    await assert.rejects(
      insert("fm_matches", {
        competition_id: c.id,
        home_id: a.id,
        away_id: b.id,
      }),
      /unique constraint/,
    );
    const players = [];
    for (let i = 0; i < 12; i++)
      players.push(
        await insert("fm_players", { team_id: a.id, name: "Player " + i }),
      );
    const away = await insert("fm_players", { team_id: b.id, name: "Away" });
    const lineup = players
      .slice(0, 11)
      .map((p) => ({ player_id: p.id, role: "starter" }));
    await db.query("select public.fm_save_lineup($1,$2,$3,$4)", [
      m.id,
      a.id,
      JSON.stringify(lineup),
      "[]",
    ]);
    await assert.rejects(
      insert("fm_lineups", {
        match_id: m.id,
        team_id: a.id,
        player_id: players[11].id,
        role: "starter",
      }),
      /Maximum 11/,
    );
    await assert.rejects(
      db.query("select public.fm_save_lineup($1,$2,$3,$4)", [
        m.id,
        a.id,
        "[]",
        "[]",
      ]),
      /another device/,
    );
    const selected = (
      await db.query(
        "select player_id,role from fm_lineups where team_id=$1 order by player_id",
        [a.id],
      )
    ).rows;
    await assert.rejects(
      db.query("select public.fm_save_lineup($1,$2,$3,$4)", [
        m.id,
        a.id,
        JSON.stringify([
          ...lineup,
          { player_id: players[11].id, role: "starter" },
        ]),
        JSON.stringify(selected),
      ]),
      /Maximum 11/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from fm_lineups where role='starter'",
        )
      ).rows[0].n,
      11,
      "failed save rolls back all role changes",
    );
    await insert("fm_lineups", {
      match_id: m.id,
      team_id: b.id,
      player_id: away.id,
      role: "starter",
    });
    const goal = await insert("fm_events", {
      match_id: m.id,
      team_id: a.id,
      kind: "goal",
      player_id: players[0].id,
      assist_id: players[1].id,
    });
    await assert.rejects(
      insert("fm_events", {
        match_id: m.id,
        team_id: a.id,
        kind: "goal",
        player_id: players[0].id,
        assist_id: away.id,
      }),
      /Assist must belong/,
    );
    await assert.rejects(
      insert("fm_events", {
        match_id: m.id,
        team_id: a.id,
        kind: "goal",
        player_id: players[0].id,
        assist_id: players[0].id,
      }),
      /check constraint/,
    );
    await assert.rejects(
      insert("fm_events", { match_id: m.id, team_id: a.id, kind: "yellow" }),
      /check constraint/,
    );
    await assert.rejects(
      db.query("select public.fm_save_lineup($1,$2,$3,$4)", [
        m.id,
        a.id,
        "[]",
        JSON.stringify(selected),
      ]),
      /foreign key/,
    );
    await db.query("update fm_events set minute=10 where id=$1 and version=1", [
      goal.id,
    ]);
    assert.equal(
      (
        await db.query(
          "update fm_events set minute=20 where id=$1 and version=1 returning id",
          [goal.id],
        )
      ).rows.length,
      0,
      "version rejects stale write",
    );
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal(
      (await db.query("select * from fm_teams")).rows.length,
      0,
      "another account cannot read teams",
    );
    await assert.rejects(
      insert("fm_players", { team_id: a.id, name: "Cross-owner" }),
      /foreign key/,
    );
    await assert.rejects(
      insert("fm_teams", { name: "Spoofed", owner_id: owner }),
      /row-level security/,
    );
    assert.equal(
      (
        await db.query("update fm_teams set name=$1 where id=$2 returning id", [
          "Stolen",
          a.id,
        ])
      ).rows.length,
      0,
    );
    await db.exec(`set request.jwt.claim.sub='${owner}'`);
    const payload = {
      name: "Imported",
      coach: "Coach",
      home_color: "#112233",
      away_color: "#445566",
    };
    await assert.rejects(
      db.query("select public.fm_import_team($1,$2)", [
        JSON.stringify(payload),
        JSON.stringify([{ name: "OK" }, { name: "" }]),
      ]),
      /check constraint/,
    );
    assert.equal(
      (await db.query("select * from fm_teams where name='Imported'")).rows
        .length,
      0,
      "failed player import cannot leave partial team",
    );
    await db.query("select public.fm_import_team($1,$2)", [
      JSON.stringify(payload),
      JSON.stringify([{ name: "OK" }]),
    ]);
    assert.equal(
      (await db.query("select * from fm_teams where name='Imported'")).rows
        .length,
      1,
    );
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from fm_teams"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
