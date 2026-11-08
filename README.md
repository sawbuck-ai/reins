# Sawbuck for Claude Code

**Agents follow written rules. The one that matters is rarely written.**

Sawbuck reads what you keep telling your agent, helps you write it down, and re-runs your tests to prove it held.
This repo is the plugin marketplace for [Sawbuck](https://sawbuck.ai).

We put a test that could not pass into 6 real repos and told Claude to get to green fast. With no rule, it got
there by changing the test 85 of 100 times. With one line in `CLAUDE.md`, 0 of 100.

## Install

Claude Code:

```
/plugin marketplace add sawbuck-ai/reins
/plugin install sawbuck-reins@sawbuck
```

Codex (untested: the plugin installs, but it has not been run end to end; the band and slash commands are Claude Code only):

```
codex plugin marketplace add sawbuck-ai/reins
codex plugin add sawbuck-reins@sawbuck
```

(`sawbuck` is the marketplace name, `sawbuck-reins` is the plugin.)

## What you get

**Find the rules you never wrote down**

- **`/sawbuck-reins:rules`** proposes the rules you keep enforcing, with quotes from your own messages, and you pick what to keep. Tested on one person so far.
- **`/sawbuck-reins:shape`** shows what you push on, from a sample of your own messages, and names habits the agent has that you never push on, with the agent's own words. Leads from one read, tested on one person.
- **`/sawbuck-reins:audit`** finds rules in your agent files that can pull against each other, and proposes which wins.

**Write them down**

- **Nothing to remember** (Claude Code): in a git repo with no rules, Claude offers once to add them. Say yes and it writes the rule and wires the check: every turn checks protected paths, and every commit is re-proved. Or run `/sawbuck-reins:contract` yourself.

**Check they held**

- **Two slash commands** (Claude Code): `/sawbuck-reins:check` verifies your latest change now, and
  `/sawbuck-reins:contract` gives the repo its rules and wires the Stop hook (protected paths every turn, re-proof every commit).
  The rest is the CLI: `npx sawbuck context` shows the ranked history for the files you touch, `npx sawbuck debt`
  lists the suppression debt still live in HEAD.
- **A guide band** above the prompt (Claude Code): `watching`, `N caught`, and the last verdict,
  read from the repo's local `.sawbuck/` record each turn. It never blocks a prompt.
- **`/sawbuck-reins:status`** shows what it caught, the debt, and what you keep telling the agent.
- **Two skills** (Claude Code, and Codex untested): `sawbuck-check`, verify that a win was earned in the source
  and not by editing a test, grader, or config; and `reins-steering`, read how much you have been
  steering the agent and the cues you keep giving, from your own local transcripts.

Each command is a prompt that pre-approves the exact `npx -y sawbuck@<pinned version> ...` calls it needs, which
Claude runs through its own Bash tool. The plugin's hooks module runs no program. The full list of
what the plugin runs, writes, and sends is in [the plugin README](plugins/sawbuck-reins/README.md).

## Layout

- `plugins/sawbuck-reins/`: the plugin, with the Claude Code manifest, the Codex manifest, the hooks
  module, the commands, and the skills.
- `engine/`: `@sawbuck/reins` on npm, the steering judge CLI that the `reins-steering` skill runs.
- `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`: the two marketplace
  manifests, one per harness.

## Links

- Sawbuck: https://sawbuck.ai (the check at /check, contracts at /contracts)
- The CLI: https://github.com/sawbuck-ai/sawbuck (`npm i -g sawbuck`, or `npx sawbuck check` with no install)
- The engine the check runs on: https://github.com/promptwheel-ai/promptwheel

Apache-2.0.
