# Sawbuck for Claude Code, with Codex untested

The plugin marketplace for [Sawbuck](https://sawbuck.ai). One install puts the check inside your
coding session: a deterministic, zero-LLM check re-proves every win from the agent's source edits
alone, so a test that went from red to green because the test, the grader, or a declared config
changed is caught and sent back to earn it.

## Install

Claude Code:

```
/plugin marketplace add sawbuck-ai/reins
/plugin install sawbuck-reins@sawbuck
```

Codex (beta: the plugin installs, but it has not been run end to end; the band and slash commands are Claude Code only):

```
codex plugin marketplace add sawbuck-ai/reins
codex plugin add sawbuck-reins@sawbuck
```

(`sawbuck` is the marketplace name, `sawbuck-reins` is the plugin.)

## What you get

- **A guide band** above the prompt (Claude Code): `watching`, `N caught`, and the last verdict,
  read from the repo's local `.sawbuck/` record each turn. It never blocks a prompt.
- **Nothing to remember** (Claude Code): in a git repo with no rules, Claude offers once to add them. Say yes and it writes the rule and wires the check: every turn checks protected paths, and every commit is re-proved. Or run `/sawbuck-reins:contract` yourself.
- **`/sawbuck-reins:audit`** finds rules in your agent files that can pull against each other, and proposes which wins.
- **`/sawbuck-reins:rules`** proposes the rules you keep enforcing, with quotes from your own messages, and you pick what to keep.
- **`/sawbuck-reins:shape`** shows what you push on, from a sample of your own messages, and names habits the agent has that you never push on, with the agent's own words.
- **`/sawbuck-reins:status`** shows what it caught, the debt, and what you keep telling the agent.
- **Two more slash commands** (Claude Code): `/sawbuck-reins:check` verifies your latest change now, and
  `/sawbuck-reins:contract` gives the repo its rules and wires the Stop hook (protected paths every turn, re-proof every commit).
  The rest is the CLI: `npx sawbuck context` shows the ranked history for the files you touch, `npx sawbuck debt`
  lists the suppression debt still live in HEAD.
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
