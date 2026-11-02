# reins (engine)

The engine behind reins: measure how much you steer your AI coding agent. It reads
a Claude Code session transcript, scores each of your turns for **steering
pressure** (0 passive → 1 light refine → 2 redirect → 3 hard yank) with a small LLM,
and prints a seismograph of the session plus the distribution.

This is the LLM half of reins. The deterministic brake-slam counter (`sawbuck yank`)
lives in sawbuck's offline core; the continuous pressure judge needs a model, so it
lives here, keeping sawbuck's core model-free. (The reins *plugin*, the Claude Code
surface, lives alongside this in `plugins/sawbuck-reins/`.)

```
$ reins
  reins · steering this session   (judge: ollama:qwen2.5:7b)
  ..--+-+---+---.--.--..+--+.--
    . passive   - refine   + redirect   # yank

  you steered 22 of 29 turns (76%)   ·   mean pressure 0.93/3
  17 light refine · 5 redirect · 0 hard yank · 7 passive
  the check guards the 7 turns you didn't steer - a miss there is the risk.
```

## Harnesses

reins reads **Claude Code** transcripts today. The parser lives in `scan.mjs`; everything
downstream works on abstract `{ prior, user }` turn-pairs, so another harness (Codex, Cursor)
is a parallel module that emits the same pairs plus its own session resolver, not a rewrite.
`pairs()` is the seam.

## Backend (SAWBUCK_JUDGE)

The judge model is a socket. Set `SAWBUCK_JUDGE` (default `ollama:qwen2.5:7b`):

- `ollama:<model>`, local, free, private (nothing leaves your box). `OLLAMA_HOST`
  overrides the endpoint. Benchmarked default `qwen2.5:7b`: fastest, smallest, and
  tied-best accuracy against an opus-labeled gold, model size did not help.
- `haiku`, Anthropic `claude-haiku-5-5` (needs `ANTHROPIC_API_KEY`); zero VRAM,
  about $0.00005 per turn.
- `anthropic:<model>`, any Anthropic model.
- `openai:<model>`, any OpenAI-compatible endpoint (`OPENAI_BASE_URL`,
  `OPENAI_API_KEY`).

Output is constrained to a JSON schema where the backend supports it (ollama
structured outputs), so a thinking model can't break the parse.

## Live on the statusline

`--write [path]` writes the summary JSON (default `.sawbuck/steer.json`). The
offline `sawbuck statusline` reads that file and shows `🤠 steer 76%` next to its
own segment, the LLM work happens here, sawbuck's core stays model-free (it only
reads a file). Keep it fresh by running `reins --write` on a cadence (a `/loop`, a
watch, or a post-turn hook):

```
reins --write          # writes .sawbuck/steer.json; the statusline picks it up
```

## Usage

```
reins [--session <path.jsonl>] [--judge <backend>] [-n N] [--json] [--write [path]]
```

Defaults to your newest Claude Code session. `-n` scores only the most recent N
turns. `--json` is machine-readable. Zero-dep, Node 18+.

## The wizard: harvest your cues

```
reins wizard [--sessions N] [--max N] [--since DAYS] [--judge <backend>] [--json] [--write [path]] [--yes]
```

Reads your old Claude Code chats, finds the steers you keep giving (a correction of HOW
the agent works, not a new task), and ranks them into a cue inventory, so a fresh saddle
already knows your style. It writes `.sawbuck/cues.json` and prints your top cues, ranked by
how many distinct sessions they span, then how generalizable they are.

It reads every turn-pair with a model, so on the default local ollama it is free (just
compute); a hosted backend (`haiku`, `openai:`) costs a little, and the command asks for
`--yes` before it spends. `--max` caps the pairs scored (default 400). The cues are LEADS,
candidates from your history to review, not rules it adopts for you.

## Honest limits

A single-turn judge: it sees the agent action and your reply, not the whole thread.
Models agree on the *shape* (pressure within one level ~95% of the time) more than
on exact per-turn scores, so read the seismograph and the distribution, not any one
cell.
