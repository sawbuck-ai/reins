// scan.mjs - turn a Claude Code session transcript into a steering-pressure
// reading: score each of your turns (given the agent action it followed) and
// aggregate into a distribution + a seismograph. The scorer is injected so the
// aggregation is testable without a live model.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function humanText(o) {
  if (!o || o.type !== "user" || o.isMeta) return null;
  if (o.userType && o.userType !== "external") return null;
  const c = o.message && o.message.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    if (c.some((b) => b && b.type === "tool_result")) return null;
    const t = c.filter((b) => b && b.type === "text").map((b) => b.text || "").join(" ");
    return t || null;
  }
  return null;
}
function assistantText(o) {
  const c = o.message && o.message.content;
  if (Array.isArray(c)) return c.filter((b) => b && b.type === "text").map((b) => b.text || "").join(" ").trim();
  if (typeof c === "string") return c.trim();
  return "";
}
const noise = (t) => {
  const s = t.trim();
  if (s.includes("<task-notification>") || s.startsWith("<task-id>")) return true;
  if (s.replace(/\[Image #\d+\]/g, "").trim().length < 3) return true;
  return false;
};

// Extract the (prior-agent, user-turn) pairs to score: every non-opener human turn
// that followed an agent action.
export function pairs(text) {
  const out = [];
  let prev = "", seen = false;
  for (const line of String(text).split("\n")) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type === "assistant") { prev = assistantText(o); continue; }
    const t = humanText(o);
    if (t === null || noise(t)) continue;
    if (!seen) { seen = true; continue; }       // opener = a request, not a steer
    if (prev) out.push({ prior: prev.slice(0, 600), user: t.replace(/\s+/g, " ").slice(0, 800) });
    prev = "";
  }
  return out;
}

const GLYPH = { 0: ".", 1: "-", 2: "+", 3: "#" };

// scan(text, scoreFn) -> aggregate. scoreFn(prior, user) -> {pressure, axis, nudge} | null.
export async function scan(text, scoreFn, { limit = 0 } = {}) {
  let ps = pairs(text);
  if (limit > 0 && ps.length > limit) ps = ps.slice(-limit);   // most recent N
  const dist = { 0: 0, 1: 0, 2: 0, 3: 0 };
  let scored = 0, fails = 0, wsum = 0, spark = "";
  const recent = [];
  for (const { prior, user } of ps) {
    let r = null;
    try { r = await scoreFn(prior, user); } catch { r = null; }
    if (!r) { fails++; spark += "?"; continue; }
    dist[r.pressure]++; scored++; wsum += r.pressure; spark += GLYPH[r.pressure];
    if (r.pressure >= 1) recent.push({ pressure: r.pressure, axis: r.axis, nudge: r.nudge, user: user.slice(0, 60) });
  }
  const turns = ps.length;
  const steering = dist[1] + dist[2] + dist[3];
  return {
    turns, scored, fails,
    distribution: dist,
    steering, steeringRate: scored ? steering / scored : 0,
    meanPressure: scored ? wsum / scored : 0,
    seismograph: spark,
    recent: recent.slice(-6),
  };
}

// Resolve the newest session transcript for a cwd (Claude Code: ~/.claude/projects/
// <encoded-cwd>/<id>.jsonl). Best-effort; prefer the cwd's dir, else newest overall.
export function resolveSessionPath(explicit, cwd = process.cwd()) {
  if (explicit) return existsSync(explicit) ? explicit : null;
  const root = join(homedir(), ".claude", "projects");
  if (!existsSync(root)) return null;
  const key = cwd.replace(/[^A-Za-z0-9]/g, "-");
  let dirs = [];
  try { dirs = readdirSync(root).map((d) => join(root, d)).filter((p) => { try { return statSync(p).isDirectory(); } catch { return false; } }); }
  catch { return null; }
  const matched = dirs.filter((p) => p.endsWith("/" + key));
  const pool = matched.length ? matched : dirs;
  let best = null, bestT = 0;
  for (const full of pool) {
    let files = []; try { files = readdirSync(full); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const p = join(full, f);
      try { const st = statSync(p); if (st.mtimeMs > bestT) { bestT = st.mtimeMs; best = p; } } catch {}
    }
  }
  return best;
}
