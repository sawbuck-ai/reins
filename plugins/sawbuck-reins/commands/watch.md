---
description: Watch every turn in this repo: arm the sawbuck Stop hook
allowed-tools: ["Bash(npx -y sawbuck@0.1.28 attach --claude)"]
---

Run exactly this command in the current repo and show the person its output verbatim:

```
npx -y sawbuck@0.1.28 attach --claude
```

It wires three hooks into this repo's `.claude/settings.local.json` (UserPromptSubmit and SessionStart run `sawbuck turn`, Stop runs the check) and keeps `.sawbuck/` out of `git status` through `.git/info/exclude`. From then on a win that does not survive a source-only re-run is caught at the end of the turn and the agent is sent back to earn it. Tell the person they can remove it anytime with `sawbuck detach`.
