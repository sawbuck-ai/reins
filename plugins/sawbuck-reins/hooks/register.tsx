import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Summary } from '../types'

// Sawbuck's status for the current repo, recomputed each turn; the band reads it.
const summaryAtom = atom({ plugin: 'sawbuck-reins', key: 'summary' } as const, null)

// --- the live steering judge ------------------------------------------------
// The band's "🐎/✊ steer X%" comes from .sawbuck/steer.json, which this mod fills in
// ONE way: native scores the newest turn-pair with one small call through Claude Code's
// own model API ($.model.complete), on the user's own plan, on by default. Sonnet: against a careful Opus reading of 200
// real turns it reached kappa 0.66, Opus 0.70, Haiku 0.41, and Haiku over-called steering at 70% to 54%. Always read the
// rate with its judge named. The mod runs NO program: a user who scores with
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
let nativeBroken = false                   // $.model kept throwing (missing / org-blocked) -> stop scoring for this session
let hardFails = 0                          // consecutive hard throws from $.model.complete; three in a row = broken, one is a lost sample
const HARD_FAIL_LIMIT = 3
// Which session the pair index in steer.json belongs to. The API exposes no session id to a mod,
// so this is a token minted when the module loads (a reload or a new process mints a new one):
// the engine binds its lastPairs to the transcript path the same way, so a changed session starts
// its count at the first pair instead of skipping as many pairs as the last session counted.
const NATIVE_SESSION = 'native:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

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

// The steer scratchpad: what you keep correcting, in Claude Code's plugin store on this machine, so it follows you
// across repos and sessions outside any repo, and no folder gets a file. It is shown to the person and never put in a
// prompt: a nudge is a model's summary of text that includes the agent's own answer, so feeding it back would be a way
// to steer the agent with its own output. Local only. `sawbuck steers` reads it.
const MAX_STEERS = 2000
const SID = Date.now().toString(36)
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'it', 'this', 'that', 'do', 'not', 'dont', 'use', 'be', 'in', 'on', 'for', 'with', 'is', 'are', 'your', 'you'])
const steerKey = (n: string) => String(n).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).slice(0, 3).sort().join(' ')
// the most repeated steer worth a look: at least 3 times, in at least 2 sessions
function repeatedSteer(list: any[]): { key: string; nudge: string; n: number; repos: number } | null {
  const g = new Map<string, any>()
  for (const e of list) {
    const key = steerKey(e.nudge); if (!key) continue
    const x = g.get(key) || { key, nudge: e.nudge, n: 0, sessions: new Set(), repos: new Set() }
    x.n++; x.sessions.add(e.session); x.repos.add(e.repo || 'no repo'); g.set(key, x)
  }
  const top = [...g.values()].filter((x) => x.n >= 3 && x.sessions.size >= 2).sort((a, b) => b.n - a.n)[0]
  return top ? { key: top.key, nudge: top.nudge, n: top.n, repos: top.repos.size } : null
}
async function keepSteer($: any, s: { pressure: number; axis?: string; nudge?: string } | null, repo: string): Promise<void> {
  try {
    const stats: any = (await $.store.get('steerStats')) || { scored: 0, lost: 0 }
    if (s) stats.scored++; else stats.lost++
    await $.store.set('steerStats', stats)
    if (!s || s.pressure < 1 || !s.nudge) return
    const list: any = (await $.store.get('steers')) || []
    list.push({ at: new Date().toISOString(), repo, session: SID, axis: s.axis || '', nudge: s.nudge, pressure: s.pressure })
    await $.store.set('steers', list.slice(-MAX_STEERS))
  } catch { /* the scratchpad never blocks a turn */ }
}

// Which judge to use: on unless turned off. SAWBUCK_JUDGE in the shell wins (a CLI backend means the user scores with the
// reins CLI, so a local-ollama setup is never billed for native on top); else userConfig.
async function judgeMode($: any, options: any): Promise<'native' | 'off'> {
  const cfg = options && options.judge === 'off' ? 'off' : 'native'
  try {
    const envv = await $.env.get('SAWBUCK_JUDGE')
    const v = envv == null ? '' : String(envv).trim().toLowerCase()
    if (v === 'native') return 'native'
    if (v) return 'off'
  } catch { /* $.env provenance is undocumented; ignore it */ }
  return cfg
}

// Record one consumed turn-pair into .sawbuck/steer.json, in the engine's exact
// --append shape. `s` null = the pair was consumed but not scored (soft judge fail);
// we still bump lastPairs so an engine fallback resumes from the right place.
// The path is fixed text, relative to the session's working directory (the attached repo).
async function recordNativePair($: any, s: { pressure: number } | null, span: number): Promise<void> {
  const prior: { session: string; lastPairs: number; scored: number; steering: number; wsum: number; ema: number; distribution: Record<number, number> } =
    { session: '', lastPairs: 0, scored: 0, steering: 0, wsum: 0, ema: 0, distribution: { 0: 0, 1: 0, 2: 0, 3: 0 } }
  try {
    const p = JSON.parse(await $.fs.read('.sawbuck/steer.json'))
    if (p && p.lastPairs != null) {
      prior.session = typeof p.session === 'string' ? p.session : ''
      prior.lastPairs = p.lastPairs
      prior.scored = p.scored || 0
      prior.steering = p.steering || 0
      prior.wsum = p._wsum || 0
      prior.ema = p.ema || 0
      prior.distribution = p.distribution || prior.distribution
    }
  } catch { /* no prior tally = fresh */ }
  // consumed one post-opener pair (aligns with engine pairs() index); a tally from another session
  // keeps its scored/steering/ema (a rolling readout) but the pair index restarts at this session's first
  prior.lastPairs = prior.session === NATIVE_SESSION ? (prior.lastPairs || 0) + 1 : 1
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
    at: new Date().toISOString(), backend: 'native', session: NATIVE_SESSION,
    lastPairs: prior.lastPairs, turns: prior.lastPairs,
    scored: prior.scored, steering: prior.steering, steeringRate: rate, ema: prior.ema,
    meanPressure: prior.scored ? prior.wsum / prior.scored : 0,
    distribution: prior.distribution, _wsum: prior.wsum,
  }
  await $.fs.write('.sawbuck/steer.json', JSON.stringify(rec) + '\n')
}

// Score the stashed (agent, user) pair natively. Best-effort, never blocks a turn.
// A HARD throw (no $.model / org-blocked / a transient API error) costs one sample; three in a
// row trip nativeBroken and scoring stops for the session (a build or org that blocks model calls
// fails every time, a one-off overloaded answer does not). A SOFT fail (isAnswered:false /
// unparseable) stays native but still records the consumed pair so the count doesn't drift.
async function scoreNative($: any, prior: string, user: string, repo: string, attached: boolean): Promise<void> {
  let s: { pressure: number } | null = null
  try {
    // Call it directly - $ members can't be read as values, only called ($.noun.method(...)).
    // If $.model is unavailable or the org blocks the model, this throws and we fall back.
    // the host honors timeoutMs; a local race makes the bound the mod's own, so one call that never
    // settles costs one sample, never the rest of the session's scoring (the chain is serialized)
    let timer: any
    const bound = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('judge timeout')), 30000) })
    const r: any = await Promise.race([
      $.model.complete({
        model: 'claude-sonnet-5-5',
        prompt: PROMPT(prior, user),
        maxTokens: 200,
        timeoutMs: 28000,
      }),
      bound,
    ]).finally(() => clearTimeout(timer))
    hardFails = 0   // the host answered: whatever the text, the model API is there
    if (r && r.isAnswered !== false && r.text) s = parsePressure(r.text)
  } catch (e: any) {
    // a timeout is one lost sample, not a broken host; a hard throw counts toward the limit
    if (!(e && String(e.message) === 'judge timeout') && ++hardFails >= HARD_FAIL_LIMIT) nativeBroken = true
    return   // don't record; the steer rate stays where it was
  }
  await keepSteer($, s, repo)
  if (attached) { try { await recordNativePair($, s, await steerSpan($)) } catch { /* the band never blocks a turn */ } }
}

// one scoring at a time: steer.json is a read-modify-write, and two quick turns would otherwise
// interleave their 12 s model calls and lose a sample
let scoring: Promise<void> = Promise.resolve()

// Is the file there? $.fs.exists where the build has it; an older build answers by reading.
async function present($: any, path: string): Promise<boolean> {
  try { return !!(await $.fs.exists(path)) } catch { /* no $.fs.exists on this build */ }
  try { await $.fs.read(path); return true } catch { return false }
}

// In a git repository, from any folder of it? The engine knows; a build without $.session.repo keeps
// the old behaviour.
// Its folder name is what the band shows, so you can see which repo was detected: '' when the engine cannot say.
async function repeatLine($: any): Promise<string> {
  try { const r = repeatedSteer(((await $.store.get('steers')) as any[]) || []); return r ? `said ${r.n}x: ${r.nudge}` : '' } catch { return '' }
}
async function repoName($: any): Promise<string | null> {
  try {
    const r = await $.session.repo()
    if (r === null) return null
    return String((r && r.root) || '').split(/[\\/]/).filter(Boolean).pop() || ''
  } catch { return '' }
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
    // Outside a git repository nothing can be checked, so nothing is gathered: say so and stop, even
    // where an old version left a .sawbuck behind. No judge, no model call, no file.
    const repo = await repoName($)
    if (repo === null) return { caught: 0, latest: null, armed: false, active: false, mem: false, last: '', steer: null, signed: false, noRepo: true, repo: '', repeat: await repeatLine($) }
    const active = await present($, '.sawbuck/state.json')
    const armed = (await present($, 'promptwheel.config.json')) || (await present($, 'package.json'))
    // memory-only: logbook history is here, but no check contract (history recall without the gate)
    const mem = (await present($, 'LOGBOOK.md')) || (await present($, 'events.jsonl'))
    if (!active && !armed && !mem) return null
    let caught = 0
    let latest: Summary['latest'] = null
    try {
      const r = JSON.parse(await $.fs.read('.sawbuck/results.json'))
      caught = (r.regressions || 0) + (r.gamed || 0) + (r.mandates || 0)
      if (r.latest && r.latest.file) latest = { kind: String(r.latest.kind || 'caught'), file: String(r.latest.file) }
      const m = r.lastMandate
      if (m && m.file && (!r.latest || String(m.at) > String(r.latest.at || ''))) latest = { kind: 'protected path', file: String(m.file) }
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
      // a week without an update is history, not a reading (the judge was turned off, or the plugin is not running)
      if (sj && sj.scored && !(sj.at && Date.now() - Date.parse(sj.at) > 7 * 864e5)) steer = Math.round(((sj.ema != null ? sj.ema : sj.steeringRate) || 0) * 100)
    } catch {}
    const signed = await present($, 'promptwheel.config.json')   // signed = has run the one setup step; the band always names the next step
    return { caught, latest, armed, active, mem, last, steer, signed, noRepo: false, repo, repeat: await repeatLine($) }
  } catch {
    return null
  }
}

// The mod runs no program. The slash commands live in commands/ as plugin commands: each tells
// Claude to run one exact, pinned `npx -y sawbuck@0.1.47 ...` through its own Bash tool, under Claude
// Code's permission system, so Claude sees the verdict and can act on it.
// One offer per repository, ever: in a git repo with no rules, one line in the system prompt asks Claude to
// offer to sign it after doing the work. Decided in prompt.compose, which runs before prompt.submit, and kept for
// that session so the prompt stays stable. Nothing is written or run without the person's yes. Asked-already lives
// in $.store, per directory, outside the repo.
const OFFER = "Sawbuck is installed and this repository has no rules yet. Do the person's request first and in full. Then end your reply with one short line of your own offering to add them, saying it writes a rule to AGENTS.md, sets protected paths in promptwheel.config.json, and checks each turn, and ask yes or no. Offer once, at the end of your first reply, and do not raise it again. If you are a subagent, ignore this. Only if they say yes, invoke the sawbuck-reins:contract skill. Never do it without that yes."
let offerDecided = false, offering = false
async function decideOffer($: any): Promise<void> {
  if (offerDecided) return
  offerDecided = true
  try {
    if (await present($, 'promptwheel.config.json')) return
    if (!(await present($, '.git'))) return
    const key = 'offered:' + (await $.session.cwd())
    if (await $.store.get(key)) return
    await $.store.set(key, true)
    offering = true
  } catch { /* the offer never blocks a prompt */ }
}

export const register: Register = (on, options) => {
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    await decideOffer($)
    if (!offering) return r
    return { sections: [...r.sections, { id: 'sawbuck-reins:offer', text: OFFER, scope: 'session' as const }] }
  })

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
          if (s && (s.active || s.noRepo)) {
            scoring = scoring.then(() => scoreNative($, prior, user, s.repo, s.active)).catch(() => {})   // deliberately not awaited
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
      // live watcher, where sawbuck is attached (.sawbuck/state.json exists) and outside any repo, where only the
      // scratchpad records it. Skip aborted turns and subagent turns (score the main thread only).
      if (s && (s.active || s.noRepo) && !e.isAborted && e.agentId === undefined) {
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
    // SAWBUCK_BAND env is a no-config fallback.
    if (options && options.band === 'off') return next(e)
    try {
      const bv = await $.env.get('SAWBUCK_BAND')
      const v = bv == null ? '' : String(bv).trim().toLowerCase()
      if (v === 'off' || v === '0' || v === 'false' || v === 'none') return next(e)
    } catch { /* $.env is best-effort; default to showing the band */ }

    const { Box, Text } = $.ui.resolve(e)
    if (s.noRepo) {
      return (
        <Box>
          <Text dimColor>🐴 sawbuck · no repo here{s.repeat ? ' · ' + s.repeat : ''}</Text>
        </Box>
      )
    }
    const icon = ({ verified: '✓', gamed: '🚩', regression: '✗', inconclusive: '≈', allowed: '✎' } as Record<string, string>)[s.last] || ''
    // the steer icon reads the RECENT rate (the % beside it carries the detail): reins slack (🐎)
    // when under half your recent turns are steers, taut (✊) past half.
    const grip = (s.steer ?? 0) >= 50 ? '✊' : '🐎'
    const steerSeg = s.steer != null ? ` · ${grip} steer ${s.steer}%` : ''
    const at = s.repo ? s.repo + ' · ' : ''

    if (s.caught > 0) {
      return (
        <Box>
          <Text color="yellow" weight="bold">🐴 sawbuck · {at}{s.caught} caught</Text>
          {s.latest ? <Text dimColor> · {s.latest.kind} on {s.latest.file}</Text> : null}
          {steerSeg ? <Text dimColor>{steerSeg}</Text> : null}
        </Box>
      )
    }
    if (s.active) {
      return (
        <Box>
          <Text dimColor>🐴 sawbuck · {at}watching{icon ? ' · ' + icon : ''}{steerSeg}{s.repeat ? ' · ' + s.repeat : ''}{s.signed ? '' : ' · /sawbuck-reins:contract to add rules'}</Text>
        </Box>
      )
    }
    if (s.armed) {
      return (
        <Box>
          <Text dimColor>🐴 sawbuck · {at}one step: /sawbuck-reins:contract</Text>
        </Box>
      )
    }
    return (
      <Box>
        <Text dimColor>🐴 sawbuck · memory · npx sawbuck context for history</Text>
      </Box>
    )
  })
}
