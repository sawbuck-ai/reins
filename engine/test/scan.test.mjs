import { test } from "node:test";
import assert from "node:assert";
import { pairs, scan } from "../scan.mjs";
import { parse } from "../judge.mjs";

const L = (o) => JSON.stringify(o);
const asst = (t = "did a thing") => L({ type: "assistant", message: { content: [{ type: "text", text: t }] } });
const user = (s) => L({ type: "user", userType: "external", message: { content: s } });
const toolres = L({ type: "user", userType: "external", message: { content: [{ type: "tool_result", content: "x" }] } });
const meta = L({ type: "user", isMeta: true, message: { content: "reminder" } });

test("pairs(): excludes opener, tool_result, meta, task-notifications", () => {
  const text = [
    user("build it"),           // opener
    asst(), toolres, meta,
    L({ type: "user", userType: "external", message: { content: "<task-notification> done" } }),
    asst("shipped"), user("make it leaner"),   // a real pair
  ].join("\n");
  const ps = pairs(text);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].user, "make it leaner");
  assert.equal(ps[0].prior, "shipped");
});

test("scan(): aggregates pressure into distribution + seismograph", async () => {
  const text = [
    user("start"),
    asst(), user("yes go"),               // scored passive
    asst(), user("make it a bit leaner"), // refine
    asst(), user("no, different approach"),// redirect/yank
  ].join("\n");
  // deterministic fake judge: keyword -> pressure
  const fake = async (_prior, u) =>
    /^no\b/.test(u) ? { pressure: 3, axis: "stop", nudge: "redo" }
    : /leaner|bit/.test(u) ? { pressure: 1, axis: "scope", nudge: "leaner" }
    : { pressure: 0, axis: "ok", nudge: "" };
  const r = await scan(text, fake);
  assert.equal(r.turns, 3);
  assert.equal(r.scored, 3);
  assert.equal(r.distribution[0], 1);
  assert.equal(r.distribution[1], 1);
  assert.equal(r.distribution[3], 1);
  assert.equal(r.steering, 2);
  assert.ok(Math.abs(r.steeringRate - 2 / 3) < 1e-9);
  assert.equal(r.seismograph, ".-#");
});

test("scan(): judge errors count as fails, not crashes", async () => {
  const text = [user("start"), asst(), user("do x"), asst(), user("do y")].join("\n");
  const flaky = async (_p, u) => { if (u === "do x") throw new Error("backend down"); return { pressure: 1, axis: "a", nudge: "n" }; };
  const r = await scan(text, flaky);
  assert.equal(r.turns, 2);
  assert.equal(r.fails, 1);
  assert.equal(r.scored, 1);
});

test("parse(): clean JSON, think-wrapped, and garbage", () => {
  assert.equal(parse('{"pressure":2,"axis":"method","nudge":"streaming"}').pressure, 2);
  assert.equal(parse('<think>hmm this is a redirect</think>\n{"pressure":2,"axis":"m","nudge":"x"}').pressure, 2);
  assert.equal(parse("no json here"), null);
  assert.equal(parse('{"pressure":9}').pressure, 3);   // clamped to 0-3
});
