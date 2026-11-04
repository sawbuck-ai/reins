# Sawbuck for Claude Code, with Codex support in beta

The plugin marketplace for [Sawbuck](https://sawbuck.ai). One install puts the check inside your
coding session: a deterministic, zero-LLM check re-proves every win from the agent's source edits
alone, so a green that came from editing the test, the grader, or the config is caught and sent back
to earn it.

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

- **A guide band** above the prompt (Claude Code): `watching`, `N caught`, the last verdict, and a
  live steer rate, read from the repo's local `.sawbuck/` record each turn. It never blocks a prompt.
- **Five slash commands** (Claude Code): `/sawbuck-reins:check` verifies your latest change now,
  `/sawbuck-reins:watch` arms the Stop hook so every turn is checked, `/sawbuck-reins:context` shows
  the ranked history for the files you touch, `/sawbuck-reins:debt` lists the suppression debt still
  live in HEAD, and `/sawbuck-reins:status` shows everything Sawbuck has here in one view.
- **Two skills** (Claude Code, and Codex in beta): `sawbuck-check`, verify that a win was earned in the source
  and not by editing a test, grader, or config; and `reins-steering`, read how much you have been
  steering the agent and the cues you keep giving, from your own local transcripts.

Each command is a prompt that pre-approves one exact `npx -y sawbuck@<pinned version> ...` call, which
Claude runs through its own Bash tool. The plugin's hooks module runs no program. The full list of
what the plugin runs, writes, and sends is in [the plugin README](plugins/sawbuck-reins/README.md).

## Layout

- `plugins/sawbuck-reins/`: the plugin, with the Claude Code manifest, the Codex manifest, the hooks
  module, the commands, and the skills.
- `engine/`: `@sawbuck/reins` on npm, the steering judge CLI that the `reins-steering` skill runs.
- `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`: the two marketplace
  manifests, one per harness.

## Links

- Sawbuck: https://sawbuck.ai (the check at /check, contracts at /contracts, memory and steering at /memory)
- The CLI: https://github.com/sawbuck-ai/sawbuck (`npm i -g sawbuck`, or `npx sawbuck check` with no install)
- The engine the check runs on: https://github.com/promptwheel-ai/promptwheel

Apache-2.0.
