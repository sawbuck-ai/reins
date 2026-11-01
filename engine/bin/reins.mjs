#!/usr/bin/env node
// reins: how much did you steer your agent this session? Reads your Claude Code
// transcript, scores each turn's steering pressure via SAWBUCK_JUDGE, and prints
// the seismograph + distribution. The check guards the turns you did not steer.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { scan, resolveSessionPath } from "../scan.mjs";
import { score, backend } from "../judge.mjs";

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);

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

Backend is SAWBUCK_JUDGE (default ollama:qwen2.5:7b). Local = free + private.
`);
  process.exit(0);
}

if (flag("--judge")) process.env.SAWBUCK_JUDGE = flag("--judge");
const sess = resolveSessionPath(flag("--session"));
if (!sess) { process.stderr.write("reins: no session transcript found (pass --session <path.jsonl>)\n"); process.exit(2); }

let text = "";
try { text = readFileSync(sess, "utf8"); } catch { process.stderr.write("reins: cannot read " + sess + "\n"); process.exit(2); }

const n = parseInt(flag("-n"), 10) || 0;
const r = await scan(text, score, { limit: n });

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

I steered ${r.steering} of ${r.scored} turns (${pct}%) — ${grip}, ${texture}.
The ${r.scored - r.steering} I let ride, the check had my back.

— measured with reins · sawbuck
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
