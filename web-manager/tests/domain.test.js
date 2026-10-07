import { test } from "node:test";
import assert from "node:assert/strict";
import { score, standings, playerStats, roundRobin } from "../src/domain.js";
const teams = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
];
const m = {
  id: "m",
  competition_id: "cup",
  home_id: "a",
  away_id: "b",
  status: "finished",
};
const events = [
  { match_id: "m", team_id: "a", kind: "goal", player_id: "p", assist_id: "q" },
  { match_id: "m", team_id: "b", kind: "own_goal", player_id: "r" },
  { match_id: "m", team_id: "a", kind: "yellow", player_id: "p" },
  { match_id: "m", team_id: "a", kind: "second_yellow", player_id: "p" },
];
test("goal, assist, own goal, second yellow and excluded cancelled matches", () => {
  assert.deepEqual(score(m, events), { home: 2, away: 0 });
  const players = ["p", "q", "r"].map((id) => ({ id, name: id }));
  const stats = playerStats(players, [m], events, "cup");
  assert.equal(stats.find((p) => p.id === "p").goals, 1);
  assert.equal(stats.find((p) => p.id === "q").assists, 1);
  assert.equal(stats.find((p) => p.id === "p").yellow, 2);
  assert.equal(stats.find((p) => p.id === "p").red, 1);
  assert.equal(stats.find((p) => p.id === "r").goals, 0);
  assert.equal(stats.find((p) => p.id === "r").own_goals, 1);
  assert.ok(
    playerStats(players, [{ ...m, status: "cancelled" }], events).every(
      (p) => p.goals === 0 && p.assists === 0,
    ),
  );
});
test("standings include only completed matches and respect competition points", () => {
  const c = { id: "cup", win_points: 3, draw_points: 1, loss_points: 0 };
  const rows = standings(
    c,
    teams,
    [m, { ...m, id: "live", status: "live" }],
    events,
  );
  assert.equal(rows[0].id, "a");
  assert.equal(rows[0].points, 3);
  assert.equal(rows[0].played, 1);
  assert.equal(rows[0].gf, 2);
  assert.equal(rows.find((r) => r.id === "b").ga, 2);
  assert.equal(rows.find((r) => r.id === "c").played, 0);
  const afterDelete = standings(c, teams, [m], []);
  assert.equal(afterDelete[0].points, 1);
});
test("round robin even/odd teams: each pairing once, no self matches, balanced rounds, double leg reversed", () => {
  for (let count = 2; count <= 10; count++) {
    const ids = Array.from({ length: count }, (_, i) => String(i));
    const schedule = roundRobin(ids);
    assert.equal(schedule.length, (count * (count - 1)) / 2);
    assert.equal(
      new Set(schedule.map((m) => [m.home_id, m.away_id].sort().join(":")))
        .size,
      schedule.length,
    );
    for (const round of new Set(schedule.map((m) => m.round))) {
      const used = schedule
        .filter((m) => m.round === round)
        .flatMap((m) => [m.home_id, m.away_id]);
      assert.equal(new Set(used).size, used.length);
    }
    const twice = roundRobin(ids, true);
    assert.equal(twice.length, schedule.length * 2);
    assert.equal(twice[schedule.length].home_id, schedule[0].away_id);
  }
  assert.throws(() => roundRobin(["a", "a"]));
});
