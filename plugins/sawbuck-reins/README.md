# sawbuck-reins

Sawbuck in Claude Code, one install. A guide band above the prompt plus six slash commands, so
you can catch your agent gaming a metric without leaving the session or touching the CLI. The band
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

You don't need to remember a command. The first time you use Claude Code in a git repository with no contract, Claude finishes what you asked and then offers once to sign the repo. Say yes and it runs `/sawbuck-reins:contract`, which signs the repo: every turn checks protected paths, and every commit is re-proved. Say anything else and it won't ask again in that directory. Nothing is written or run without that yes, and it never commits for you.

A new contract starts by watching. Protected paths, new install scripts and sources outside the registry block from day one. New dependencies and structure changes show as notes, so ordinary work stays green. On a GitHub repo with a test command, signing also adds a CI check. Run `npx -y sawbuck contract --strict` to block everything, or `--no-ci` to skip CI.

Outside a git repository there is nothing to check, so the band reads `no repo here` and no file is written. The steer judge still runs there unless `judge` is off, keeping your corrections in the plugin store on this machine.

## What you get

- **A guide band** above the prompt, read from the repo's local `.sawbuck/` record each turn:
  a quiet `🐴 sawbuck · watching` (with the last verdict, `✓` verified / `🚩` gamed) when armed,
  `🐴 sawbuck · one step: /sawbuck-reins:contract` when the repo is checkable but not yet set up (that one command signs the repo and arms it), and a
  bold `🐴 N caught` (with the latest item) when the check flags a regression or a faked, "gamed"
  win. It never blocks your prompt and hides itself where Sawbuck is not relevant.
- **A live steering readout** on the band (`🐎 steer X%`, taut `✊` once you are steering more than half of your recent turns): once the repo is
  signed (`/sawbuck-reins:contract`), each turn it scores how much you redirected the agent (a light refine, a redirect, or a hard stop) and shows a **recent-window rate**
  (an EMA over roughly your last 20 scored turns), so it tracks how you are steering lately, instead of a
  lifetime average that old turns anchor. It scores the newest turn in the background and never blocks a turn. The judge has two modes (set `judge` in
  `/plugin configure sawbuck-reins@sawbuck` or `/config`):
  - **`native`** (default): a separate, lightweight classify call through Claude Code's own model
    API (`$.model.complete`, requesting the Haiku model id), on your **own** Claude plan. Zero
    setup: no ollama, no key, nothing leaves your Claude account. It runs in repos where sawbuck
    is attached and in sessions outside any repo, not in repos you have not signed. One failed or timed-out call costs one sample; if your build or org
    blocks model calls (three failed calls in a row), the plugin stops scoring for that session
    and the band shows the last rate it had.
  - **`off`**: no live steer rate from the plugin.

  **The steer scratchpad.** When a reply is scored as a steer, the judge's few-word summary is kept in Claude Code's
  plugin store on your machine, with the repo name and date, newest 2,000. No folder gets a file, and it follows you
  across repos. `/sawbuck-reins:steers` shows what you keep repeating: 3 times across 2 sessions. It is shown to you and
  never added to a prompt, because a summary of a reply that includes the agent's own text should not steer the agent.
  It counts what the judge saw, so replies that could not be scored make it an undercount, and it says so.

  **Your steering shape.** `/sawbuck-reins:shape` labels a sample of your messages once and draws what you push on: 12 spokes
  in 4 groups, with a card at `~/.sawbuck/shape.svg`. Only totals are kept, and each run is saved with its date to compare
  later. It also counts what the agent did, from your history, with no model, and names two kinds of pattern: fighting it (you push and it keeps happening) and not said (it happens and you never push). It says what you pushed on, not how good you are, and the 0 to 99 scale is relative to your own top spoke.

  **Find your unwritten rules.** `/sawbuck-reins:rules` gathers what you typed to Claude Code on this machine, with copies
  and likely secrets removed, and asks the model once for the rules you keep enforcing. Your messages go to the model,
  like any prompt. Every proposed rule must carry at least 2 quotes that a plain check finds in your own words. Nothing
  is added unless you pick it. Rules you keep in `~/.sawbuck/rules.md`, one per line, go into `AGENTS.md` in every repo you
  sign, so review that file before committing to a shared repo. Secret filtering is by pattern, so it can miss one: read `~/.sawbuck/rule-input.txt` first
  if your history might hold any.

  To score with a model of your own instead (a free local `ollama:qwen2.5:7b`, or a hosted key),
  use the `reins` CLI: set `SAWBUCK_JUDGE` and run `reins --append` after a session, or the
  `reins-steering` skill below. When `SAWBUCK_JUDGE` names a CLI backend the plugin judge stays off
  on its own, so an existing local-ollama setup is never billed for native on top.
- **`/sawbuck-reins:check`** verifies your latest change right now (zero-config, no setup): it says
  plainly whether the win was earned in the source, was gamed, is a regression, or could not be
  measured, and Claude sees the verdict, so a gamed one gets fixed in the source.
- **`/sawbuck-reins:context`** the ranked relevant history for the files you are touching right now:
  reverts (do-not-retry), weakened tests, and fragile hot spots, before you act.
- **`/sawbuck-reins:debt`** the whole-repo live suppression debt: what is still silenced in HEAD now,
  disabled tests first, risk-ranked by how fragile each file is. Run it on demand (it scans HEAD).
- **`/sawbuck-reins:status`** the inventory: everything Sawbuck has accumulated here in one view,
  what it has caught for you over time, the debt accruing now, and whether it is armed in this repo.

Each command is a plain plugin command: a prompt that tells Claude to run exact, pinned
`npx -y sawbuck@0.1.43 ...` calls through its own Bash tool, pre-approved for those exact commands and
nothing else, so Claude Code's permission system is the one in charge. The `sawbuck` CLI rides the
deterministic, zero-LLM `promptwheel` check and the `@promptwheel/logbook` memory. No `npm install`
and no manual `sawbuck attach` to start.

## What this plugin runs, writes, and sends (the full list)

**Programs it runs.** The mod (`hooks/register.tsx`) runs none: it makes no process call of any
kind. The slash commands in `commands/` are prompts; each tells Claude to run exact
commands, `npx -y sawbuck@0.1.43 <contract|check|attach --claude|context --speak|debt|status>` (`/sawbuck-reins:contract` runs `contract`, then `attach --claude`), through
Claude's own Bash tool, with `allowed-tools` pre-approving those exact strings and nothing else. Claude
sees the output and can act on it (fix the source after a gamed verdict, for instance). The
`reins-steering` skill tells Claude to run the pinned `npx -y @sawbuck/reins@0.4.5` CLI the same way.
Both need Node 18+ and npm on your PATH.

**Files it writes.** The mod writes one file: `.sawbuck/steer.json` (the steer tally, in `native`
mode, at that fixed path relative to the session's working directory). The commands and skills,
through the CLIs Claude runs, write inside the repo you attached: the same `steer.json` when the
reins CLI scores, the `sawbuck` CLI's own
record (`.sawbuck/state.json`, `activity.jsonl`, `results.json`), and the memory engine's cache of
that repo's own git history (`events.jsonl`, `LOGBOOK.md`), which includes the commit author names
already in the git log. All of it is kept out of `git status`. `sawbuck detach` removes what it wired, signed contract files stay because they are yours to review, and `--purge` deletes the record.
To verify a change, the check also runs the repo's own test or metric command (from
`promptwheel.config.json`, or the detected test script) in throwaway git worktrees, exactly as you
would run it yourself; that is the only code it executes that is not one of the two pinned packages. `/sawbuck-reins:watch` runs `sawbuck attach --claude`, which writes four things on purpose:
`.claude/settings.local.json` in that repo (adds the UserPromptSubmit, SessionStart and Stop hooks
that run `sawbuck turn` and the check), the repo's git exclude file (`.git/info/exclude`, or where
git keeps it for a worktree; keeps `.sawbuck/` out of `git status`), an attach receipt under the
repo's git dir (`.git/sawbuck/attach.json`, what it created, so detach can undo exactly that), and
one line in the user registry `~/.sawbuck/registry.json` (which repos are attached, for `sawbuck
doctor --all`). It then runs one verification check at attach time, a `promptwheel run` on the last
commit in throwaway worktrees, so you know whether it can measure anything here. `sawbuck detach`
removes the hooks, the exclude block, the receipt and the registry line. The mod itself never edits build, start-up,
settings or instructions files, and the only file it writes is that one steer tally, which nothing
runs or obeys: the band and `sawbuck statusline` read it to show a percentage.

**What it sends, and where.** In the default `native` mode, one small classify call per turn through
Claude Code's own model API (`$.model.complete`, requesting the Haiku model id), on your own Claude
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

**What each hook does.** The mod has three. `prompt.submit` scores the previous (agent answer, your
reply) pair in the background and reads `.sawbuck/` to refresh the band; it never changes your
prompt, and your prompt text goes nowhere but that bounded model call. What the band reads from
`.sawbuck/` (`state.json`, `results.json`, `activity.jsonl`, `steer.json`) is shown to you in the
band and is not sent anywhere. `turn.complete` stashes the agent's answer for that scoring.
`ui.render` draws the band above the prompt. None of them block a turn. In a git repo with no contract the band names the one step and the offer adds its one line; otherwise they stay silent
in repos where Sawbuck is not attached. The mod registers no commands, tools, or agents; the six
commands are files in `commands/`.
