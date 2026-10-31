# sawbuck-reins

Sawbuck in Claude Code, one install. A guide band above the prompt plus five slash commands, so
you can catch your agent gaming a metric without leaving the session or touching the CLI.

## Install

```
/plugin marketplace add sawbuck-ai/reins
/plugin install sawbuck-reins@sawbuck
```

(`sawbuck` is the marketplace name defined in `.claude-plugin/marketplace.json`.)

## What you get

- **A guide band** above the prompt, read from the repo's local `.sawbuck/` record each turn:
  a quiet `🐴 sawbuck · watching` (with the last verdict, `✓` verified / `🚩` gamed) when armed,
  `🐴 sawbuck · ready · /sawbuck-watch to arm` when the repo is checkable but not yet armed, and a
  bold `🐴 N caught` (with the latest item) when the check flags a regression or a faked, "gamed"
  win. It never blocks your prompt and hides itself where Sawbuck is not relevant.
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

It shells the `sawbuck` CLI (a global install if present, else `npx -y sawbuck`), which rides the
deterministic, zero-LLM `promptwheel` check and the `@promptwheel/logbook` memory. No `npm install`
and no manual `sawbuck attach` to start.
