import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

// Drives the real CLI (bin/reins.mjs) against a fake ollama endpoint, so the per-turn --append
// path and the cues confirm are proven end to end without a model.
const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "reins.mjs");
const L = (o) => JSON.stringify(o);
const asst = (t) => L({ type: "assistant", message: { content: [{ type: "text", text: t }] } });
const user = (s) => L({ type: "user", userType: "external", message: { content: s } });
// a Claude Code transcript with `n` scorable pairs (the opener is never a pair)
const session = (n) => [user("build it"), ...Array.from({ length: n }, (_, i) => [asst("did step " + i), user("no, change step " + i)]).flat()].join("\n") + "\n";

function fakeOllama() {
  const calls = [];
  const srv = createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => { calls.push(JSON.parse(body)); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ response: '{"pressure":2,"axis":"scope","nudge":"change it"}' })); });
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve({ calls, url: "http://127.0.0.1:" + srv.address().port, close: () => srv.close() })));
}
// async on purpose: the fake ollama server lives in this process, and a spawnSync would block the
// event loop the server needs to answer the child (a deadlock, not a slow test)
const run = (cwd, args, env = {}) => new Promise((resolve) => {
  const c = spawn(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", ...env } });
  let stdout = "", stderr = "";
  c.stdout.on("data", (d) => (stdout += d)); c.stderr.on("data", (d) => (stderr += d));
  const t = setTimeout(() => c.kill("SIGKILL"), 30000);
  c.on("close", (status) => { clearTimeout(t); resolve({ status, stdout, stderr }); });
});

test("--append binds the pair index to the session: a new session is scored from its first pair, tallies roll on", async () => {
  const d = mkdtempSync(join(tmpdir(), "reins-cli-"));
  const o = await fakeOllama();
  try {
    const env = { SAWBUCK_JUDGE: "ollama:fake", OLLAMA_HOST: o.url };
    const a = join(d, "a.jsonl"), b = join(d, "b.jsonl");
    writeFileSync(a, session(2)); writeFileSync(b, session(1));
    let r = await run(d, ["--append", "--session", a], env);
    assert.equal(r.status, 0, r.stderr);
    let rec = JSON.parse(readFileSync(join(d, ".sawbuck", "steer.json"), "utf8"));
    assert.equal(rec.session, a); assert.equal(rec.lastPairs, 2); assert.equal(rec.scored, 2); assert.equal(o.calls.length, 2);
    // a different session: before the fix start = min(2, 1) = 1 and its only pair was never scored
    r = await run(d, ["--append", "--session", b], env);
    assert.equal(r.status, 0, r.stderr);
    rec = JSON.parse(readFileSync(join(d, ".sawbuck", "steer.json"), "utf8"));
    assert.equal(rec.session, b); assert.equal(rec.lastPairs, 1);
    assert.equal(rec.scored, 3, "the tallies carry across sessions"); assert.equal(o.calls.length, 3, "the new session's first pair was scored");
    // the same session again: resume, nothing new to score
    r = await run(d, ["--append", "--session", b], env);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\+0 new turn/); assert.equal(o.calls.length, 3);
  } finally { o.close(); rmSync(d, { recursive: true, force: true }); }
});

test("cues on a hosted judge stops and asks for --yes before any call; --yes proceeds", async () => {
  const d = mkdtempSync(join(tmpdir(), "reins-cli-"));
  const o = await fakeOllama();
  try {
    const a = join(d, "a.jsonl"); writeFileSync(a, session(1));
    let r = await run(d, ["cues", "--append", "--session", a, "--judge", "haiku"], { OLLAMA_HOST: o.url });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /HOSTED backend/); assert.match(r.stderr, /--yes/);
    assert.equal(existsSync(join(d, ".sawbuck", "cues.json")), false, "nothing written before the confirm");
    // --yes: the confirm is passed (the hosted call itself fails here with no key, which cues tolerates as a null result)
    r = await run(d, ["cues", "--append", "--session", a, "--judge", "haiku", "--yes"], { OLLAMA_HOST: o.url });
    assert.equal(r.status, 0, r.stderr);
    const rec = JSON.parse(readFileSync(join(d, ".sawbuck", "cues.json"), "utf8"));
    assert.equal(rec.session, a); assert.equal(rec.lastPairs, 1);
    // the local default needs no confirm
    r = await run(d, ["cues", "--append", "--session", a], { SAWBUCK_JUDGE: "ollama:fake", OLLAMA_HOST: o.url });
    assert.equal(r.status, 0, r.stderr);
  } finally { o.close(); rmSync(d, { recursive: true, force: true }); }
});

test("--append after the plugin's native judge resumes by index on the live session instead of re-scoring it", async () => {
  const d = mkdtempSync(join(tmpdir(), "reins-cli-"));
  const o = await fakeOllama();
  try {
    const env = { SAWBUCK_JUDGE: "ollama:fake", OLLAMA_HOST: o.url };
    const a = join(d, "a.jsonl"); writeFileSync(a, session(3));
    // the shape register.tsx writes: the session is a native token, two pairs already counted
    mkdirSync(join(d, ".sawbuck"), { recursive: true });
    writeFileSync(join(d, ".sawbuck", "steer.json"), JSON.stringify({ at: "2026-11-03T00:00:00.000Z", backend: "native", session: "native:abc123", lastPairs: 2, turns: 2, scored: 2, steering: 1, steeringRate: 0.5, ema: 0.5, meanPressure: 1, distribution: { 0: 1, 1: 0, 2: 1, 3: 0 }, _wsum: 2 }) + "\n");
    const r = await run(d, ["--append", "--session", a], env);
    assert.equal(r.status, 0, r.stderr);
    const rec = JSON.parse(readFileSync(join(d, ".sawbuck", "steer.json"), "utf8"));
    assert.equal(o.calls.length, 1, "only the third pair is new");
    assert.equal(rec.scored, 3); assert.equal(rec.lastPairs, 3); assert.equal(rec.session, a, "the transcript path replaces the native token");
    assert.match(r.stdout, /\+1 new turn/);
  } finally { o.close(); rmSync(d, { recursive: true, force: true }); }
});

test("SAWBUCK_JUDGE=native is refused by the CLI with a pointer to the plugin, nothing written; ollama needs no confirm; haiku needs --yes", async () => {
  const d = mkdtempSync(join(tmpdir(), "reins-cli-"));
  const o = await fakeOllama();
  try {
    const a = join(d, "a.jsonl"); writeFileSync(a, session(1));
    let r = await run(d, ["cues", "--append", "--session", a], { SAWBUCK_JUDGE: "native", OLLAMA_HOST: o.url });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /native is the plugin's in-session judge/); assert.doesNotMatch(r.stderr, /HOSTED/);
    assert.equal(existsSync(join(d, ".sawbuck", "cues.json")), false, "no run of nulls written");
    r = await run(d, ["--append", "--session", a], { SAWBUCK_JUDGE: "native", OLLAMA_HOST: o.url });
    assert.equal(r.status, 2); assert.match(r.stderr, /in-session judge/);
    assert.equal(existsSync(join(d, ".sawbuck", "steer.json")), false);
    // --judge native is refused the same way
    r = await run(d, ["cues", "--append", "--session", a, "--judge", "native"], { OLLAMA_HOST: o.url });
    assert.equal(r.status, 2); assert.match(r.stderr, /in-session judge/);
    // the local default: no confirm, scores
    r = await run(d, ["cues", "--append", "--session", a], { SAWBUCK_JUDGE: "ollama:fake", OLLAMA_HOST: o.url });
    assert.equal(r.status, 0, r.stderr); assert.equal(o.calls.length, 1);
    // a hosted backend: the confirm, before any call
    r = await run(d, ["--append", "--session", a, "--judge", "haiku"], { OLLAMA_HOST: o.url });
    assert.equal(r.status, 0, "the bare --append path does not confirm (unchanged); " + r.stderr);
    r = await run(d, ["cues", "--session", a, "--judge", "haiku"], { OLLAMA_HOST: o.url });
    assert.equal(r.status, 2); assert.match(r.stderr, /HOSTED backend/); assert.match(r.stderr, /--yes/);
  } finally { o.close(); rmSync(d, { recursive: true, force: true }); }
});
