---
description: One step to set up Sawbuck: give this repo its rules and check every turn
---

Run exactly these two commands in the current repo, in order, and show the person their output verbatim. The first adds the rule to AGENTS.md, and to CLAUDE.md or .cursorrules if they exist.

```
npx -y sawbuck@0.1.62 contract
npx -y sawbuck@0.1.62 attach
```

The first keeps any rules already here, adds your tests if there are none, and sets the protected paths. The second wires the hooks that check every turn. Running them twice changes nothing.

Then tell the person, in two lines: they are set up, they should review and commit AGENTS.md and promptwheel.config.json, and `npx sawbuck contract --full` adds supply-chain guards, a repo lock and a CI check when they want them. For a team, `npx sawbuck attach --shared` writes a hooks file they can commit.

Do not commit for them, and do not add the suggested product paths. Those are the person's decisions.

Then add one line: `/sawbuck:rules` can propose the rules they keep enforcing, from their own messages, if they want them written down.
