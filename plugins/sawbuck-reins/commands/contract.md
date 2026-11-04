---
description: One step to set up Sawbuck: sign this repo to a contract and start watching every turn
allowed-tools: ["Bash(npx -y sawbuck@0.1.35 contract)", "Bash(npx -y sawbuck@0.1.35 attach --claude)"]
---

Run exactly these two commands in the current repo, in order, and show the person their output verbatim:

```
npx -y sawbuck@0.1.35 contract
npx -y sawbuck@0.1.35 attach --claude
```

The first keeps any contract already here, adds tests and tripwires if there is none, then protected paths, the supply-chain guards, and promptwheel.lock.json. The second wires the hooks that check every turn. Running them twice changes nothing.

Then tell the person, in two lines: they are set up, and they should review and commit promptwheel.config.json, promptwheel.lock.json and .promptwheel/packs/.

Do not commit for them, and do not add the suggested product paths to the contract. Those are the person's decisions.
