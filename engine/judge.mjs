// judge.mjs - the steering judge's backend socket.
//
//   score(prior, user)        -> {pressure 0-3, axis, nudge}   (the per-turn seismograph)
//   harvestScore(prior, user) -> {steer, axis, magnitude, generalizable, cue}   (the wizard's cue finder)
//
// Both run through the backend SAWBUCK_JUDGE selects. This file does network/LLM calls ON
// PURPOSE - it is a STANDALONE tool, never imported into sawbuck's offline core.
//
// Backends (SAWBUCK_JUDGE):
//   ollama:<model>     local, free, private - the default (ollama:qwen2.5:7b). OLLAMA_HOST overrides.
//   haiku              Anthropic claude-haiku-5-5 (needs ANTHROPIC_API_KEY); cheap hosted, zero VRAM.
//   anthropic:<model>  any Anthropic model.
//   openai:<model>     any OpenAI-compatible endpoint (OPENAI_BASE_URL + OPENAI_API_KEY).
//
// Benchmarked default = qwen2.5:7b: tied-best accuracy vs an opus gold, fastest, smallest.

// ---- schemas (ollama structured outputs: a grammar, not a prayer, so no parse-fails) ----
const PRESSURE_SCHEMA = {
  type: "object",
  properties: {
    pressure: { type: "integer", enum: [0, 1, 2, 3] },
    axis: { type: "string" },
    nudge: { type: "string" },
  },
  required: ["pressure", "axis", "nudge"],
};
const HARVEST_SCHEMA = {
  type: "object",
  properties: {
    steer: { type: "boolean" },
    axis: { type: "string" },
    magnitude: { type: "string", enum: ["refine", "redirect", "hard-stop"] },
    generalizable: { type: "boolean" },
    cue: { type: "string" },
  },
  required: ["steer", "axis", "magnitude", "generalizable", "cue"],
};

const PROMPT = (a, u) =>
`You rate how much a developer's message STEERS an AI coding agent's current work.
Output ONLY one JSON object: {"pressure":0-3,"axis":"one-word","nudge":"<=8 words"}
pressure: 0 passive (approval like "yes/go/do it", a pure question, or a brand-new unrelated task; NOT steering current work). 1 light refine (small adjustment to the SAME work: tone, length, scope, emphasis, "a bit more X", "also Y"). 2 redirect (change the approach/direction of current work). 3 hard-stop ("no/stop/undo/revert", reject and restart).
AGENT just did: ${a}
USER replied: ${u}
JSON:`;

const HARVEST_PROMPT = (a, u) =>
`You analyze a developer's message to an AI coding agent to find a repeated STEER: a correction of HOW the agent works, not a new task.
Output ONLY one JSON object: {"steer":true|false,"axis":"one-word","magnitude":"refine|redirect|hard-stop","generalizable":true|false,"cue":"<=6 words"}
steer: true if the message corrects or redirects the current work; false for a brand-new task, a pure question, or plain approval.
axis: the dimension - rigor, scope, approach, correctness, format, process, tone, naming, or constraint.
magnitude: refine (small adjustment) | redirect (change the approach) | hard-stop (reject or undo).
generalizable: true if it is a STANDING preference that would apply to future work, false if specific to this one case.
cue: a short imperative naming the rule, e.g. "verify before claiming done".
AGENT just did: ${String(a).slice(0, 600)}
USER replied: ${String(u).replace(/\s+/g, " ").slice(0, 800)}
JSON:`;

// lenient parse: strip reasoning-model <think> blocks, take the last JSON object.
function lastJson(txt) {
  txt = String(txt).replace(/<think>[\s\S]*?<\/think>/g, "");
  const cands = txt.match(/\{[^{}]*\}/g) || [];
  for (const c of cands.reverse()) { try { return JSON.parse(c); } catch { /* keep scanning */ } }
  return null;
}
export function parse(txt) {
  const j = lastJson(txt);
  if (!j || j.pressure == null) return null;
  return {
    pressure: Math.max(0, Math.min(3, parseInt(j.pressure, 10) || 0)),
    axis: String(j.axis || "").slice(0, 16),
    nudge: String(j.nudge || "").slice(0, 48),
  };
}
export function parseHarvest(txt) {
  const j = lastJson(txt);
  if (!j || j.steer == null) return null;
  const mags = ["refine", "redirect", "hard-stop"];
  return {
    steer: j.steer === true,
    axis: String(j.axis || "other").toLowerCase().slice(0, 20),
    magnitude: mags.includes(j.magnitude) ? j.magnitude : "refine",
    generalizable: j.generalizable === true,
    cue: String(j.cue || "").trim().slice(0, 60),
  };
}

// one backend call -> RAW text (the caller parses). schema is used where the backend supports it (ollama).
async function complete(promptStr, schema) {
  const b = backend();
  if (b === "haiku") return anthropic("claude-haiku-5-5", promptStr);
  if (b.startsWith("anthropic:")) return anthropic(b.slice(10), promptStr);
  if (b.startsWith("ollama:")) return ollama(b.slice(7), promptStr, schema);
  if (b.startsWith("openai:")) return openai(b.slice(7), promptStr);
  throw new Error("unknown SAWBUCK_JUDGE backend: " + b + " (use ollama:<model> | haiku | anthropic:<model> | openai:<model>)");
}

async function ollama(model, promptStr, schema) {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  const res = await fetch(host + "/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: promptStr, stream: false, format: schema, options: { temperature: 0, num_predict: 800 } }),
  });
  const j = await res.json();
  return j.response || "";
}
async function anthropic(model, promptStr) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set (SAWBUCK_JUDGE=haiku needs it)");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 200, messages: [{ role: "user", content: promptStr }] }),
  });
  const j = await res.json();
  return (j.content || []).filter((x) => x.type === "text").map((x) => x.text).join("");
}
async function openai(model, promptStr) {
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 200, response_format: { type: "json_object" }, messages: [{ role: "user", content: promptStr }] }),
  });
  const j = await res.json();
  return j.choices?.[0]?.message?.content || "";
}

export function backend() { return process.env.SAWBUCK_JUDGE || "ollama:qwen2.5:7b"; }

export async function score(prior, user) { return parse(await complete(PROMPT(prior, user), PRESSURE_SCHEMA)); }
export async function harvestScore(prior, user) { return parseHarvest(await complete(HARVEST_PROMPT(prior, user), HARVEST_SCHEMA)); }
