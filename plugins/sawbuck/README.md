# Sawbuck (directory edition)

Your agent tried it once. It broke. You reverted it. A month later, a new session does it again. Sawbuck writes down
what gets lost in your workflow and holds your agent to it.

This edition is commands and skills only, in plain Markdown. It ships no hooks, no scripts and no pre-approved tools:
each command asks Claude to run the `sawbuck` CLI from npm (`npx --fetch-retries=0 --fetch-timeout=10000 -y sawbuck@0.1.72 ...`), and Claude Code asks you to
approve each command the first time. It is made for Claude Code in a git repository. In a chat with no repo it has
nothing to check.

## Install

```
/plugin install sawbuck --marketplace sawbuck-ai/reins
```

That is one step on Claude Code 2.1.275 or later. On an older version: `/plugin marketplace add sawbuck-ai/reins`, then
`/plugin install sawbuck@sawbuck`. Install this edition or `sawbuck-reins`, not both.

## Three things to try

1. After a fix, ask: "I fixed add and committed it; the tests pass now. Before I call it done, can you confirm the win
   is real?" Claude runs the check (you approve the command the first time) and gives you its answer: verified,
   gamed, a regression, or could not measure.
2. Run `/sawbuck:contract` once in a repo. It writes the repo's rules for you to review and wires the check to the end
   of every turn. After that, a green that came from editing a test is sent back to the agent, and so is a change to a
   protected path such as a CI workflow.
3. Run `/sawbuck:status` any time. It shows what was caught here and what is silenced in the tree right now.

## Commands

- `/sawbuck:check` runs `sawbuck check`: re-runs your tests from the code changes alone and says whether a green was
  earned in the source or came from editing a test, a grader or a config. Writes nothing.
- `/sawbuck:status` runs `sawbuck status`: what Sawbuck caught here, the debt in the tree, what you keep saying. Writes nothing.
- `/sawbuck:contract` runs `sawbuck contract` then `sawbuck attach`. `contract` writes `promptwheel.config.json` and a
  short rules block in `AGENTS.md`, which you review and commit. `attach` writes Claude Code hooks into
  `.claude/settings.local.json` (kept out of git status) so every turn is checked; `sawbuck detach` removes them.
- `/sawbuck:rules` reads your own messages to Claude Code on this machine and proposes the rules you keep enforcing,
  each with two of your quotes. You pick which to keep; it writes only what you accept, into the repo's CLAUDE.md.
- `/sawbuck:shape` reads a sample of your messages and draws what you push on. The gathered text is deleted after.
- `/sawbuck:audit` reads your agent rule files and points out rules that pull against each other. Edits only with your yes.

## What it fetches, reads, writes, hands on and sends

**Fetches.** The first time a command runs, npm downloads the `sawbuck` package from the npm registry, at the exact
version this plugin names, with the two packages it is built on (`promptwheel` and `@promptwheel/logbook`). That
request is npm's own and carries nothing of yours.

**Reads.** Your repo, its git history and its reflog. To check a change it runs your repo's own test command in a
throwaway copy of the repo. For `/sawbuck:rules` and `/sawbuck:shape` only: what you typed to Claude Code on this
machine (the session files under `~/.claude/projects`), with copies and anything that looks like a secret left out.

**Writes.** `/sawbuck:check` and `/sawbuck:status` write nothing. `/sawbuck:contract` writes the files named above, a
local record under `.sawbuck/` and `.git/sawbuck/` that is kept out of git status, and one line in
`~/.sawbuck/registry.json` saying this repo is attached. Once attached, the hooks keep the first 240 characters of
your latest prompt in `.sawbuck/state.json`, replaced at every prompt. If you undo the agent's change, those words are
saved with the undo, so the agent can be shown later why it was undone. At the end of a turn the hooks read the
agent's last message to see whether it asked you about a test. That is not kept. `/sawbuck:rules` and
`/sawbuck:shape` put their working files under `~/.sawbuck/` and delete the gathered messages when the run ends. A
rule you accept goes into the file you choose. It is also handed once to the notes kept on this machine: Claude
Code's own notes for the repo, a claude-mem worker if one runs here, and a Markdown folder if you named one.

**Hands on.** Once attached, when Sawbuck catches a gamed green, finds a reverted attempt in git or records an
undo, it hands that finding on, once, to the notes kept on this machine: a note in Claude Code's own notes folder for
the repo (`~/.claude/projects/<repo>/memory/`), a claude-mem worker if one runs here, and a Markdown folder if you
named one in `sawbuck.config.json`. The note for an undo holds what you typed before it, up to 240 characters.
`/sawbuck:rules` also reads the notes Claude Code keeps for the repo, to offer them to you as rules. `SAWBUCK_SHARE=none` in your shell turns this off.

**Sends.** Nothing goes to us or to any other service. There is no telemetry, no account and no API key, and the check
never calls a model. What `/sawbuck:rules` and `/sawbuck:shape` gather is read by the model once, inside your own
Claude Code session, like anything else you show Claude. The one thing that can leave your machine through Sawbuck is
a record you choose to push to your own git remote with `sawbuck ledger push`.

## Updating

Installed from this marketplace, the plugin does not update by itself. If a command answers
`No matching version found for sawbuck@...`, this plugin is 0.1.11 or older and this machine ran an earlier Sawbuck.
Update the plugin: in a terminal, run `claude plugin marketplace update sawbuck`, then
`claude plugin update sawbuck@sawbuck`, and start Claude Code again.

The plugin's own lines name the Sawbuck version they run. A `sawbuck` you installed yourself (`npm i -g sawbuck`)
is a separate copy and does not update with the plugin: it answers a bare `sawbuck`, and any line that names no
version. `npm i -g sawbuck@latest` updates it. From Sawbuck 0.1.72 on you are told when that copy is older than the
one watching your repo.

## Help

Bugs and questions: https://github.com/sawbuck-ai/reins/issues. How the check works: https://sawbuck.ai/check.
Privacy: https://sawbuck.ai/privacy. License: Apache-2.0, in this folder.

The full plugin, with the live band and per-turn steering readout, is `sawbuck-reins` in the same marketplace.
Source of the CLI: https://github.com/sawbuck-ai/sawbuck
