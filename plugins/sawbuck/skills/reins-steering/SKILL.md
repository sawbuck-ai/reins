---
name: reins-steering
description: See how much you have been steering the agent and the cues you keep giving, read from your Claude Code or Codex history. Use when you want to understand or tighten your own steering, or seed the agent with your standing preferences.
metadata:
  category: insight
---

# Read your steering

To see how much you redirected the agent this session (your steer rate):

```
npx -y @sawbuck/reins@0.4.5
```

To build a cue inventory, the standing preferences you keep giving, from your chats:

```
npx -y @sawbuck/reins@0.4.5 cues --append   # the running inventory, updated per session
npx -y @sawbuck/reins@0.4.5 wizard          # a one-time harvest across your whole history
```

`SAWBUCK_JUDGE=native` is the plugin's in-session judge, not a CLI backend: for these commands leave it unset (a local
ollama model, free) or set a hosted one, and add `--yes` for a hosted judge.

These read your Claude Code sessions under `~/.claude/projects` and score each turn with a local
model by default (free, nothing leaves your box), or a hosted one you set with `SAWBUCK_JUDGE`
(`haiku`, `anthropic:<model>`, `openai:<model>`). A hosted judge is paid, so `cues` and `wizard`
stop and ask for `--yes` before they call it. The result is written to `.sawbuck/cues.json`.

## In Codex

Codex keeps its transcripts under `~/.codex/sessions`; add `--harness codex` to each command:

```
npx -y @sawbuck/reins@0.4.5 --harness codex
npx -y @sawbuck/reins@0.4.5 cues --harness codex --append
npx -y @sawbuck/reins@0.4.5 wizard --harness codex
```

The cues are **leads to review**, not rules the tool adopts for you. Read them, keep the ones that
are really how you work, and let the deterministic check guard the turns you did not steer.
