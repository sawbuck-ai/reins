---
description: One step to set up Sawbuck: sign this repo to a contract and start watching every turn
allowed-tools: ["Bash(npx -y sawbuck@0.1.43 contract)", "Bash(npx -y sawbuck@0.1.43 attach --claude)"]
---

Run exactly these two commands in the current repo, in order, and show the person their output verbatim. The first also adds the rules to AGENTS.md, and to CLAUDE.md or .cursorrules if they exist, and on a GitHub repo writes .github/workflows/sawbuck.yml, so tell them that:

```
npx -y sawbuck@0.1.43 contract
npx -y sawbuck@0.1.43 attach --claude
```

The first keeps any contract already here, adds tests and tripwires if there is none, then protected paths, the supply-chain guards, and promptwheel.lock.json. The second wires the hooks that check every turn. Running them twice changes nothing.

Then tell the person, in two lines: they are set up, and they should review and commit AGENTS.md, promptwheel.config.json, promptwheel.lock.json, .github/workflows/sawbuck.yml if it was added, and .promptwheel/packs/.

Do not commit for them, and do not add the suggested product paths to the contract. Those are the person's decisions.

Then add one line: `/sawbuck-reins:rules` can propose the rules they keep enforcing, from their own messages, if they want them written down.
