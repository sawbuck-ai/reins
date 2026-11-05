---
description: Surface this repo's live suppression debt: what is still silenced in HEAD, disabled tests first
allowed-tools: ["Bash(npx -y sawbuck@0.1.40 debt)"]
---

Run exactly this command in the current repo and show the person its output verbatim:

```
npx -y sawbuck@0.1.40 debt
```

It scans HEAD for what is currently silenced (skipped tests, lint and type suppressions, bare suppressions with no reason), disabled tests first, ranked by how fragile each file is. It scans the whole repo, so run it on demand, not every turn.
