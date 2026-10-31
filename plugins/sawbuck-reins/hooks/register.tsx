import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Summary } from '../types'

// Sawbuck's state for the current repo, recomputed each turn; the band reads it.
const summaryAtom = atom({ plugin: 'sawbuck-reins', key: 'summary' } as const, null)

// Read the cwd repo's .sawbuck record. null = the guide isn't active here (hide the band).
async function readSummary($: any): Promise<Summary | null> {
  try {
    const cwd: string = await $.session.cwd()
    // show the band only where the reflex has run (sawbuck is active in this repo)
    try {
      await $.fs.read(cwd + '/.sawbuck/state.json')
    } catch {
      return null
    }
    let caught = 0
    let latest: Summary['latest'] = null
    try {
      const r = JSON.parse(await $.fs.read(cwd + '/.sawbuck/results.json'))
      caught = (r.regressions || 0) + (r.gamed || 0)
      if (r.latest && r.latest.file) {
        latest = { kind: String(r.latest.kind || 'caught'), file: String(r.latest.file) }
      }
    } catch {
      // no results yet = nothing caught, still "watching"
    }
    // armed = a contract to check (promptwheel.config.json); else memory-only (history, no check yet)
    let armed = false
    try { await $.fs.read(cwd + '/promptwheel.config.json'); armed = true } catch {}
    return { caught, latest, armed }
  } catch {
    return null
  }
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    try {
      const s = await readSummary($)
      await update($, summaryAtom, () => s)
    } catch {
      // the band must never block a prompt or a turn
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    try {
      const s = await readSummary($)
      await update($, summaryAtom, () => s)
    } catch {
      // the band must never block a prompt or a turn
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, summaryAtom)
    if (e.props.hasSurvey || s === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    if (s.caught > 0) {
      return (
        <Box>
          <Text color="yellow" weight="bold">🐴 sawbuck · {s.caught} caught</Text>
          {s.latest ? <Text dimColor> · {s.latest.kind} on {s.latest.file}</Text> : null}
        </Box>
      )
    }

    return (
      <Box>
        <Text dimColor>🐴 sawbuck · {s.armed ? 'watching' : 'memory'}</Text>
      </Box>
    )
  })
}
