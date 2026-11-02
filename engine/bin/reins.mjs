#!/usr/bin/env node
// reins: how much did you steer your agent this session? Reads your Claude Code
// transcript, scores each turn's steering pressure via SAWBUCK_JUDGE, and prints
// the seismograph + distribution. The check guards the turns you did not steer.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import * as claudeHarness from "../scan.mjs";
import * as codexHarness from "../codex.mjs";
import { scan } from "../scan.mjs";
import { score, backend, harvestScore } from "../judge.mjs";
import { harvest, aggregateCues } from "../wizard.mjs";

// show a path relative to the cwd when it lives under it (clean output, no leaked home dir);
// fall back to the absolute path for anything outside the tree.
const rel = (p) => { const r = relative(process.cwd(), p); return r && !r.startsWith("..") ? r : p; };

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
// harness adapter: whose transcripts to read. --harness codex (or SAWBUCK_HARNESS=codex); default Claude Code.
const H = (flag("--harness") || process.env.SAWBUCK_HARNESS) === "codex" ? codexHarness : claudeHarness;

// ---- `reins wizard` / `reins harvest`: read your old chats, rank the cues you keep giving ----
if (argv[0] === "wizard" || argv[0] === "harvest") {
  if (has("--help") || has("-h")) {
    process.stdout.write(`reins wizard: harvest your old Claude Code chats into a cue inventory

Usage: reins wizard [--judge <backend>] [--sessions N] [--max N] [--since DAYS] [--json] [--write [path]] [--yes]

  --sessions N   scan the N most recent sessions (default: all)
  --max N        cap the turn-pairs scored, for cost/time control (default 400)
  --since DAYS   only sessions touched in the last DAYS days
  --judge <b>    ollama:<model> (default, free, local) | haiku | anthropic:<model> | openai:<model>
  --yes          proceed without the confirm on a HOSTED (paid) backend
  --write [path] write the cue inventory (default .sawbuck/cues.json)
  --json         machine-readable output

It reads every turn-pair with a model. On the local ollama default that is free; a hosted backend costs a little.
`);
    process.exit(0);
  }
  if (flag("--judge")) process.env.SAWBUCK_JUDGE = flag("--judge");
  const b = backend();
  const sessionsN = parseInt(flag("--sessions"), 10) || 0;
  const maxPairs = parseInt(flag("--max"), 10) || 400;
  const sinceDays = parseInt(flag("--since"), 10) || 0;
  const sinceMs = sinceDays > 0 ? Date.now() - sinceDays * 86400000 : 0;
  const sessions = H.resolveSessions({ limit: sessionsN, sinceMs });
  if (!sessions.length) { process.stderr.write("reins wizard: no Claude Code sessions found under ~/.claude/projects\n"); process.exit(2); }
  const hosted = !b.startsWith("ollama:");
  if (hosted && !has("--yes")) {
    process.stderr.write(`reins wizard: ${b} is a HOSTED backend and will make up to ${maxPairs} calls (a small cost).\n  re-run with --yes to proceed, or use the free local default (omit --judge).\n`);
    process.exit(2);
  }
  process.stderr.write(`reins wizard: harvesting up to ${maxPairs} turn-pairs from ${sessions.length} session(s) via ${b}${hosted ? " (hosted, paid)" : " (local, free)"}...\n`);
  const rw = await harvest(harvestScore, { sessions, maxPairs, pairsFn: H.pairs });
  const wf = flag("--write");
  const out = wf && !wf.startsWith("--") ? wf : join(process.cwd(), ".sawbuck", "cues.json");
  if (has("--write") || !has("--json")) {
    try { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), backend: b, ...rw }, null, 2) + "\n"); }
    catch { process.stderr.write("reins wizard: could not write " + out + "\n"); }
  }
  if (has("--json")) { process.stdout.write(JSON.stringify({ backend: b, ...rw }, null, 2) + "\n"); process.exit(0); }
  const pct = rw.scored ? Math.round((rw.steers / rw.scored) * 100) : 0;
  process.stdout.write(`\n  reins · wizard   (judge: ${b})\n`);
  process.stdout.write(`  read ${rw.pairs} turn-pairs from ${rw.sessionsRead} session(s) · ${rw.steers} steers (${pct}%)\n`);
  if (rw.axes && rw.axes.length) process.stdout.write(`  you steer most on: ${rw.axes.slice(0, 5).map((a) => `${a.axis} (${a.count})`).join(" · ")}\n`);
  process.stdout.write("\n");
  const top = rw.cues.filter((c) => c.count >= 2 || c.gen > 0).slice(0, 12);
  if (!top.length) { process.stdout.write("  no repeated specific cues yet (the axis fingerprint above is the durable signal) - harvest more with --sessions / --since.\n\n"); process.exit(0); }
  process.stdout.write("  your top cues (candidates from your history, review before trusting):\n");
  for (const c of top) {
    process.stdout.write(`    ${("[" + c.axis + "]").padEnd(13)} ${(c.cue || "(unnamed)").padEnd(34)} · ${c.sessions} sess · gen ${c.genShare} · ${c.count}x\n`);
  }
  process.stdout.write(`\n  wrote ${rel(out)}\n  these are LEADS. Promote the ones that are really you; the check still guards the rest.\n\n`);
  process.exit(0);
}

// ---- `reins cues`: real-time cue inventory. Classify THIS session's turns into the cue
// structure and accumulate .sawbuck/cues.json. --append scores only the new turns since last
// run (the per-turn path), and carries cues across sessions in this repo. One judge call per
// new turn; free on local ollama. The batch cross-session cold-start is `reins wizard`. ----
if (argv[0] === "cues") {
  if (has("--help") || has("-h")) {
    process.stdout.write(`reins cues: accumulate your cue inventory as you work

Usage: reins cues [--append] [--session <path>] [--judge <b>] [--max N] [--json]

  --append    score only the new turns since the last run, merge into .sawbuck/cues.json
              (the per-turn path; carries cues across sessions in this repo)
  --max N     without --append, cap the turns scored (default 400)
  --judge <b> ollama:<model> (default, free, local) | haiku | anthropic:<model> | openai:<model>

Free on the local ollama default. Seed from your whole history once with: reins wizard.
`);
    process.exit(0);
  }
  if (flag("--judge")) process.env.SAWBUCK_JUDGE = flag("--judge");
  const b = backend();
  const sess = H.resolveSessionPath(flag("--session"));
  if (!sess) { process.stderr.write("reins cues: no session transcript found\n"); process.exit(2); }
  let ctext = ""; try { ctext = readFileSync(sess, "utf8"); } catch { process.stderr.write("reins cues: cannot read " + sess + "\n"); process.exit(2); }
  const allC = H.pairs(ctext);
  const cout = join(process.cwd(), ".sawbuck", "cues.json");
  let prior = { session: "", lastPairs: 0, items: [] };
  if (has("--append")) { try { const p = JSON.parse(readFileSync(cout, "utf8")); if (p && Array.isArray(p.items)) prior = { session: p.session || "", lastPairs: p.lastPairs || 0, items: p.items }; } catch { /* fresh */ } }
  const startIdx = has("--append") && prior.session === sess ? Math.min(prior.lastPairs, allC.length) : 0;   // same session = resume; new/changed session = score from its start
  let fresh = allC.slice(startIdx);
  // bounded per call: --append scores at most PER new pairs (oldest-first, so a backlog drains over
  // turns); a full scan caps at --max newest. Keeps the per-turn background call cheap.
  const PER = has("--append") ? 40 : (parseInt(flag("--max"), 10) || 400);
  if (fresh.length > PER) fresh = has("--append") ? fresh.slice(0, PER) : fresh.slice(-PER);
  const consumed = startIdx + fresh.length;
  const items = has("--append") ? prior.items.slice() : [];
  const sid = sess.split("/").pop();
  for (const { prior: a, user: u } of fresh) { let r = null; try { r = await harvestScore(a, u); } catch {} items.push({ session: sid, result: r }); }
  const capped = items.slice(-1500);
  const agg = aggregateCues(capped);
  const rec = { at: new Date().toISOString(), backend: b, session: sess, lastPairs: has("--append") ? consumed : allC.length, pairs: capped.length, ...agg, items: capped };
  try { mkdirSync(dirname(cout), { recursive: true }); writeFileSync(cout, JSON.stringify(rec, null, 2) + "\n"); } catch { process.stderr.write("reins cues: could not write " + cout + "\n"); }
  if (has("--json")) { const { items: _omit, ...pub } = rec; process.stdout.write(JSON.stringify(pub, null, 2) + "\n"); process.exit(0); }
  const top = agg.cues.filter((c) => c.count >= 2 || c.gen > 0).slice(0, 10);
  process.stdout.write(`\n  reins · cues   (judge: ${b})\n  ${agg.steers} steers over ${agg.scored} scored turns\n`);
  if (agg.axes && agg.axes.length) process.stdout.write(`  you steer most on: ${agg.axes.slice(0, 4).map((a) => `${a.axis} (${a.count})`).join(" · ")}\n`);
  if (top.length) { process.stdout.write(`  candidate cues (review before trusting):\n`); for (const c of top) process.stdout.write(`    ${("[" + c.axis + "]").padEnd(12)} ${(c.cue || "(unnamed)").padEnd(32)} · ${c.count}x\n`); }
  process.stdout.write(`  wrote ${rel(cout)}\n\n`);
  process.exit(0);
}

if (has("--help") || has("-h")) {
  process.stdout.write(`reins: measure how much you steer your agent this session

Usage: reins [--session <path.jsonl>] [--judge <backend>] [-n N] [--json] [--write [path]] [--share [--label <term>]]

  --session <path>   a Claude Code transcript (default: your newest session)
  --judge <backend>  override SAWBUCK_JUDGE: ollama:<model> | haiku | anthropic:<model> | openai:<model>
  -n <N>             score only the most recent N turns
  --json             machine-readable output
  --write [path]     also write the summary JSON (default .sawbuck/steer.json) for the
                     offline sawbuck statusline to read - run it on a cadence for a live readout
  --share            print a paste-ready card for posting (LinkedIn / X / Reddit)
  --label <term>     the word for the stat on the share card (default "steer rate";
                     e.g. "yank rate" for a playful channel - keep it neutral for LinkedIn)

  --harness <h>      whose transcripts to read: claude (default) | codex (reads ~/.codex/sessions)

Commands: 'reins wizard' (harvest history into cues), 'reins cues' (the live cue inventory). --help on each.
Backend is SAWBUCK_JUDGE (default ollama:qwen2.5:7b). Local = free + private.
`);
  process.exit(0);
}

if (flag("--judge")) process.env.SAWBUCK_JUDGE = flag("--judge");
const sess = H.resolveSessionPath(flag("--session"));
if (!sess) { process.stderr.write("reins: no session transcript found (pass --session <path.jsonl>)\n"); process.exit(2); }

let text = "";
try { text = readFileSync(sess, "utf8"); } catch { process.stderr.write("reins: cannot read " + sess + "\n"); process.exit(2); }

// --append: incremental, BOUNDED per-turn scoring for the live watcher. Reads the
// prior tally from .sawbuck/steer.json, scores only the NEW turn-pairs since the last
// run, merges, rewrites. One new pair per turn - not a full re-scan (which would be
// quadratic over a session). The sawbuck statusline reads the same steer.json offline.
if (has("--append")) {
  const out = join(process.cwd(), ".sawbuck", "steer.json");
  let prior = { lastPairs: 0, scored: 0, steering: 0, wsum: 0, distribution: { 0: 0, 1: 0, 2: 0, 3: 0 } };
  try {
    const p = JSON.parse(readFileSync(out, "utf8"));
    if (p && p.lastPairs != null) prior = { lastPairs: p.lastPairs, scored: p.scored || 0, steering: p.steering || 0, wsum: p._wsum || 0, distribution: p.distribution || prior.distribution };
  } catch { /* no prior tally = fresh */ }
  const all = H.pairs(text);
  let added = 0;
  // bounded per call (graceful): at most PER new pairs this run, so the first --append on a long
  // session never blocks on hundreds of judge calls at once; a backlog drains over the next turns.
  const PER = 40;
  const start = Math.min(prior.lastPairs, all.length);
  const consumed = Math.min(start + PER, all.length);
  for (const { prior: a, user: u } of all.slice(start, consumed)) {
    let s = null; try { s = await score(a, u); } catch {}
    if (!s) continue;
    prior.distribution[s.pressure] = (prior.distribution[s.pressure] || 0) + 1;
    prior.scored++; prior.wsum += s.pressure; added++;
    if (s.pressure >= 1) prior.steering++;
  }
  const rate = prior.scored ? prior.steering / prior.scored : 0;
  const rec = { at: new Date().toISOString(), backend: backend(), lastPairs: consumed, turns: all.length, scored: prior.scored, steering: prior.steering, steeringRate: rate, meanPressure: prior.scored ? prior.wsum / prior.scored : 0, distribution: prior.distribution, _wsum: prior.wsum };
  try { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(rec) + "\n"); } catch { process.stderr.write("reins: could not write " + out + "\n"); }
  if (has("--json")) process.stdout.write(JSON.stringify(rec) + "\n");
  else process.stdout.write(`reins: +${added} new turn(s), steer rate ${Math.round(rate * 100)}% over ${prior.scored} turns\n`);
  process.exit(0);
}

const n = parseInt(flag("-n"), 10) || 0;
const r = await scan(text, score, { limit: n, pairsFn: H.pairs });

// --write [path]: persist the summary so an OFFLINE reader (the sawbuck statusline)
// can display the live steering number without ever calling a model itself.
if (has("--write")) {
  const wf = flag("--write");
  const out = wf && !wf.startsWith("--") ? wf : join(process.cwd(), ".sawbuck", "steer.json");
  try {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), backend: backend(), turns: r.turns, scored: r.scored, steering: r.steering, steeringRate: r.steeringRate, meanPressure: r.meanPressure, distribution: r.distribution }) + "\n");
  } catch { process.stderr.write("reins: could not write " + out + "\n"); }
}

if (has("--json")) { process.stdout.write(JSON.stringify({ backend: backend(), ...r }) + "\n"); process.exit(0); }

// --share: a tasteful, paste-anywhere card (plain text works on LinkedIn / X / Reddit).
// --label swaps the stat's word; default stays neutral ("steer rate") so it's safe for a
// professional feed, e.g. --label "yank rate" for a playful channel.
if (has("--share")) {
  if (r.scored === 0) { process.stdout.write("reins: nothing to share yet (no turns scored).\n"); process.exit(0); }
  const lf = flag("--label");
  const label = lf && !lf.startsWith("--") ? lf : "steer rate";
  const pct = Math.round(r.steeringRate * 100);
  const d = r.distribution;
  const texture = d[1] >= d[2] + d[3] ? "mostly light refinements" : d[3] > 0 ? "a few hard pulls" : "real redirects";
  const grip = pct >= 60 ? "hands-on" : pct >= 30 ? "a steady hand" : "a loose rein";
  process.stdout.write(
`my ${label} this session 🐴

  ${r.seismograph}
  · let it ride   - nudge   + redirect   # hard pull

I steered ${r.steering} of ${r.scored} turns (${pct}%): ${grip}, ${texture}.
The ${r.scored - r.steering} I let ride, the check had my back.

measured with reins · sawbuck
`);
  process.exit(0);
}

const pct = Math.round(r.steeringRate * 100);
const d = r.distribution;
process.stdout.write(`\n  reins · steering this session   (judge: ${backend()})\n`);
if (r.scored === 0) {
  process.stdout.write(`  no turns scored${r.fails ? ` (${r.fails} judge errors - is the backend reachable?)` : ""}.\n\n`);
  process.exit(r.fails ? 2 : 0);
}
process.stdout.write(`  ${r.seismograph}\n`);
process.stdout.write(`    . passive   - refine   + redirect   # yank\n\n`);
process.stdout.write(`  you steered ${r.steering} of ${r.scored} turns (${pct}%)   ·   mean pressure ${r.meanPressure.toFixed(2)}/3\n`);
process.stdout.write(`  ${d[1]} light refine · ${d[2]} redirect · ${d[3]} hard yank · ${d[0]} passive${r.fails ? ` · ${r.fails} skipped` : ""}\n`);
process.stdout.write(`  the check guards the ${r.scored - r.steering} turns you didn't steer - a miss there is the risk.\n`);
if (r.recent.length) {
  process.stdout.write(`\n  recent steers:\n`);
  for (const s of r.recent) process.stdout.write(`    ${["", "-", "+", "#"][s.pressure]}${s.pressure} ${(s.axis || "").padEnd(12)} ${s.nudge}\n`);
}
process.stdout.write("\n");
