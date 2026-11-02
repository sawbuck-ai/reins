import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aggregateCues, harvest } from "../wizard.mjs";

test("aggregateCues: clusters, counts, and ranks by session spread then gen", () => {
  const items = [
    { session: "A", result: { steer: true, axis: "rigor", magnitude: "refine", generalizable: true, cue: "verify before done" } },
    { session: "B", result: { steer: true, axis: "rigor", magnitude: "refine", generalizable: true, cue: "verify before done" } },
    { session: "A", result: { steer: true, axis: "scope", magnitude: "redirect", generalizable: true, cue: "keep it small" } },
    { session: "A", result: { steer: true, axis: "scope", magnitude: "redirect", generalizable: false, cue: "keep it small" } },
    { session: "A", result: { steer: false, axis: "other", magnitude: "refine", generalizable: false, cue: "" } },
    { session: "A", result: null },
  ];
  const r = aggregateCues(items);
  assert.equal(r.scored, 5);    // 5 non-null results
  assert.equal(r.fails, 1);     // 1 null (judge failure)
  assert.equal(r.steers, 4);    // 4 are steers
  assert.equal(r.cues.length, 2);
  // "verify before done" spans 2 sessions, so it ranks above "keep it small" (1 session)
  assert.equal(r.cues[0].cue, "verify before done");
  assert.equal(r.cues[0].sessions, 2);
  assert.equal(r.cues[0].count, 2);
  assert.equal(r.cues[1].cue, "keep it small");
  assert.equal(r.cues[1].count, 2);
  assert.equal(r.cues[1].gen, 1);          // one of two was generalizable
  assert.equal(r.cues[1].genShare, 0.5);
});

test("aggregateCues: empty input is clean, not a crash", () => {
  const r = aggregateCues([]);
  assert.equal(r.scored, 0); assert.equal(r.steers, 0); assert.equal(r.cues.length, 0); assert.equal(r.steerRate, 0);
});

test("harvest: reads pairs from a session file and scores with the injected fn", async () => {
  const d = mkdtempSync(join(tmpdir(), "reins-wiz-"));
  const f = join(d, "s.jsonl");
  // minimal transcript: opener (skipped), an agent turn, then a steering user reply
  const lines = [
    { type: "user", message: { role: "user", content: "build the thing" } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "I built it with approach X." }] } },
    { type: "user", message: { role: "user", content: "no, verify it actually works first" } },
  ].map((o) => JSON.stringify(o));
  writeFileSync(f, lines.join("\n") + "\n");
  const fake = async (prior, user) => ({ steer: /verify/.test(user), axis: "rigor", magnitude: "refine", generalizable: true, cue: "verify first" });
  const r = await harvest(fake, { sessions: [f], maxPairs: 100 });
  assert.equal(r.pairs, 1);              // one post-opener pair
  assert.equal(r.sessionsRead, 1);
  assert.equal(r.steers, 1);
  assert.equal(r.cues[0].cue, "verify first");
  rmSync(d, { recursive: true, force: true });
});

test("harvest: maxPairs caps the work", async () => {
  const d = mkdtempSync(join(tmpdir(), "reins-wiz-"));
  const f = join(d, "s.jsonl");
  const lines = [{ type: "user", message: { role: "user", content: "start" } }];
  for (let i = 0; i < 10; i++) {
    lines.push({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "did " + i }] } });
    lines.push({ type: "user", message: { role: "user", content: "change " + i } });
  }
  writeFileSync(f, lines.map((o) => JSON.stringify(o)).join("\n") + "\n");
  let calls = 0;
  const fake = async () => { calls++; return { steer: true, axis: "scope", magnitude: "refine", generalizable: false, cue: "c" }; };
  const r = await harvest(fake, { sessions: [f], maxPairs: 3 });
  assert.equal(r.pairs, 3);
  assert.equal(calls, 3);
  rmSync(d, { recursive: true, force: true });
});
