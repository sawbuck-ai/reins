import { expect, mock, test } from 'claude-code/testing'

// What the directory reads from this module, proven against the engine: every program
// call is fixed text with no options object, and the one file the mod writes is at a
// fixed relative path. `claude plugin test plugins/sawbuck-reins` runs these.

const ORIGIN = { kind: 'composer' } as const
const PRESENTATION = { isFullscreen: false, columns: 80 } as const

test('/sawbuck-status runs the pinned sawbuck CLI as fixed text, in the session cwd', async ($, on) => {
  const calls: { argv: readonly string[]; init: unknown }[] = []
  on('command.register', () => ({ value: { command: 'sawbuck-status' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => {
    calls.push({ argv: e.argv, init: e.init })
    return { value: { exitCode: 0, stdout: 'sawbuck: watching\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'sawbuck-status', args: '', origin: ORIGIN, presentation: PRESENTATION })

  expect(r?.text).toBe('sawbuck: watching')
  expect(calls).toEqual([{ argv: ['npx', '-y', 'sawbuck@0.1.27', 'status'], init: undefined }])
})

test('/sawbuck-check tells the person when the program cannot start', async ($, on) => {
  on('command.register', () => ({ value: { command: 'sawbuck-check' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => { throw new Error('spawn npx ENOENT') })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'sawbuck-check', args: '', origin: ORIGIN, presentation: PRESENTATION })

  expect(r?.text).toMatch(/could not run it here/)
})

test('the native judge writes the steer tally at the fixed relative path', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  const models: string[] = []
  const probes: string[] = []
  mock.env(on, {})
  on('command.register', () => ({ value: { command: 'x' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // attached repo: the record exists; nothing else is on disk. The engine resolves the
  // mod's relative path against the session cwd before a hook beneath sees it.
  on('fs.exists', (_, e) => { probes.push(e.path); return { value: e.path.endsWith('/.sawbuck/state.json') } })
  on('fs.read', (_, e) => { throw new Error(`ENOENT: ${e.path}`) })
  on('fs.write', (_, e) => { writes.push({ path: e.path, text: e.text }); return { value: undefined } })
  on('model.complete', (_, e) => {
    models.push(e.model)
    return { value: { isAnswered: true, text: '{"pressure":3,"axis":"stop","nudge":"revert it"}', usage: { input_tokens: 1, output_tokens: 1 } } }
  })
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  // the agent answers (stashed), then the person steers (scored in the background)
  await $.turn.complete({ answer: 'I edited the test so it passes.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.prompt.submit({ text: 'no, stop. revert that and earn it in the source.' })
  for (let i = 0; i < 50 && writes.length === 0; i++) await new Promise((r) => setTimeout(r, 20))

  expect(probes.length, 'the band probed the record: ' + probes.join(',')).toBeGreaterThan(0)
  expect(models).toEqual(['claude-haiku-5-5'])
  expect(writes.length).toBe(1)
  expect(writes[0].path).toMatch(/(^|\/)\.sawbuck\/steer\.json$/)
  const rec = JSON.parse(writes[0].text)
  expect(rec.backend).toBe('native')
  expect(rec.scored).toBe(1)
  expect(rec.steering).toBe(1)
  expect(rec.distribution['3']).toBe(1)
})

test('an unattached repo gets no model call and no file', async ($, on) => {
  const writes: string[] = []
  const models: string[] = []
  mock.env(on, {})
  on('command.register', () => ({ value: { command: 'x' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', () => ({ value: false }))
  on('fs.read', (_, e) => { throw new Error(`ENOENT: ${e.path}`) })
  on('fs.write', (_, e) => { writes.push(e.path); return { value: undefined } })
  on('model.complete', (_, e) => { models.push(e.model); return { value: { isAnswered: false, reason: 'api-error', status: null } } })
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.prompt.submit({ text: 'no, stop.' })
  await new Promise((r) => setTimeout(r, 100))

  expect(models).toEqual([])
  expect(writes).toEqual([])
})
