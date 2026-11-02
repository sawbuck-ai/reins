import { test } from "node:test";
import assert from "node:assert/strict";
import { pairs } from "../codex.mjs";

const jl = (arr) => arr.map((o) => JSON.stringify(o)).join("\n") + "\n";

test("codex pairs: event_msg layer, prior-agent + next-user, opener skipped", () => {
  const t = jl([
    { type: "session_meta", payload: { id: "x" } },
    { type: "event_msg", payload: { type: "user_message", message: "build the thing" } },      // opener (skipped)
    { type: "event_msg", payload: { type: "agent_message", message: "I built it with approach X." } },
    { type: "event_msg", payload: { type: "user_message", message: "no, verify it first" } },   // steer
  ]);
  const p = pairs(t);
  assert.equal(p.length, 1);
  assert.equal(p[0].user, "no, verify it first");
  assert.match(p[0].prior, /approach X/);
});

test("codex pairs: when the clean event_msg layer exists, response_item is ignored (no double-count)", () => {
  const t = jl([
    { type: "event_msg", payload: { type: "user_message", message: "open the task" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>junk</environment_context>" }] } },
    { type: "event_msg", payload: { type: "agent_message", message: "did A" } },
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "did A" }] } },
    { type: "event_msg", payload: { type: "user_message", message: "change it" } },
  ]);
  const p = pairs(t);
  assert.equal(p.length, 1);           // only the event_msg turns, not the duplicate response_items
  assert.equal(p[0].user, "change it");
});

test("codex pairs: response_item fallback for older sessions, scaffolding filtered", () => {
  const t = jl([
    { type: "session_meta", payload: {} },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>cwd=/x</environment_context>" }] } }, // scaffold, filtered
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "do the task" }] } },   // real opener (skipped)
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "done via Y" }] } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "undo that" }] } },     // steer
  ]);
  const p = pairs(t);
  assert.equal(p.length, 1);
  assert.equal(p[0].user, "undo that");
  assert.match(p[0].prior, /done via Y/);
});

test("codex pairs: empty / malformed lines don't crash", () => {
  assert.deepEqual(pairs(""), []);
  assert.deepEqual(pairs("not json\n{bad\n"), []);
});
