import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Summary } from '../types'

// Sawbuck's status for the current repo, recomputed each turn; the band reads it.
const summaryAtom = atom({ plugin: 'sawbuck-reins', key: 'summary' } as const, null)

// --- the live steering judge ------------------------------------------------
// The band's "🐎/✊ steer X%" comes from .sawbuck/steer.json, which this mod fills in
// ONE way: native (DEFAULT) scores the newest turn-pair with one small call through
// Claude Code's own model API ($.model.complete, the Haiku model id), on the user's
// own plan: zero setup, no ollama, no key. Disclosed in the README; `off` in the
// `judge` userConfig turns it off. The mod runs NO program: a user who scores with
// the reins CLI instead (SAWBUCK_JUDGE set: local ollama or a hosted key) runs
// `reins --append` themselves, through the reins-steering skill, and the mod stays
// out of the way so nothing is billed twice.
//
// The file shape is the engine's, so the band + the offline `sawbuck statusline` read
// one shape. The rubric + 0-3 scale + aggregate below MIRROR the canonical engine
// (engine/judge.mjs PROMPT/parse + engine/bin/reins.mjs --append). A mod can't import
// the npm package at runtime, so this is a deliberate small copy; keep it in sync with
// the engine (SYNC SEAM).

// module state: survives within a session, resets on reload (steer.json persists).
let pendingAnswer: string | null = null   // agent's answer, stashed on turn.complete, scored on the next prompt.submit
let nativeBroken = false                   // $.model threw (missing / org-blocked) -> stop scoring for this session

// recent-window steer gauge: an EMA over ~STEER_SPAN scored turns, seeded on the first sample so
// there is no cold-start bias. The band shows how you have steered LATELY, not a lifetime average
// that old high-steering turns anchor - so it reflects the fall toward a loose rein as cues land.
// Mirrors the engine's --append: the span is SAWBUCK_STEER_WINDOW (default 20), alpha = 2/(span+1),
// so native + engine write one steer.json shape and one gauge (the lifetime rate is still written
// for older readers).
const STEER_SPAN = 20
async function steerSpan($: any): Promise<number> {
  try { const w = Number(await $.env.get('SAWBUCK_STEER_WINDOW')); if (w > 0 && Number.isFinite(w)) return w } catch { /* default */ }
  return STEER_SPAN
}

// EXACT copy of the engine's noise() in scan.mjs: a reply the engine does not count as a pair is not
// a pair here either (so the shared lastPairs index stays aligned with the engine's pairs()).
function noise(t: string): boolean {
  const s = String(t).trim()
  if (!s) return true
  if (s.includes('<task-notification>') || s.startsWith('<task-id>')) return true
  return s.replace(/\[Image #\d+\]/g, '').trim().length < 3
}

// EXACT copy of engine/judge.mjs PROMPT (the 600/800 slicing that lives in
// scan.mjs pairs() is applied inline here since we score a live pair, not the transcript).
const PROMPT = (a: string, u: string) =>
`You rate how much a developer's message STEERS an AI coding agent's current work.
Output ONLY one JSON object: {"pressure":0-3,"axis":"one-word","nudge":"<=8 words"}
pressure: 0 passive (approval like "yes/go/do it", a pure question, or a brand-new unrelated task; NOT steering current work). 1 light refine (small adjustment to the SAME work: tone, length, scope, emphasis, "a bit more X", "also Y"). 2 redirect (change the approach/direction of current work). 3 hard stop ("no/stop/undo/revert", reject and restart).
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
// native). A SAWBUCK_JUDGE in the shell that names a CLI backend means the user scores
// with the reins CLI: the mod then stays off so a local-ollama setup is not silently
// billed for native on top. SAWBUCK_JUDGE=native keeps native.
async function judgeMode($: any, options: any): Promise<'native' | 'off'> {
  const cfg = options && typeof options.judge === 'string' ? options.judge : 'native'
  if (cfg === 'off') return 'off'
  try {
    const envv = await $.env.get('SAWBUCK_JUDGE')
    const v = envv == null ? '' : String(envv).trim().toLowerCase()
    if (v === 'off' || v === 'none' || v === '0' || v === 'false') return 'off'
    if (v === 'native' || v === '') return 'native'
    return 'off'   // a CLI backend is configured: the reins CLI scores, not the mod
  } catch { /* $.env provenance is undocumented; ignore and stay native */ }
  return 'native'
}

// Record one consumed turn-pair into .sawbuck/steer.json, in the engine's exact
// --append shape. `s` null = the pair was consumed but not scored (soft judge fail);
// we still bump lastPairs so an engine fallback resumes from the right place.
// The path is fixed text, relative to the session's working directory (the attached repo).
async function recordNativePair($: any, s: { pressure: number } | null, span: number): Promise<void> {
  const prior: { lastPairs: number; scored: number; steering: number; wsum: number; ema: number; distribution: Record<number, number> } =
    { lastPairs: 0, scored: 0, steering: 0, wsum: 0, ema: 0, distribution: { 0: 0, 1: 0, 2: 0, 3: 0 } }
  try {
    const p = JSON.parse(await $.fs.read('.sawbuck/steer.json'))
    if (p && p.lastPairs != null) {
      prior.lastPairs = p.lastPairs
      prior.scored = p.scored || 0
      prior.steering = p.steering || 0
      prior.wsum = p._wsum || 0
      prior.ema = p.ema || 0
      prior.distribution = p.distribution || prior.distribution
    }
  } catch { /* no prior tally = fresh */ }
  prior.lastPairs = (prior.lastPairs || 0) + 1   // consumed one post-opener pair (aligns with engine pairs() index)
  if (s) {
    prior.distribution[s.pressure] = (prior.distribution[s.pressure] || 0) + 1
    prior.scored++
    prior.wsum += s.pressure
    const x = s.pressure >= 1 ? 1 : 0
    if (x) prior.steering++
    // EMA seeded on the first scored turn (no cold-start bias); same shape the engine writes
    const alpha = 2 / (span + 1)
    prior.ema = prior.scored === 1 ? x : alpha * x + (1 - alpha) * prior.ema
  }
  const rate = prior.scored ? prior.steering / prior.scored : 0   // lifetime (kept for older readers of steer.json)
  const rec = {
    at: new Date().toISOString(), backend: 'native',
    lastPairs: prior.lastPairs, turns: prior.lastPairs,
    scored: prior.scored, steering: prior.steering, steeringRate: rate, ema: prior.ema,
    meanPressure: prior.scored ? prior.wsum / prior.scored : 0,
    distribution: prior.distribution, _wsum: prior.wsum,
  }
  await $.fs.write('.sawbuck/steer.json', JSON.stringify(rec) + '\n')
}

// Score the stashed (agent, user) pair natively. Best-effort, never blocks a turn.
// A HARD throw (no $.model / org-blocked) trips nativeBroken so the next turn.complete
// shells the engine instead; a SOFT fail (isAnswered:false / unparseable) stays native
// but still records the consumed pair so the count doesn't drift.
async function scoreNative($: any, prior: string, user: string): Promise<void> {
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
    return   // don't record; the steer rate stays where it was for this session
  }
  try { await recordNativePair($, s, await steerSpan($)) } catch { /* the band never blocks a turn */ }
}

// one scoring at a time: steer.json is a read-modify-write, and two quick turns would otherwise
// interleave their 12 s model calls and lose a sample
let scoring: Promise<void> = Promise.resolve()

// Is the file there? $.fs.exists where the build has it; an older build answers by reading.
async function present($: any, path: string): Promise<boolean> {
  try { return !!(await $.fs.exists(path)) } catch { /* no $.fs.exists on this build */ }
  try { await $.fs.read(path); return true } catch { return false }
}

// Read the session repo's sawbuck status. Fast: file reads only, never shells, never blocks.
// Every path is fixed text relative to the session's working directory.
// null = not a sawbuck-relevant repo (hide the band).
async function readSummary($: any): Promise<Summary | null> {
  try {
    // active = sawbuck has run here (its record exists); armed = checkable (a contract, or just
    // a test command thanks to zero-config). Show the band for either; hide otherwise.
    // Only `active` runs the judge or writes under .sawbuck/: an unattached repo gets the
    // "ready" label and nothing else (no model call, no files).
    const active = await present($, '.sawbuck/state.json')
    const armed = (await present($, 'promptwheel.config.json')) || (await present($, 'package.json'))
    // memory-only: logbook history is here, but no check contract (history recall without the gate)
    const mem = (await present($, 'LOGBOOK.md')) || (await present($, 'events.jsonl'))
    if (!active && !armed && !mem) return null
    let caught = 0
    let latest: Summary['latest'] = null
    try {
      const r = JSON.parse(await $.fs.read('.sawbuck/results.json'))
      caught = (r.regressions || 0) + (r.gamed || 0)
      if (r.latest && r.latest.file) latest = { kind: String(r.latest.kind || 'caught'), file: String(r.latest.file) }
    } catch {
      // no results yet = nothing caught, still "watching"
    }
    // the last verdict from the activity feed (includes verified passes), so you see it working
    let last = ''
    try {
      const lines = (await $.fs.read('.sawbuck/activity.jsonl')).trim().split('\n')
      last = String(JSON.parse(lines[lines.length - 1]).kind || '')
    } catch {}
    // live steering rate from .sawbuck/steer.json (written by the native judge or the
    // engine's --append); null when unknown so the band stays quiet.
    let steer: number | null = null
    try {
      const sj = JSON.parse(await $.fs.read('.sawbuck/steer.json'))
      // recent-window gauge (EMA) when present; fall back to the lifetime rate for older files.
      if (sj && sj.scored) steer = Math.round(((sj.ema != null ? sj.ema : sj.steeringRate) || 0) * 100)
    } catch {}
    return { caught, latest, armed, active, mem, last, steer }
  } catch {
    return null
  }
}

// The mod runs no program. The five slash commands live in commands/ as plugin commands: each tells
// Claude to run one exact, pinned `npx -y sawbuck@0.1.28 ...` through its own Bash tool, under Claude
// Code's permission system, so Claude sees the verdict and can act on it.
export const register: Register = (on, options) => {
  on('prompt.submit', async ($, e, next) => {
    try {
      const s = await readSummary($)
      await update($, summaryAtom, () => s)
      // native judge: the steer is the user's REPLY, which only exists here (turn.complete
      // has no reply yet). Score the pair stashed on the previous turn.complete, in the
      // background - never blocks the prompt. pendingAnswer is only set in native mode.
      if (pendingAnswer != null) {
        const user = typeof e.text === 'string' ? e.text : ''
        // a meta prompt or an engine-noise reply ("ok", a task notification) is not a pair: skip it and
        // keep the stash, exactly as the engine keeps `prev` past a noise line.
        if (!(e as any).isMeta && !noise(user)) {
          const prior = pendingAnswer
          pendingAnswer = null
          if (s && s.active) {
            scoring = scoring.then(() => scoreNative($, prior, user)).catch(() => {})   // deliberately not awaited
          }
        }
      }
    } catch { /* the band never blocks a prompt */ }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    try {
      const s = await readSummary($)
      await update($, summaryAtom, () => s)
      // live watcher, only where sawbuck is attached (.sawbuck/state.json exists). Skip aborted
      // turns and subagent turns (score the main thread only).
      if (s && s.active && !e.isAborted && e.agentId === undefined) {
        const mode = await judgeMode($, options)
        if (mode === 'native' && !nativeBroken) {
          // stash the agent's answer; the next prompt.submit pairs it with the user's reply and scores.
          pendingAnswer = typeof e.answer === 'string' ? e.answer : null
        }
        // The cue inventory (.sawbuck/cues.json) is NOT built per turn: that is the explicit
        // `reins cues` CLI command, run through the reins-steering skill.
      }
    } catch { /* the band never blocks a turn */ }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, summaryAtom)
    if (e.props.hasSurvey || s === null) {
      return next(e)
    }
    // opt out of the above-prompt band (e.g. you show sawbuck in your own statusline instead).
    // Primary switch is the `band` userConfig (reliable, applies on reload, no restart); the
    // SAWBUCK_BAND env is a no-config fallback. The judge still runs each turn either way, so
    // .sawbuck/steer.json keeps updating for the statusline to read.
    if (options && options.band === 'off') return next(e)
    try {
      const bv = await $.env.get('SAWBUCK_BAND')
      const v = bv == null ? '' : String(bv).trim().toLowerCase()
      if (v === 'off' || v === '0' || v === 'false' || v === 'none') return next(e)
    } catch { /* $.env is best-effort; default to showing the band */ }

    const { Box, Text } = $.ui.resolve(e)
    const icon = ({ verified: '✓', gamed: '🚩', regression: '✗', inconclusive: '≈', allowed: '✎' } as Record<string, string>)[s.last] || ''
    // the steer icon reads the RECENT rate (the % beside it carries the detail): reins slack (🐎)
    // when under half your recent turns are steers, taut (✊) past half.
    const grip = (s.steer ?? 0) >= 50 ? '✊' : '🐎'
    const steerSeg = s.steer != null ? ` · ${grip} steer ${s.steer}%` : ''

    if (s.caught > 0) {
      return (
        <Box>
          <Text color="yellow" weight="bold">🐴 sawbuck · {s.caught} caught</Text>
          {s.latest ? <Text dimColor> · {s.latest.kind} on {s.latest.file}</Text> : null}
          {steerSeg ? <Text dimColor>{steerSeg}</Text> : null}
        </Box>
      )
    }
    if (s.active) {
      return (
        <Box>
          <Text dimColor>🐴 sawbuck · watching{icon ? ' · ' + icon : ''}{steerSeg}</Text>
        </Box>
      )
    }
    if (s.armed) {
      return (
        <Box>
          <Text dimColor>🐴 sawbuck · ready · /sawbuck-reins:watch to arm</Text>
        </Box>
      )
    }
    return (
      <Box>
        <Text dimColor>🐴 sawbuck · memory · /sawbuck-reins:context for history</Text>
      </Box>
    )
  })
}
