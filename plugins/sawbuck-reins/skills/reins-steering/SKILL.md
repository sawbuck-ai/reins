---
name: reins-steering
description: See how much you have been steering the agent and the cues you keep giving, read from your Codex history. Use when you want to understand or tighten your own steering, or seed the agent with your standing preferences.
metadata:
  category: insight
---

# Read your steering

To see how much you redirected the agent this session (your steer rate):

```
npx -y @sawbuck/reins@0.4.3 --harness codex
```

To build a cue inventory, the standing preferences you keep giving, from your Codex chats:

```
npx -y @sawbuck/reins@0.4.3 cues --harness codex --append   # the running inventory, updated per session
npx -y @sawbuck/reins@0.4.3 wizard --harness codex           # a one-time harvest across your whole history
```

These read your Codex sessions under `~/.codex/sessions` and score each turn with a local model by
default (free, nothing leaves your box), or a hosted one you set with `SAWBUCK_JUDGE`. The result is
written to `.sawbuck/cues.json`.

The cues are **leads to review**, not rules the tool adopts for you. Read them, keep the ones that
are really how you work, and let the deterministic check guard the turns you did not steer.
