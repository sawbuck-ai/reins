---
description: Sign this repo to a contract: tests, protected paths, supply-chain guards, and the architecture lock
allowed-tools: ["Bash(npx -y sawbuck@0.1.35 contract)"]
---

Run exactly this command in the current repo and show the person its output verbatim:

```
npx -y sawbuck@0.1.35 contract
```

It keeps any contract already here, adds tests and tripwires if there is none, then protected paths, the supply-chain guards, and promptwheel.lock.json. It writes promptwheel.config.json, promptwheel.lock.json, and .promptwheel/packs/ in this repo. Running it twice changes nothing.

Do not add the suggested product paths to the contract yourself. Those are the person's decision.
