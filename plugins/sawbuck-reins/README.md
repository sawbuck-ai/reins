# sawbuck-reins

Sawbuck in Claude Code, one install. A guide band above the prompt plus five slash commands, so
you can catch your agent gaming a metric without leaving the session or touching the CLI.

## Install

```
/plugin marketplace add sawbuck-ai/reins
/plugin install sawbuck-reins@sawbuck
```

(`sawbuck` is the marketplace name defined in `.claude-plugin/marketplace.json`.)

Claude Code asks two things on install: a **scope** (choose **user** so the band follows you across your repos) and the **steering judge** (it defaults to a zero-setup `native` one, a tiny Claude call per turn; switch it to a free local model or turn it off, see below).

## What you get

- **A guide band** above the prompt, read from the repo's local `.sawbuck/` record each turn:
  a quiet `🐴 sawbuck · watching` (with the last verdict, `✓` verified / `🚩` gamed) when armed,
  `🐴 sawbuck · ready · /sawbuck-watch to arm` when the repo is checkable but not yet armed, and a
  bold `🐴 N caught` (with the latest item) when the check flags a regression or a faked, "gamed"
  win. It never blocks your prompt and hides itself where Sawbuck is not relevant.
- **A live steering readout** on the band (`🐎 steer X%`, taut `✊` once you are steering more than half of your recent turns): once the repo is
  attached (`/sawbuck-watch`), each turn it scores how much you redirected the agent (a light refine, a redirect, or a hard stop) and shows a **recent-window rate**
  (an EMA over roughly your last 20 scored turns), so it tracks how you are steering lately and falls
  toward a loose rein as the agent learns your cues, instead of a lifetime average that old turns
  anchor. It scores the newest turn in the background and never blocks a turn. The judge has three modes (set `judge` in
  `/plugin configure sawbuck-reins@sawbuck` or `/config`):
  - **`native`** (default): a separate, lightweight classify call through Claude Code's own model
    API (`$.model.complete`, requesting the Haiku model id), on your **own** Claude plan. Zero
    setup: no ollama, no key, nothing leaves your Claude account. It runs only in repos where
    sawbuck is attached. If your build or org blocks model calls, it falls back to the engine
    automatically.
  - **`engine`**: shell the `reins` CLI instead, whose backend is a socket: `SAWBUCK_JUDGE` picks
    a local model (`ollama:qwen2.5:7b`, free, private) or `haiku` (needs `ANTHROPIC_API_KEY`).
    Pick this to keep scoring off your Claude plan.
  - **`off`**: no live steer rate.

  (Leaving `judge` at `native` but setting `SAWBUCK_JUDGE` in your shell is read as a preference for
  the engine path, so an existing local-ollama setup isn't silently billed.)
- **`/sawbuck-check`** verifies your latest change right now (zero-config, no setup): it says plainly
  whether the win was earned in the source, was gamed, is a regression, or could not be measured.
- **`/sawbuck-watch`** arms the Stop hook for this repo, so every turn is checked and a faked win is
  caught and the agent sent back to earn it. Remove it anytime with `sawbuck detach`.
- **`/sawbuck-context`** the ranked relevant history for the files you are touching right now:
  reverts (do-not-retry), weakened tests, and fragile hot spots, before you act.
- **`/sawbuck-debt`** the whole-repo live suppression debt: what is still silenced in HEAD now,
  disabled tests first, risk-ranked by how fragile each file is. Run it on demand (it scans HEAD).
- **`/sawbuck-status`** the inventory: everything Sawbuck has accumulated here in one view, what it
  has caught for you over time, the debt accruing now, and whether it is armed in this repo.

It runs the `sawbuck` CLI through `npx`, pinned to an exact version, which rides the deterministic,
zero-LLM `promptwheel` check and the `@promptwheel/logbook` memory. No `npm install` and no manual
`sawbuck attach` to start.

## What this plugin runs, writes, and sends (the full list)

**Programs it runs.** Exactly two, through `npx` with pinned versions and fixed arguments, never a
shell: `npx -y sawbuck@0.1.26 <check|attach --claude|context --speak|debt|status> .` behind the five
slash commands and the band's reads, and, only in `engine` judge mode, `npx -y @sawbuck/reins@0.4.3
--append` in the background after a turn. Both need Node 18+ and npm on your PATH.

**Files it writes.** Only inside the repo you attached: `.sawbuck/steer.json` (the steer scores;
written by the mod in `native` mode, by the reins CLI in `engine` mode), the `sawbuck` CLI's own
record (`.sawbuck/state.json`, `activity.jsonl`, `results.json`), and the memory engine's cache of
that repo's own git history (`events.jsonl`, `LOGBOOK.md`), which includes the commit author names
already in the git log. All of it is kept out of `git status` and removed by `sawbuck detach --purge`.
To verify a change, the check also runs the repo's own test or metric command (from
`promptwheel.config.json`, or the detected test script) in throwaway git worktrees, exactly as you
would run it yourself; that is the only code it executes that is not one of the two pinned packages. `/sawbuck-watch` runs `sawbuck attach --claude`, which edits two files on purpose:
`.claude/settings.local.json` in that repo (adds the UserPromptSubmit, SessionStart and Stop hooks
that run `sawbuck turn` and the check) and `.git/info/exclude` (keeps `.sawbuck/` out of `git
status`). `sawbuck detach` reverses both exactly. The mod itself never edits build, start-up,
settings or instructions files.

**What it sends, and where.** In the default `native` mode, one small classify call per turn through
Claude Code's own model API (`$.model.complete`, requesting the Haiku model id), on your own Claude
plan, containing the agent's last answer and your reply so it can score how much you steered. In
`engine` mode the reins CLI sends the same pair to the judge you configured with `SAWBUCK_JUDGE`
(a local ollama model, nothing leaves your machine, or your own API key). `off` sends nothing. A pair
is bounded: at most the first 600 characters of the agent's answer and 800 of your reply, never the
whole conversation. The `reins-steering` skill runs `reins wizard` / `reins cues` on demand: they read
your own local Claude Code or Codex transcripts to find the cues you keep giving, send each bounded
pair to the judge you chose (a hosted judge asks for confirmation first), and write a short list of
cue phrases to `.sawbuck/cues.json` in the repo.
There is no telemetry, no analytics, and no other network call; the deterministic check never calls
a model.

**What each hook does.** `session.start` registers the five slash commands. `prompt.submit` scores
the previous (agent answer, your reply) pair in the background and reads `.sawbuck/` to refresh the
band; it never changes your prompt. `turn.complete` stashes the agent's answer for that scoring
(or starts the reins CLI in `engine` mode). `ui.render` draws the band above the prompt. None of
them block a turn, and all of them stay silent in repos where Sawbuck is not attached.
