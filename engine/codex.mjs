// codex.mjs - the OpenAI Codex transcript adapter. The HARNESS sibling of scan.mjs: it reads
// Codex's rollout logs and emits the SAME { prior, user } turn-pairs, so the judge (judge.mjs),
// the cue aggregation (wizard.mjs), and the CLI work on Codex sessions unchanged. Exports the
// same interface as scan.mjs (pairs / resolveSessionPath / resolveSessions) so the CLI swaps
// adapters by --harness. Format verified against codex-cli 0.147.0 on disk + the openai/codex
// source (rollout envelope { timestamp, type, payload }, serde snake_case tags).
//
//   sessions:  $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<iso>-<thread>.jsonl  (+ legacy flat layout)
//   turns:     prefer type=="event_msg" payload.type in {user_message, agent_message} (clean,
//              already scaffolding-free); fall back to type=="response_item" message role
//              user/assistant for older sessions, filtering the injected <environment_context> /
//              AGENTS.md / permissions / collaboration_mode pseudo-user turns.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const codexHome = () => process.env.CODEX_HOME || join(homedir(), ".codex");

// role:user response_items are polluted with injected scaffolding - not real user turns.
const SCAFFOLD = /^\s*<(environment_context|permissions|collaboration_mode|user_instructions|system|tools?)\b/i;
const isNoise = (t) => { const s = String(t).trim(); return s.length < 3 || SCAFFOLD.test(s); };

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((b) => b && (b.type === "input_text" || b.type === "output_text" || b.type === "text") && b.text).map((b) => b.text).join(" ");
  return "";
}

// Codex rollout jsonl -> ordered { role, text } turns, from whichever layer the file has.
function turnsFromRollout(text) {
  const objs = [];
  for (const line of String(text).split("\n")) { const l = line.trim(); if (!l) continue; try { objs.push(JSON.parse(l)); } catch {} }
  // newer builds carry the clean event_msg layer; if present, use it EXCLUSIVELY (the response_item
  // layer duplicates each turn and carries scaffolding, so mixing them double-counts).
  const hasEvent = objs.some((o) => o && o.type === "event_msg" && o.payload && (o.payload.type === "user_message" || o.payload.type === "agent_message"));
  const turns = [];
  for (const o of objs) {
    if (!o || !o.payload) continue;
    if (hasEvent) {
      if (o.type !== "event_msg") continue;
      if (o.payload.type === "user_message") turns.push({ role: "user", text: o.payload.message });
      else if (o.payload.type === "agent_message") turns.push({ role: "assistant", text: o.payload.message });
    } else {
      if (o.type !== "response_item" || o.payload.type !== "message") continue;
      const r = o.payload.role;
      if (r === "user" || r === "assistant") turns.push({ role: r, text: textOf(o.payload.content) });
    }
  }
  return turns;
}

// Same pairing contract as scan.mjs: every non-opener user turn that followed an agent turn.
export function pairs(text) {
  const out = [];
  let prev = "", seen = false;
  for (const { role, text: t } of turnsFromRollout(text)) {
    const s = String(t == null ? "" : t);
    if (role === "assistant") { if (s.trim()) prev = s.slice(0, 600); continue; }
    if (isNoise(s)) continue;              // skip injected scaffolding / empties
    if (!seen) { seen = true; continue; }  // opener = a request, not a steer
    if (prev) out.push({ prior: prev, user: s.replace(/\s+/g, " ").slice(0, 800) });
    prev = "";
  }
  return out;
}

// recursively list rollout-*.jsonl under $CODEX_HOME/sessions (dated tree + legacy flat)
function listRollouts() {
  const root = join(codexHome(), "sessions");
  if (!existsSync(root)) return [];
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 5) return;
    let ents = []; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile() && /^rollout-.*\.jsonl$/.test(e.name)) { try { found.push({ path: p, mtime: statSync(p).mtimeMs }); } catch {} }
    }
  };
  walk(root, 0);
  return found;
}

export function resolveSessionPath(explicit) {
  if (explicit) return existsSync(explicit) ? explicit : null;
  const f = listRollouts();
  if (!f.length) return null;
  f.sort((a, b) => b.mtime - a.mtime);
  return f[0].path;
}

export function resolveSessions({ limit = 0, sinceMs = 0 } = {}) {
  let f = listRollouts();
  if (sinceMs) f = f.filter((x) => x.mtime >= sinceMs);
  f.sort((a, b) => b.mtime - a.mtime);
  return (limit > 0 ? f.slice(0, limit) : f).map((x) => x.path);
}
