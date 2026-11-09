# sawbuck-reins

Sawbuck in Claude Code, one install. It proves each green was earned in the source and not by editing
the test, keeps what git threw away and shows it when a file comes up again, and writes down the rules
you keep telling your agent: six slash commands and a guide band above the
prompt, without leaving the session or touching the CLI. The band
and the steering judge are a mod (a hooks module); the commands are plain plugin commands that
Claude runs through its own Bash tool. The mod itself runs no program.

## Install

```
/plugin marketplace add sawbuck-ai/reins
/plugin install sawbuck-reins@sawbuck
```

(`sawbuck` is the marketplace name defined in `.claude-plugin/marketplace.json`.)

Claude Code asks three things on install: a **scope** (choose **user** so the band follows you across your repos), the **guide band** (on by default; set it off if you show sawbuck in your own statusline instead, the judge still runs), and the **steering judge** (it defaults to a zero-setup `native` one, a small Claude call per scored turn on your own plan; turn it off, or score with the reins CLI instead, see below).

## Getting started

You don't need to remember a command. The first time you use Claude Code in a git repository with no rules, Claude finishes what you asked and then offers once to add them. Say yes and it runs `/sawbuck-reins:contract`: every turn checks protected paths, and every commit is re-proved. Say anything else and it won't ask again in that directory. Nothing is written or run without that yes, and it never commits for you.

Plain setup writes the rule and protected paths. `npx -y sawbuck contract --full` adds supply-chain guards, a repo lock and a CI check, starting as notes; add `--strict` to block.

Outside a git repository there is nothing to check, so the band reads `no repo here` and no file is written. The steer judge still runs there unless `judge` is off, keeping your corrections in the plugin store on this machine.

## What you get

- **A guide band** above the prompt, read from the repo's local `.sawbuck/` record each turn:
  a quiet `sawbuck · watching` (with the last verdict, `✓` verified / `🚩` gamed) when armed,
  `sawbuck · one step: /sawbuck-reins:contract` when the repo is checkable but not yet set up (that one command signs the repo and arms it), and a
  bold `N caught` (with the latest item) when the check flags a regression or a faked, "gamed"
  win. It never blocks your prompt and hides itself where Sawbuck is not relevant.
- **Your rules and shape, on demand.** `/sawbuck-reins:rules` and `/sawbuck-reins:shape` read your history when you ask.

  **Your steering shape.** `/sawbuck-reins:shape` labels a sample of your messages once and draws what you push on: 11 spokes
  in 4 groups once 200 messages are labelled (the 4 groups alone before that), with a card at `~/.sawbuck/shape.svg`. The sampled
  messages and their labels are deleted when the check finishes. Only totals are kept, one line per run with its date, to compare
  later. It says what you pushed on, not how good you are, and the 0 to 99 scale is relative to your own top spoke.
  It also reads short excerpts of up to 120 past turns and names at most 3 habits the agent has that you never push on.
  Each must quote the agent from 3 turns, a plain check confirms the quotes, and the excerpts are deleted after. Your own
  messages are never shown. These are leads from one read: on one person, two models named the same two habits and
  differed on the third.

  **The rules you keep enforcing.** Tested on one person so far. `/sawbuck-reins:rules` gathers what you typed to Claude Code on this machine, with copies
  and likely secrets removed, and asks the model once for the rules you keep enforcing. Your messages go to the model,
  like any prompt. Every proposed rule must carry at least 2 quotes that a plain check finds in your own words. Nothing
  is added unless you pick it, and the gathered messages and quotes are deleted when the check finishes. Rules you keep go in `~/.claude/CLAUDE.md`, which applies to you in every repo and no repo shares, or in one repo's
  `CLAUDE.md` if the team should have them. If two rules can pull apart, it proposes a line saying which wins: on Opus, two such
  rules lost the test rule 4 of 10 times, and 0 of 20 with that line, in scenarios we wrote. Secret filtering is by pattern, so it can miss one: read `~/.sawbuck/rule-input.txt` first
  if your history might hold any.

  **The live judge (on by default).** A live `steer X%` on the band: one classify call per turn through Claude Code's own model
  API, using Sonnet, on your own plan, in attached repos and outside any repo. Sonnet was picked by test: against a careful Opus
  reading of 200 real turns from one person, it scored kappa 0.66, Opus 0.70, Haiku 0.41. Set `judge` to `off` in `/plugin configure
  sawbuck-reins@sawbuck` to stop it. It also keeps a few-word summary of each steer in Claude Code's plugin store, shown by `sawbuck
  steers` and never added to a prompt. To score with your own model, set `SAWBUCK_JUDGE` and use the `reins` CLI through the
  `reins-steering` skill; the plugin judge then stays off, so nothing is billed twice.
- **`/sawbuck-reins:check`** verifies your latest change right now (zero-config, no setup): it says
  plainly whether the win was earned in the source, was gamed, is a regression, or could not be
  measured, and Claude sees the verdict, so a gamed one gets fixed in the source.
- **`/sawbuck-reins:audit`** reads your agent files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`) for rules that can pull
  against each other, and proposes a line saying which wins. It runs no program and needs no history.
- **`/sawbuck-reins:status`** shows what Sawbuck has here in one view: what it caught, the debt now, whether it is
  watching, and what you keep telling the agent.

Each command is a plain plugin command: a prompt that tells Claude to run exact, pinned
`npx -y sawbuck@0.1.54 ...` calls through its own Bash tool, pre-approved for those exact commands and
nothing else, so Claude Code's permission system is the one in charge. The `sawbuck` CLI rides the
deterministic, zero-LLM `promptwheel` check and the `@promptwheel/logbook` memory. No `npm install`
and no manual `sawbuck attach` to start.

## What this plugin runs, writes, and sends (the full list)

**Programs it runs.** The mod (`hooks/register.tsx`) runs none: it makes no process call of any
kind. The slash commands in `commands/` are prompts; each tells Claude to run exact
commands, `npx -y sawbuck@0.1.54 <contract|check|attach|rules|shape|status>` (`/sawbuck-reins:contract` runs `contract`, then `attach`), through
Claude's own Bash tool, with `allowed-tools` pre-approving those exact strings and nothing else. Claude
sees the output and can act on it (fix the source after a gamed verdict, for instance). The
`reins-steering` skill tells Claude to run the pinned `npx -y @sawbuck/reins@0.4.5` CLI the same way.
Both need Node 18+ and npm on your PATH.

**Files it writes.** The mod writes one file: `.sawbuck/steer.json` (the steer tally, in `native`
mode, at that fixed path relative to the session's working directory). `/sawbuck-reins:rules` and
`/sawbuck-reins:shape` write under `~/.sawbuck/`: your gathered messages and what the model wrote from them
(`rule-input.txt`, `rule-candidates.json`, `shape-input.txt`, `shape-labels.json`, `shape-turns.txt`,
`shape-notsaid.json`), all deleted when the check finishes, and what stays: `shape-history.jsonl` (totals per
run) and the card (`shape.svg`, `shape.png`). A rule you pick is added to the file you choose: `~/.claude/CLAUDE.md`
or the repo's `CLAUDE.md`, `AGENTS.md` or `.cursorrules`. `sawbuck attach` adds the repo to `~/.sawbuck/registry.json`.
The other commands and skills,
through the CLIs Claude runs, write inside the repo you attached: the same `steer.json` when the
reins CLI scores, the `sawbuck` CLI's own
record (`.sawbuck/state.json`, `activity.jsonl`, `results.json`), and the memory engine's cache of
that repo's own git history (`events.jsonl`, `LOGBOOK.md`), which includes the commit author names
already in the git log. All of it is kept out of `git status`. `sawbuck detach` removes the hooks and the receipt; signed contract files stay because they are yours to review, and the record stays too, still out of `git status`, until `--purge` deletes it and the exclude lines.
To verify a change, the check also runs the repo's own test or metric command (from
`promptwheel.config.json`, or the detected test script) in throwaway git worktrees, exactly as you
would run it yourself; that is the only code it executes that is not one of the two pinned packages. `/sawbuck-reins:contract` runs `sawbuck attach`, which writes these on purpose:
`.claude/settings.local.json` in that repo (adds the UserPromptSubmit, SessionStart and Stop hooks
that run `sawbuck turn` and the check), the repo's git exclude file (`.git/info/exclude`, or where
git keeps it for a worktree; keeps `.sawbuck/` out of `git status`), an attach receipt under the
repo's git dir (`.git/sawbuck/attach.json`, what it created, so detach can undo exactly that), and
in a signed repo `.sawbuck/state.json` (the turn baseline). `sawbuck attach --dry-run` lists them. It then runs one verification check at attach time, a `promptwheel run` on the last
commit in throwaway worktrees, so you know whether it can measure anything here. `sawbuck detach`
removes the hooks and the receipt; the exclude block stays while the record it hides is on disk, and
`sawbuck detach --purge` removes both. One limit: `.claude/settings.local.json` is kept out of git, so
taking the hooks out of it shows in no diff and the check cannot see it; `sawbuck doctor` reads the
receipt and says the hooks are gone. `sawbuck attach --shared` avoids it: the hooks go in a tracked
`.claude/settings.json`, and a removal shows in git. The mod itself never edits build, start-up,
settings or instructions files, and the only file it writes is that one steer tally, which nothing
runs or obeys: the band and `sawbuck statusline` read it to show a percentage.

**What it sends, and where.** In the default `native` mode, one small classify call per turn through
Claude Code's own model API (`$.model.complete`, requesting the Sonnet model id), on your own Claude
plan, containing the agent's last answer and your reply so it can score how much you steered. `off`
sends nothing. If you score with the reins CLI instead, it sends the same pair to the judge you
configured with `SAWBUCK_JUDGE` (a local ollama model, nothing leaves your machine, or your own API
key). A pair
is bounded: at most the first 600 characters of the agent's answer and 800 of your reply, never the
whole conversation. The `reins-steering` skill runs `reins wizard` / `reins cues` on demand: they read
your own local Claude Code or Codex transcripts to find the cues you keep giving, send each bounded
pair to the judge you chose (a hosted judge asks for `--yes` first), and write a short list of
cue phrases to `.sawbuck/cues.json` in the repo.
The offer adds one line to Claude's system prompt, in a git repository with no contract, for the session it first appears in; which directories have been asked is kept in Claude Code's plugin store on your machine.
There is no telemetry, no analytics, and no other network call; the deterministic check never calls
a model.

**What each hook does.** The mod has four. `prompt.compose` adds the one-line offer, in a git repository with
no rules, once per directory. `prompt.submit` scores the previous (agent answer, your
reply) pair in the background and reads `.sawbuck/` to refresh the band; it never changes your
prompt, and your prompt text goes nowhere but that bounded model call. What the band reads from
`.sawbuck/` (`state.json`, `results.json`, `activity.jsonl`, `steer.json`) is shown to you in the
band and is not sent anywhere. `turn.complete` stashes the agent's answer for that scoring.
`ui.render` draws the band above the prompt. None of them block a turn. In a git repo with no contract the band names the one step and the offer adds its one line; otherwise they stay silent
in repos where Sawbuck is not attached. The mod registers no commands, tools, or agents; the six
commands are files in `commands/`.
