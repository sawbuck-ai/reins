import { expect, mock, test } from 'claude-code/testing'

// What the directory reads from this module, proven against the engine: every program
// call is fixed text with no options object, and the one file the mod writes is at a
// fixed relative path. `claude plugin test plugins/sawbuck-reins` runs these.

test('the mod runs no program and registers no command, in any flow', async ($, on) => {
  const runs: unknown[] = []
  const registered: unknown[] = []
  mock.env(on, {})
  on('command.register', (_, e) => { registered.push(e); return { value: { command: 'x' } } })
  on('process.run', (_, e) => { runs.push(e.argv); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('/.sawbuck/state.json') }))
  on('fs.read', (_, e) => { throw new Error(`ENOENT: ${e.path}`) })
  on('fs.write', () => ({ value: undefined }))
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"pressure":2,"axis":"x","nudge":"y"}', usage: { input_tokens: 1, output_tokens: 1 } } }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.prompt.submit({ text: 'no, change the approach' })
  await new Promise((r) => setTimeout(r, 150))

  expect(runs).toEqual([])
  expect(registered).toEqual([])
})

test('a SAWBUCK_JUDGE that names a CLI backend turns the plugin judge off: no model call, no program', async ($, on) => {
  const runs: unknown[] = []
  const models: unknown[] = []
  mock.env(on, { SAWBUCK_JUDGE: 'ollama:qwen2.5:7b' })
  on('process.run', (_, e) => { runs.push(e.argv); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('/.sawbuck/state.json') }))
  on('fs.read', (_, e) => { throw new Error(`ENOENT: ${e.path}`) })
  on('fs.write', () => ({ value: undefined }))
  on('model.complete', (_, e) => { models.push(e.model); return { value: { isAnswered: false, reason: 'api-error', status: null } } })
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.prompt.submit({ text: 'no, change the approach' })
  await new Promise((r) => setTimeout(r, 100))

  expect(models).toEqual([])
  expect(runs).toEqual([])
})

test('the native judge writes the steer tally at the fixed relative path', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  const models: string[] = []
  const probes: string[] = []
  mock.env(on, {})
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

test('a noise reply ("ok", a task notification) is not a pair: no model call, and the stash waits for a real reply', async ($, on) => {
  const models: string[] = []
  const writes: string[] = []
  mock.env(on, {})
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('/.sawbuck/state.json') }))
  on('fs.read', (_, e) => { throw new Error(`ENOENT: ${e.path}`) })
  on('fs.write', (_, e) => { writes.push(e.path); return { value: undefined } })
  on('model.complete', (_, e) => { models.push(e.prompt); return { value: { isAnswered: true, text: '{"pressure":1,"axis":"scope","nudge":"shorter"}', usage: { input_tokens: 1, output_tokens: 1 } } } })
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'Here is the plan.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.prompt.submit({ text: 'ok' })
  await $.prompt.submit({ text: '<task-notification>\n<task-id>abc</task-id>\n</task-notification>' })
  await new Promise((r) => setTimeout(r, 100))
  expect(models).toEqual([])
  expect(writes).toEqual([])
  await $.prompt.submit({ text: 'a bit shorter please, same plan' })
  for (let i = 0; i < 50 && writes.length === 0; i++) await new Promise((r) => setTimeout(r, 20))
  expect(models.length).toBe(1)
  expect(models[0]).toMatch(/AGENT just did: Here is the plan\./)
  expect(writes.length).toBe(1)
})

test('SAWBUCK_JUDGE=native stays native (no engine shell-out), and the steer window follows SAWBUCK_STEER_WINDOW', async ($, on) => {
  const runs: unknown[] = []
  const models: string[] = []
  const texts: string[] = []
  let last: string | null = null
  mock.env(on, { SAWBUCK_JUDGE: 'native', SAWBUCK_STEER_WINDOW: '5' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => { runs.push(e.argv); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('/.sawbuck/state.json') }))
  on('fs.read', (_, e) => { if (e.path.endsWith('/.sawbuck/steer.json') && last != null) return { value: last }; throw new Error(`ENOENT: ${e.path}`) })
  on('fs.write', (_, e) => { last = e.text; texts.push(e.text); return { value: undefined } })
  on('model.complete', (_, e) => {
    models.push(e.model)
    const pressure = models.length === 1 ? 3 : 0
    return { value: { isAnswered: true, text: `{"pressure":${pressure},"axis":"x","nudge":"y"}`, usage: { input_tokens: 1, output_tokens: 1 } } }
  })
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'first answer', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.prompt.submit({ text: 'no, stop, revert that' })
  await $.turn.complete({ answer: 'second answer', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await $.prompt.submit({ text: 'yes, go ahead with it' })
  for (let i = 0; i < 50 && texts.length < 2; i++) await new Promise((r) => setTimeout(r, 20))

  expect(runs).toEqual([])
  expect(models).toEqual(['claude-haiku-5-5', 'claude-haiku-5-5'])
  const rec = JSON.parse(texts[1])
  expect(rec.scored).toBe(2)
  expect(rec.steering).toBe(1)
  // span 5: alpha 2/6; ema after (1, 0) = 1 - 1/3
  expect(Math.abs(rec.ema - (1 - 2 / 6)) < 1e-9).toBe(true)
})
