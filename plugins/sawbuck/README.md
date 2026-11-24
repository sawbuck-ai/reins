# Sawbuck (directory edition)

Your agent tried it once. It broke. You reverted it. A month later, a new session does it again. Sawbuck writes down
what gets lost in your workflow and holds your agent to it.

This edition is four commands and one skill, in plain Markdown. It ships no hooks, no scripts and no pre-approved tools:
each command asks Claude to run the `sawbuck` CLI from npm (`npx --fetch-retries=0 --fetch-timeout=10000 -y sawbuck@0.2.7 ...`), and Claude Code asks you to
approve each command the first time (in auto mode it decides for you). It is made for Claude Code in a git repository. In a chat with no repo it has
nothing to check.

## Install

```
/plugin install sawbuck --marketplace sawbuck-ai/reins
```

That is one step on Claude Code 2.1.275 or later. On an older version: `/plugin marketplace add sawbuck-ai/reins`, then
`/plugin install sawbuck@sawbuck`. Install this edition or `sawbuck-reins`, not both.

## Three things to try

1. After a fix, type `/sawbuck:check`, or ask for it by name: "Run the sawbuck check on my last commit and show me
   what it says." Claude runs the check (you approve the command the first time) and gives you its answer: verified,
   gamed, a regression, or could not measure. Name Sawbuck when you ask. If you only ask whether a win is real, the
   check skill still loads, but in auto mode Claude Code may refuse the command the skill runs. The agent then says
   the check did not run and reads the diff itself.
2. Run `/sawbuck:contract` once in a repo. It writes the repo's rules for you to review and wires the check to the end
   of every turn. After that, a green that came from editing a test is sent back to the agent, and so is a change to a
   protected path such as a CI workflow.
3. Run `/sawbuck:status` any time. It shows what was caught here and what is silenced in the tree right now.

## Commands

- `/sawbuck:check` runs `sawbuck check`: re-runs your tests from the code changes alone and says whether a green was
  earned in the source or came from editing a test, a grader or a config. Writes nothing.
- `/sawbuck:status` runs `sawbuck status`: what Sawbuck caught here and the debt in the tree. Writes nothing.
- `/sawbuck:contract` runs `sawbuck contract` then `sawbuck attach`. `contract` writes `promptwheel.config.json` and a
  short rules block in `AGENTS.md`, which you review and commit. `attach` writes Claude Code hooks into
  `.claude/settings.local.json` (kept out of git status) so every turn is checked; `sawbuck detach` removes them.
- `/sawbuck:audit` reads your agent rule files and points out rules that pull against each other. Edits only with your yes.

## What it fetches, reads, writes, hands on and sends

**Fetches.** The first time a command runs, npm downloads the `sawbuck` package from the npm registry, at the exact
version this plugin names, with the two packages it is built on (`promptwheel` and `@promptwheel/logbook`). That
request is npm's own and carries nothing of yours.

**Reads.** Your repo, its git history and its reflog. To check a change it runs your repo's own test command in a
throwaway copy of the repo. `/sawbuck:audit` reads your agent rule files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`,
and `~/.claude/CLAUDE.md`). No command in this edition reads your past sessions. Once attached, the hooks run
at each prompt, before each shell command and each file edit the agent makes, after each edit, and when a turn
ends. They read the prompt, the command, the file being edited and the agent's last message, and keep none of
what you type (see Writes). `/sawbuck:status` reads no steers that the full plugin `sawbuck-reins` kept
(`~/.claude/plugins/store/sawbuck-reins_*.json`), unless the repo was attached with `--words` (by `sawbuck attach --words`,
typed by you).

**Writes.** `/sawbuck:check` and `/sawbuck:status` write nothing. `/sawbuck:contract` writes the files named above, a
local record under `.sawbuck/` and `.git/sawbuck/` that is kept out of git status (it holds, among other things,
a copy of each file the agent changed in a session, as it was before, so an undo can be seen; a session's copies are
removed once they are two weeks old, the next time a session starts in the repo), and one line in
`~/.sawbuck/registry.json` saying this repo is attached.
Once attached, the hooks keep none of what you type: no prompt text, and an undo is recorded without your words (the
file, the time, the first line of the undone change, and a mark for each of its other lines: a hash, not the text).
One thing of yours is kept: a reason you give to `sawbuck check --allow`, because you hand it to that command on
purpose. At the end of a turn the hooks read the agent's last message to see whether it asked you about a test. That
is not kept. `/sawbuck:audit` changes a rule file only where you say yes.

**Hands on.** Nothing. The hooks this edition sets up hand no finding on to any notes, in Claude Code's notes folder
or anywhere else. That is something only you turn on, with `sawbuck attach --words`: then your words are kept with an
undo, and a note for each gamed green, reverted attempt and undo is written to Claude Code's own notes folder for the
repo. `sawbuck attach --no-words` turns it off again, and `sawbuck detach --purge` removes the record and the notes
Sawbuck wrote.

**Sends.** Nothing goes to us or to any other service. There is no telemetry, no account and no API key, and the check
never calls a model. The one thing that can leave your machine through Sawbuck is
a record you choose to push to your own git remote with `sawbuck ledger push`.

## Updating

Installed from this marketplace, the plugin does not update by itself. If a command answers
`No matching version found for sawbuck@...`, this plugin is 0.1.11 or older and this machine ran an earlier Sawbuck.
Update the plugin: in a terminal, run `claude plugin marketplace update sawbuck`, then
`claude plugin update sawbuck@sawbuck`, and start Claude Code again.

The plugin's own lines name the Sawbuck version they run. A `sawbuck` you installed yourself (`npm i -g sawbuck`)
is a separate copy and does not update with the plugin: it answers a bare `sawbuck`, and any line that names no
version. `npm i -g sawbuck@latest` updates it. From Sawbuck 0.1.73 on you are told when that copy is older than the
one watching your repo.

## Help

Bugs and questions: https://github.com/sawbuck-ai/reins/issues. How the check works: https://sawbuck.ai/check.
Privacy: https://sawbuck.ai/privacy. License: Apache-2.0, in this folder.

A security problem goes to us in private, not into a public issue: https://github.com/sawbuck-ai/reins/security/advisories/new

The full plugin is `sawbuck-reins` in the same marketplace (`sawbuck-ai/reins`). It adds the live band, a per-turn
steering readout, and two commands that read your own past sessions to propose the rules you keep enforcing.
Source of the CLI: https://github.com/sawbuck-ai/sawbuck
