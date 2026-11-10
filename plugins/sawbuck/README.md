# Sawbuck (directory edition)

Your agent tried it once. It broke. You reverted it. A month later, a new session does it again. Sawbuck writes down
what gets lost in your workflow and holds your agent to it.

This edition is commands and skills only, in plain Markdown. It ships no hooks, no scripts and no pre-approved tools:
each command asks Claude to run the `sawbuck` CLI from npm (`npx -y sawbuck@0.1.57 ...`), and Claude Code asks you to
approve each command the first time.

## Commands

- `/sawbuck:check` runs `sawbuck check`: re-runs your tests from the code changes alone and says whether a green was
  earned in the source or came from editing a test, a grader or a config. Writes nothing.
- `/sawbuck:status` runs `sawbuck status`: what Sawbuck caught here, the debt in the tree, what you keep saying. Writes nothing.
- `/sawbuck:contract` runs `sawbuck contract` then `sawbuck attach`. `contract` writes `promptwheel.config.json` and a
  short rules block in `AGENTS.md`, which you review and commit. `attach` writes Claude Code hooks into
  `.claude/settings.local.json` (git-ignored) so every turn is checked; `sawbuck detach` removes them.
- `/sawbuck:rules` reads your own messages to Claude Code on this machine and proposes the rules you keep enforcing,
  each with two of your quotes. You pick which to keep; it writes only what you accept, into the repo's CLAUDE.md.
- `/sawbuck:shape` reads a sample of your messages and draws what you push on. The gathered text is deleted after.
- `/sawbuck:audit` reads your agent rule files and points out rules that pull against each other. Edits only with your yes.

## What it reads, writes and sends

Reads: your repo, its git history and reflog, and (for rules and shape) your Claude Code transcripts on this machine.
Writes: the files named above, and a local record under `.sawbuck/` that is kept out of git status. Sends: nothing, except
what you choose to push with `sawbuck ledger push` to your own git remote. No model call in the check, no API key.

The full plugin, with the live band and per-turn steering readout, is `sawbuck-reins` in the same marketplace.
Source: https://github.com/sawbuck-ai/sawbuck · https://sawbuck.ai
