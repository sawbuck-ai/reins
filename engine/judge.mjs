// judge.mjs - the steering-PRESSURE judge's backend socket.
//
// score(prior, user) -> {pressure 0-3, axis, nudge}, via the backend SAWBUCK_JUDGE
// selects. This file does network/LLM calls ON PURPOSE - it is a STANDALONE tool,
// never imported into sawbuck's offline core (which is stabilizer-enforced
// model-free). The deterministic yank meter lives in sawbuck; this LLM judge lives
// here, the way steering lives in the harness layer, not the git core.
//
// Backends (SAWBUCK_JUDGE):
//   ollama:<model>     local, free, private - the default (ollama:qwen2.5:7b),
//                      "put your GPU to work"; OLLAMA_HOST overrides the endpoint.
//   haiku              Anthropic claude-haiku-5-5 (needs ANTHROPIC_API_KEY); cheap
//                      hosted, zero VRAM (~$0.00005/turn).
//   anthropic:<model>  any Anthropic model.
//   openai:<model>     any OpenAI-compatible endpoint (OPENAI_BASE_URL + OPENAI_API_KEY).
//
// Benchmarked default = qwen2.5:7b: tied-best accuracy vs an opus gold, fastest
// (0.2s/turn), smallest, 0 parse-fails; model size did not help (see the bench).

// JSON Schema that constrains the model's output (ollama structured outputs). This
// is the robust fix for valid JSON - a grammar, not a prayer - so no backend
// parse-fails the way free-form prompting did (qwen3's <think> truncation, etc.).
const PRESSURE_SCHEMA = {
  type: "object",
  properties: {
    pressure: { type: "integer", enum: [0, 1, 2, 3] },
    axis: { type: "string" },
    nudge: { type: "string" },
  },
  required: ["pressure", "axis", "nudge"],
};

const PROMPT = (a, u) =>
`You rate how much a developer's message STEERS an AI coding agent's current work.
Output ONLY one JSON object: {"pressure":0-3,"axis":"one-word","nudge":"<=8 words"}
pressure: 0 passive (approval like "yes/go/do it", a pure question, or a brand-new unrelated task; NOT steering current work). 1 light refine (small adjustment to the SAME work: tone, length, scope, emphasis, "a bit more X", "also Y"). 2 redirect (change the approach/direction of current work). 3 hard-stop ("no/stop/undo/revert", reject and restart).
AGENT just did: ${a}
USER replied: ${u}
JSON:`;

// lenient parse: strip reasoning-model <think> blocks, take the last JSON object.
// (With a constrained-output backend the response is already clean; this is a net.)
export function parse(txt) {
  txt = String(txt).replace(/<think>[\s\S]*?<\/think>/g, "");
  const cands = txt.match(/\{[^{}]*\}/g) || [];
  for (const c of cands.reverse()) {
    try {
      const j = JSON.parse(c);
      if (j && j.pressure != null) {
        return {
          pressure: Math.max(0, Math.min(3, parseInt(j.pressure, 10) || 0)),
          axis: String(j.axis || "").slice(0, 16),
          nudge: String(j.nudge || "").slice(0, 48),
        };
      }
    } catch { /* keep scanning */ }
  }
  return null;
}

async function ollama(model, a, u) {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  const res = await fetch(host + "/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: PROMPT(a, u), stream: false, format: PRESSURE_SCHEMA, options: { temperature: 0, num_predict: 800 } }),
  });
  const j = await res.json();
  return parse(j.response || "");
}

async function anthropic(model, a, u) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set (SAWBUCK_JUDGE=haiku needs it)");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 200, messages: [{ role: "user", content: PROMPT(a, u) }] }),
  });
  const j = await res.json();
  const t = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return parse(t);
}

async function openai(model, a, u) {
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 200, response_format: { type: "json_object" }, messages: [{ role: "user", content: PROMPT(a, u) }] }),
  });
  const j = await res.json();
  return parse(j.choices?.[0]?.message?.content || "");
}

export function backend() { return process.env.SAWBUCK_JUDGE || "ollama:qwen2.5:7b"; }

export async function score(prior, user) {
  const b = backend();
  if (b === "haiku") return anthropic("claude-haiku-5-5", prior, user);
  if (b.startsWith("anthropic:")) return anthropic(b.slice(10), prior, user);
  if (b.startsWith("ollama:")) return ollama(b.slice(7), prior, user);
  if (b.startsWith("openai:")) return openai(b.slice(7), prior, user);
  throw new Error("unknown SAWBUCK_JUDGE backend: " + b + " (use ollama:<model> | haiku | anthropic:<model> | openai:<model>)");
}
