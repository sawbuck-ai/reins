// wizard.mjs - the harvest: read your old Claude Code chats, find the STEERS you keep
// giving, and rank them into a cue inventory, so a fresh saddle already knows your style.
//
// Token honesty: every turn-pair is read by a model. On the default local ollama that is
// free (just compute); on a hosted backend it costs a little. The CLI prints the count and
// the backend before it runs. The scorer is injected here so the aggregation is testable
// without a model.

import { readFileSync } from "node:fs";
import { pairs, resolveSessions } from "./scan.mjs";

// aggregateCues(items) -> ranked cue inventory. items = [{ session, result }], where
// result = { steer, axis, magnitude, generalizable, cue } | null. Pure + deterministic.
// Rank = distinct-session support, then generalizable count, then raw frequency (so a
// one-session spike never outranks a cue you give across many sessions - the study's lesson).
export function aggregateCues(items) {
  const clusters = new Map();
  let scored = 0, steers = 0, fails = 0;
  for (const { session, result } of items) {
    if (!result) { fails++; continue; }
    scored++;
    if (!result.steer) continue;
    steers++;
    const key = (result.axis || "other") + "|" + String(result.cue || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 40);
    const c = clusters.get(key) || { axis: result.axis || "other", cue: result.cue || "", count: 0, gen: 0, sessions: new Set(), mag: { refine: 0, redirect: 0, "hard-stop": 0 } };
    c.count++;
    if (result.generalizable) c.gen++;
    if (result.magnitude && c.mag[result.magnitude] != null) c.mag[result.magnitude]++;
    if (session) c.sessions.add(session);
    // keep the most specific non-empty cue text seen for this cluster
    if (!c.cue && result.cue) c.cue = result.cue;
    clusters.set(key, c);
  }
  const cues = [...clusters.values()]
    .map((c) => ({ axis: c.axis, cue: c.cue, count: c.count, gen: c.gen, genShare: c.count ? +(c.gen / c.count).toFixed(2) : 0, sessions: c.sessions.size, magnitude: c.mag }))
    .sort((a, b) => (b.sessions - a.sessions) || (b.gen - a.gen) || (b.count - a.count));
  return { scored, steers, fails, steerRate: scored ? +(steers / scored).toFixed(3) : 0, cues };
}

// harvest(scoreFn, { sessions, maxPairs }) -> aggregateCues over the pairs in those session
// files, newest first, capped at maxPairs (cost control). scoreFn(prior, user) -> result | null.
export async function harvest(scoreFn, { sessions = [], maxPairs = 400, pairsFn = pairs } = {}) {
  const items = [];
  const gathered = [];
  for (const path of sessions) {
    let text = ""; try { text = readFileSync(path, "utf8"); } catch { continue; }
    for (const p of pairsFn(text)) {
      gathered.push({ ...p, session: path });
      if (gathered.length >= maxPairs) break;
    }
    if (gathered.length >= maxPairs) break;
  }
  for (const { prior, user, session } of gathered) {
    let result = null;
    try { result = await scoreFn(prior, user); } catch { result = null; }
    items.push({ session, result });
  }
  const agg = aggregateCues(items);
  return { pairs: gathered.length, sessionsRead: sessions.length, ...agg };
}

export { resolveSessions };
