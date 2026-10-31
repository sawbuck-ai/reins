import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Summary } from '../types'

// Sawbuck's status for the current repo, recomputed each turn; the band reads it.
const summaryAtom = atom({ plugin: 'sawbuck-reins', key: 'summary' } as const, null)

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
    return { caught, latest, armed, active, mem, last }
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

export const register: Register = on => {
  // one-click control surface: try it, or arm it, without leaving Claude Code.
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'sawbuck-check', description: 'Verify your latest change right now (zero-config, no setup)' })
      await $.command.register({ name: 'sawbuck-watch', description: 'Watch every turn in this repo (arm the sawbuck Stop hook)' })
      await $.command.register({ name: 'sawbuck-context', description: 'Ranked history for the files you are touching (reverts, weakened tests, hot spots)' })
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

  on('prompt.submit', async ($, e, next) => {
    try { const s = await readSummary($); await update($, summaryAtom, () => s) } catch { /* the band never blocks a prompt */ }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    try { const s = await readSummary($); await update($, summaryAtom, () => s) } catch { /* the band never blocks a turn */ }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, summaryAtom)
    if (e.props.hasSurvey || s === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const icon = ({ verified: '✓', gamed: '🚩', regression: '✗', inconclusive: '≈', allowed: '✎' } as Record<string, string>)[s.last] || ''

    if (s.caught > 0) {
      return (
        <Box>
          <Text color="yellow" weight="bold">🐴 sawbuck · {s.caught} caught</Text>
          {s.latest ? <Text dimColor> · {s.latest.kind} on {s.latest.file}</Text> : null}
        </Box>
      )
    }

    if (s.active) {
      return (
        <Box>
          <Text dimColor>🐴 sawbuck · watching{icon ? ' · ' + icon : ''}</Text>
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
