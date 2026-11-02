import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Summary } from '../types'

// Sawbuck's status for the current repo, recomputed each turn; the band reads it.
const summaryAtom = atom({ plugin: 'sawbuck-reins', key: 'summary' } as const, null)

// --- the live steering judge ------------------------------------------------
// The band's "🐎/🪢 steer X%" comes from .sawbuck/steer.json. Two ways to fill it:
//
//   native (DEFAULT): score the newest turn-pair with a tiny Claude (Haiku) call
//     via $.model.complete - zero setup, no ollama, no key. It bills the user's
//     OWN Claude plan (a separate cheap Haiku call, not the session's main model;
//     ~a fraction of a cent/turn). Disclosed in the README; opt out via the
//     `judge` userConfig or SAWBUCK_JUDGE.
//   engine: shell `reins --append` (the @sawbuck/reins CLI), whose SAWBUCK_JUDGE
//     backend is local ollama (free/private) or your own hosted key. The pre-0.4
//     behavior; also the automatic fallback when $.model is unavailable.
//   off: no live steer rate.
//
// Either way the file is identical, so the band + the offline `sawbuck statusline`
// read one shape. The rubric + 0-3 scale + aggregate below MIRROR the canonical
// engine (engine/judge.mjs PROMPT/parse + engine/bin/reins.mjs --append). A mod
// can't import the npm package at runtime, so this is a deliberate small copy;
// keep it in sync with the engine (SYNC SEAM).

// module state: survives within a session, resets on reload (steer.json persists).
let pendingAnswer: string | null = null   // agent's answer, stashed on turn.complete, scored on the next prompt.submit
let nativeBroken = false                   // $.model threw (missing / org-blocked) -> fall back to the engine shell-out

// EXACT copy of engine/judge.mjs PROMPT (the 600/800 slicing that lives in
// scan.mjs pairs() is applied inline here since we score a live pair, not the transcript).
const PROMPT = (a: string, u: string) =>
`You rate how much a developer's message STEERS an AI coding agent's current work.
Output ONLY one JSON object: {"pressure":0-3,"axis":"one-word","nudge":"<=8 words"}
pressure: 0 passive (approval like "yes/go/do it", a pure question, or a brand-new unrelated task; NOT steering current work). 1 light refine (small adjustment to the SAME work: tone, length, scope, emphasis, "a bit more X", "also Y"). 2 redirect (change the approach/direction of current work). 3 hard-stop ("no/stop/undo/revert", reject and restart).
AGENT just did: ${String(a).slice(0, 600)}
USER replied: ${String(u).replace(/\s+/g, ' ').slice(0, 800)}
JSON:`

// EXACT copy of engine/judge.mjs parse(): strip reasoning <think>, take the last JSON object, clamp.
function parsePressure(txt: string): { pressure: number; axis: string; nudge: string } | null {
  txt = String(txt).replace(/<think>[\s\S]*?<\/think>/g, '')
  const cands = txt.match(/\{[^{}]*\}/g) || []
  for (const c of cands.reverse()) {
    try {
      const j = JSON.parse(c)
      if (j && j.pressure != null) {
        return {
          pressure: Math.max(0, Math.min(3, parseInt(j.pressure, 10) || 0)),
          axis: String(j.axis || '').slice(0, 16),
          nudge: String(j.nudge || '').slice(0, 48),
        }
      }
    } catch { /* keep scanning */ }
  }
  return null
}

// Which judge to use. userConfig `judge` is the reliable, validated switch (default
// native); an existing SAWBUCK_JUDGE is honored best-effort as an engine preference
// so a user who set up local ollama for the CLI isn't silently billed for native.
async function judgeMode($: any, options: any): Promise<'native' | 'engine' | 'off'> {
  const cfg = options && typeof options.judge === 'string' ? options.judge : 'native'
  if (cfg === 'off') return 'off'
  if (cfg === 'engine') return 'engine'
  // cfg === 'native' (the default): defer to SAWBUCK_JUDGE if the user set one.
  try {
    const envv = await $.env.get('SAWBUCK_JUDGE')
    const v = envv == null ? '' : String(envv).trim().toLowerCase()
    if (v === 'off' || v === 'none' || v === '0' || v === 'false') return 'off'
    if (v) return 'engine'
  } catch { /* $.env provenance is undocumented; ignore and stay native */ }
  return 'native'
}

// Record one consumed turn-pair into .sawbuck/steer.json, in the engine's exact
// --append shape. `s` null = the pair was consumed but not scored (soft judge fail);
// we still bump lastPairs so an engine fallback resumes from the right place.
async function recordNativePair($: any, cwd: string, s: { pressure: number } | null): Promise<void> {
  const out = cwd.replace(/\/$/, '') + '/.sawbuck/steer.json'
  const prior: { lastPairs: number; scored: number; steering: number; wsum: number; distribution: Record<number, number> } =
    { lastPairs: 0, scored: 0, steering: 0, wsum: 0, distribution: { 0: 0, 1: 0, 2: 0, 3: 0 } }
  try {
    const p = JSON.parse(await $.fs.read(out))
    if (p && p.lastPairs != null) {
      prior.lastPairs = p.lastPairs
      prior.scored = p.scored || 0
      prior.steering = p.steering || 0
      prior.wsum = p._wsum || 0
      prior.distribution = p.distribution || prior.distribution
    }
  } catch { /* no prior tally = fresh */ }
  prior.lastPairs = (prior.lastPairs || 0) + 1   // consumed one post-opener pair (aligns with engine pairs() index)
  if (s) {
    prior.distribution[s.pressure] = (prior.distribution[s.pressure] || 0) + 1
    prior.scored++
    prior.wsum += s.pressure
    if (s.pressure >= 1) prior.steering++
  }
  const rate = prior.scored ? prior.steering / prior.scored : 0
  const rec = {
    at: new Date().toISOString(), backend: 'native',
    lastPairs: prior.lastPairs, turns: prior.lastPairs,
    scored: prior.scored, steering: prior.steering, steeringRate: rate,
    meanPressure: prior.scored ? prior.wsum / prior.scored : 0,
    distribution: prior.distribution, _wsum: prior.wsum,
  }
  await $.fs.write(out, JSON.stringify(rec) + '\n')
}

// Score the stashed (agent, user) pair natively. Best-effort, never blocks a turn.
// A HARD throw (no $.model / org-blocked) trips nativeBroken so the next turn.complete
// shells the engine instead; a SOFT fail (isAnswered:false / unparseable) stays native
// but still records the consumed pair so the count doesn't drift.
async function scoreNative($: any, cwd: string, prior: string, user: string): Promise<void> {
  let s: { pressure: number } | null = null
  try {
    // Call it directly - $ members can't be read as values, only called ($.noun.method(...)).
    // If $.model is unavailable or the org blocks the model, this throws and we fall back.
    const r = await $.model.complete({
      model: 'claude-haiku-5-5',   // full id works on every build ('haiku' alias needs >=2.1.309)
      prompt: PROMPT(prior, user),
      maxTokens: 200,
      timeoutMs: 12000,
    })
    if (r && r.isAnswered !== false && r.text) s = parsePressure(r.text)
  } catch {
    nativeBroken = true
    return   // don't record; the engine fallback re-scans from steer.json.lastPairs
  }
  try { await recordNativePair($, cwd, s) } catch { /* the band never blocks a turn */ }
}

// Read the cwd repo's sawbuck status. Fast: file reads only, never shells, never blocks.
// null = not a sawbuck-relevant repo (hide the band).
async function readSummary($: any): Promise<Summary | null> {
  try {
    const cwd: string = await $.session.cwd()
    // active = sawbuck has run here (its record exists); armed = checkable (a contract, or just
    // a test command thanks to zero-config). Show the band for either; hide otherwise.
    let active = false
    try { await $.fs.read(cwd + '/.sawbuck/state.json'); active = true } catch {}
    let armed = false
    try { await $.fs.read(cwd + '/promptwheel.config.json'); armed = true } catch {}
    if (!armed) { try { await $.fs.read(cwd + '/package.json'); armed = true } catch {} }
    // memory-only: logbook history is here, but no check contract (history recall without the gate)
    let mem = false
    try { await $.fs.read(cwd + '/LOGBOOK.md'); mem = true } catch {}
    if (!mem) { try { await $.fs.read(cwd + '/events.jsonl'); mem = true } catch {} }
    if (!active && !armed && !mem) return null
    let caught = 0
    let latest: Summary['latest'] = null
    try {
      const r = JSON.parse(await $.fs.read(cwd + '/.sawbuck/results.json'))
      caught = (r.regressions || 0) + (r.gamed || 0)
      if (r.latest && r.latest.file) latest = { kind: String(r.latest.kind || 'caught'), file: String(r.latest.file) }
    } catch {
      // no results yet = nothing caught, still "watching"
    }
    // the last verdict from the activity feed (includes verified passes), so you see it working
    let last = ''
    try {
      const lines = (await $.fs.read(cwd + '/.sawbuck/activity.jsonl')).trim().split('\n')
      last = String(JSON.parse(lines[lines.length - 1]).kind || '')
    } catch {}
    // live steering rate from .sawbuck/steer.json (written by the native judge or the
    // engine's --append); null when unknown so the band stays quiet.
    let steer: number | null = null
    try {
      const sj = JSON.parse(await $.fs.read(cwd + '/.sawbuck/steer.json'))
      if (sj && sj.scored) steer = Math.round((sj.steeringRate || 0) * 100)
    } catch {}
    return { caught, latest, armed, active, mem, last, steer }
  } catch {
    return null
  }
}

// Run sawbuck: a global install if present, else npx (first run fetches it, then it is cached).
async function runSawbuck($: any, cwd: string, args: string[]): Promise<string> {
  for (const argv of [['sawbuck', ...args], ['npx', '-y', 'sawbuck', ...args]]) {
    try {
      const { exitCode, stdout, stderr } = await $.process.run(argv, { cwd })
      const out = (stdout || '').trim() || (stderr || '').trim()
      if (exitCode === 0 || out) return out
    } catch {}
  }
  return '🐴 sawbuck: could not run it here (it needs Node and npm on your PATH).'
}

export const register: Register = (on, options) => {
  // one-click control surface: try it, or arm it, without leaving Claude Code.
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'sawbuck-check', description: 'Verify your latest change right now (zero-config, no setup)' })
      await $.command.register({ name: 'sawbuck-watch', description: 'Watch every turn in this repo (arm the sawbuck Stop hook)' })
      await $.command.register({ name: 'sawbuck-context', description: 'Ranked history for the files you are touching (reverts, weakened tests, hot spots)' })
      await $.command.register({ name: 'sawbuck-debt', description: 'Surface this repo\'s live suppression debt: what is still silenced in HEAD now, disabled tests first' })
      await $.command.register({ name: 'sawbuck-status', description: 'The inventory: everything sawbuck has here in one view (caught over time + debt accruing now + armed state)' })
    } catch { /* commands are a bonus; never fail the session over them */ }
    return next(e)
  })

  on('command.run', { command: 'sawbuck-check' }, async ($) => {
    return { text: await runSawbuck($, await $.session.cwd(), ['check']) }
  })

  on('command.run', { command: 'sawbuck-watch' }, async ($) => {
    const out = await runSawbuck($, await $.session.cwd(), ['attach', '--claude'])
    return { text: (out ? out + '\n\n' : '') + '🐴 sawbuck is watching this repo now. A win that does not survive a source-only re-run is caught, and the agent is sent back to earn it. Remove it anytime with: sawbuck detach.' }
  })

  // on-demand (never per turn): the band never shells, so the ranked history is one
  // command away instead of a per-turn firehose. Run it before touching a hot spot.
  // --speak: this is an explicit ask, so reply even when the trail is clean (the bare
  // `context` stays silent for the every-turn UserPromptSubmit hook).
  on('command.run', { command: 'sawbuck-context' }, async ($) => {
    return { text: await runSawbuck($, await $.session.cwd(), ['context', '--speak']) }
  })

  // the whole-repo debt ledger (the study's headline: current live debt is the under-surfaced
  // signal). On-demand; it greps HEAD, so never run it per turn.
  on('command.run', { command: 'sawbuck-debt' }, async ($) => {
    return { text: await runSawbuck($, await $.session.cwd(), ['debt']) }
  })

  // the inventory: one view unioning what the check has caught over time, the debt accruing now, and
  // whether it is armed here. On-demand (it runs the whole-repo debt scan); never per turn.
  on('command.run', { command: 'sawbuck-status' }, async ($) => {
    return { text: await runSawbuck($, await $.session.cwd(), ['status']) }
  })

  on('prompt.submit', async ($, e, next) => {
    try {
      const s = await readSummary($)
      await update($, summaryAtom, () => s)
      // native judge: the steer is the user's REPLY, which only exists here (turn.complete
      // has no reply yet). Score the pair stashed on the previous turn.complete, in the
      // background - never blocks the prompt. pendingAnswer is only set in native mode.
      if (pendingAnswer != null) {
        const prior = pendingAnswer
        pendingAnswer = null
        const user = typeof e.text === 'string' ? e.text : ''
        if (user.trim() && s && (s.active || s.armed)) {
          const cwd = await $.session.cwd()
          void scoreNative($, cwd, prior, user)   // deliberately not awaited
        }
      }
    } catch { /* the band never blocks a prompt */ }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    try {
      const s = await readSummary($)
      await update($, summaryAtom, () => s)
      // live watcher. Skip aborted turns and subagent turns (score the main thread only).
      if (s && (s.active || s.armed) && !e.isAborted && e.agentId === undefined) {
        const mode = await judgeMode($, options)
        if (mode === 'native' && !nativeBroken) {
          // stash the agent's answer; the next prompt.submit pairs it with the user's reply and scores.
          pendingAnswer = typeof e.answer === 'string' ? e.answer : null
        } else if (mode === 'engine' || (mode === 'native' && nativeBroken)) {
          // engine path (explicit, or the automatic fallback when native is unavailable):
          // shell the reins CLI's incremental --append in the BACKGROUND (never blocks the
          // turn; the trailing `&` detaches it). Best-effort - a missing judge just leaves
          // the steer rate unknown, never an error.
          const cwd = await $.session.cwd()
          try { await $.process.run(['sh', '-c', '{ reins --append || npx -y @sawbuck/reins --append; } >/dev/null 2>&1 &'], { cwd }) } catch {}
        }
        // real-time cue inventory (separate from the steer meter): accumulate .sawbuck/cues.json in
        // the background, so your cues build up as you work. Best-effort and detached; free on local
        // ollama, and a no-op when no judge backend is reachable, so it never blocks or errors.
        if (mode !== 'off') {
          const cwdC = await $.session.cwd()
          try { await $.process.run(['sh', '-c', '{ reins cues --append || npx -y @sawbuck/reins cues --append; } >/dev/null 2>&1 &'], { cwd: cwdC }) } catch {}
        }
      }
    } catch { /* the band never blocks a turn */ }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, summaryAtom)
    if (e.props.hasSurvey || s === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const icon = ({ verified: '✓', gamed: '🚩', regression: '✗', inconclusive: '≈', allowed: '✎' } as Record<string, string>)[s.last] || ''
    // the steer icon is a glance, not a gauge (the % beside it carries the detail): reins slack
    // (🐎) when under half your turns are steers, reins taut (🪢) when you steer more than half.
    const grip = s.steer >= 50 ? '🪢' : '🐎'

    if (s.caught > 0) {
      return (
        <Box>
          <Text color="yellow" weight="bold">🐴 sawbuck · {s.caught} caught</Text>
          {s.latest ? <Text dimColor> · {s.latest.kind} on {s.latest.file}</Text> : null}
          {s.steer != null ? <Text dimColor> · {grip} steer {s.steer}%</Text> : null}
        </Box>
      )
    }

    if (s.active) {
      return (
        <Box>
          <Text dimColor>🐴 sawbuck · watching{icon ? ' · ' + icon : ''}{s.steer != null ? ' · ' + grip + ' steer ' + s.steer + '%' : ''}</Text>
        </Box>
      )
    }

    if (s.armed) {
      return (
        <Box>
          <Text dimColor>🐴 sawbuck · ready · /sawbuck-watch to arm</Text>
        </Box>
      )
    }

    return (
      <Box>
        <Text dimColor>🐴 sawbuck · memory · /sawbuck-context for history</Text>
      </Box>
    )
  })
}
