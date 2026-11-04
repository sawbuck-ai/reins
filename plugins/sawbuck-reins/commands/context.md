---
description: Ranked history for the files you are touching: reverts, weakened tests, hot spots
allowed-tools: ["Bash(npx -y sawbuck@0.1.31 context --speak)"]
---

Run exactly this command in the current repo and show the person its output verbatim:

```
npx -y sawbuck@0.1.31 context --speak
```

It reads the repo's own git history and ranks what is relevant to the files changed right now: reverts (do not retry those), weakened tests, and fragile hot spots. Treat the entries as leads to verify against the diff, not as conclusions, before you act.
