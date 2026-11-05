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

test('the judge is on by default, and uses Sonnet', async ($, on) => {
  const writes: string[] = []
  const models: string[] = []
  mock.env(on, {})
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('/.sawbuck/state.json') }))
  on('fs.read', (_, e) => { throw new Error(`ENOENT: ${e.path}`) })
  on('fs.write', (_, e) => { writes.push(e.path); return { value: undefined } })
  on('model.complete', (_, e) => { models.push(e.model); return { value: { isAnswered: false, reason: 'api-error', status: null } } })
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.prompt.submit({ text: 'no, change the approach.' })
  await new Promise((r) => setTimeout(r, 100))

  expect(models).toEqual(['claude-sonnet-5-5'])
})

test('the native judge writes the steer tally at the fixed relative path', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  const models: string[] = []
  const probes: string[] = []
  mock.env(on, { SAWBUCK_JUDGE: 'native' })
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
  expect(models).toEqual(['claude-sonnet-5-5'])
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
  mock.env(on, { SAWBUCK_JUDGE: 'native' })
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
  mock.env(on, { SAWBUCK_JUDGE: 'native' })
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
  expect(models).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5-5'])
  const rec = JSON.parse(texts[1])
  expect(rec.scored).toBe(2)
  expect(rec.steering).toBe(1)
  // span 5: alpha 2/6; ema after (1, 0) = 1 - 1/3
  expect(Math.abs(rec.ema - (1 - 2 / 6)) < 1e-9).toBe(true)
})

test('a steer.json from another session is read: the pair index restarts at 1, the tallies carry', async ($, on) => {
  const texts: string[] = []
  mock.env(on, { SAWBUCK_JUDGE: 'native' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('/.sawbuck/state.json') }))
  on('fs.read', (_, e) => {
    if (e.path.endsWith('/.sawbuck/steer.json')) return { value: JSON.stringify({ session: 'native:someothersession', lastPairs: 50, scored: 10, steering: 5, _wsum: 12, ema: 0.5, distribution: { 0: 5, 1: 2, 2: 2, 3: 1 } }) }
    throw new Error(`ENOENT: ${e.path}`)
  })
  on('fs.write', (_, e) => { texts.push(e.text); return { value: undefined } })
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"pressure":2,"axis":"x","nudge":"y"}', usage: { input_tokens: 1, output_tokens: 1 } } }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'an answer', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.prompt.submit({ text: 'no, do it the other way' })
  for (let i = 0; i < 50 && texts.length === 0; i++) await new Promise((r) => setTimeout(r, 20))

  expect(texts.length).toBe(1)
  const rec = JSON.parse(texts[0])
  expect(rec.lastPairs).toBe(1)                       // before the fix: 51, and the engine would skip 50 pairs of this session
  expect(typeof rec.session).toBe('string')
  expect(rec.session.startsWith('native:')).toBe(true)
  expect(rec.session).not.toBe('native:someothersession')
  expect(rec.scored).toBe(11)
  expect(rec.steering).toBe(6)
})

test('two hard throws then an answer: scoring continues (one bad call is one lost sample)', async ($, on) => {
  const models: string[] = []
  const texts: string[] = []
  mock.env(on, { SAWBUCK_JUDGE: 'native' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('/.sawbuck/state.json') }))
  on('fs.read', (_, e) => { throw new Error(`ENOENT: ${e.path}`) })
  on('fs.write', (_, e) => { texts.push(e.text); return { value: undefined } })
  on('model.complete', (_, e) => {
    models.push(e.model)
    if (models.length <= 2) throw new Error('overloaded')
    return { value: { isAnswered: true, text: '{"pressure":1,"axis":"x","nudge":"y"}', usage: { input_tokens: 1, output_tokens: 1 } } }
  })
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  for (let i = 1; i <= 3; i++) {
    await $.turn.complete({ answer: 'answer ' + i, durationMs: 1, isAborted: false, turnId: 't' + i, reason: 'answer' })
    await $.prompt.submit({ text: 'no, change answer ' + i })
    for (let k = 0; k < 50 && models.length < i; k++) await new Promise((r) => setTimeout(r, 20))
  }
  for (let i = 0; i < 50 && texts.length === 0; i++) await new Promise((r) => setTimeout(r, 20))

  expect(models.length).toBe(3)   // the third call still happened
  expect(texts.length).toBe(1)    // and its sample was recorded
})

// LAST on purpose: this test leaves the module's native judge switched off for the rest of the file.
test('three hard throws in a row switch the native judge off for the session', async ($, on) => {
  const models: string[] = []
  mock.env(on, { SAWBUCK_JUDGE: 'native' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('/.sawbuck/state.json') }))
  on('fs.read', (_, e) => { throw new Error(`ENOENT: ${e.path}`) })
  on('fs.write', () => ({ value: undefined }))
  on('model.complete', (_, e) => { models.push(e.model); throw new Error('org-blocked') })
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  for (let i = 1; i <= 4; i++) {
    await $.turn.complete({ answer: 'answer ' + i, durationMs: 1, isAborted: false, turnId: 't' + i, reason: 'answer' })
    await $.prompt.submit({ text: 'no, change answer ' + i })
    await new Promise((r) => setTimeout(r, 100))
  }

  expect(models.length).toBe(3)   // the fourth turn made no call
})

test('the offer: a git repo with no contract gets one line once per directory, a signed repo gets none, and nothing is written', async ($, on) => {
  const writes: string[] = []
  let hasLock = false
  mock.env(on, { SAWBUCK_JUDGE: 'native' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('.git') || (hasLock && e.path.endsWith('promptwheel.config.json')) }))
  on('fs.read', (_, e) => { throw new Error(`ENOENT: ${e.path}`) })
  on('fs.write', (_, e) => { writes.push(e.path); return { value: undefined } })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' as const }] }))
  on('session.cwd', () => ({ value: '/repo' }))
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => { store.set(e.key, e.value); return { value: undefined } })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const r = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
  expect(r.sections.some((s) => s.id === 'sawbuck-reins:offer')).toBe(true)
  expect(writes).toEqual([])
  expect([...store.keys()]).toEqual(['offered:/repo'])
})

test('outside a git repository: steers land in the store, no file is written, nothing reaches a prompt, and judge off means no call', async ($, on) => {
  const writes: string[] = []
  const models: unknown[] = []
  const store = new Map<string, unknown>()
  mock.env(on, { SAWBUCK_JUDGE: 'native' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: null }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('/.sawbuck/state.json') || e.path.endsWith('package.json') }))
  on('fs.read', (_, e) => { throw new Error(`ENOENT: ${e.path}`) })
  on('fs.write', (_, e) => { writes.push(e.path); return { value: undefined } })
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('model.complete', (_, e) => { models.push(e.model); return { value: { isAnswered: true, text: '{"pressure":2,"axis":"scope","nudge":"keep changes small"}', usage: { input: 1, output: 1 } } } })
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' as const }] }))
  on('session.cwd', () => ({ value: '/notes' }))
  await $.session.start({ cwd: '/notes', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.prompt.submit({ text: 'no, change the approach' })
  await new Promise((r) => setTimeout(r, 150))
  expect(models.length).toBe(1)
  expect(writes).toEqual([])
  expect((store.get('steers') as any[])[0].nudge).toBe('keep changes small')
  expect(store.get('steerStats')).toEqual({ scored: 1, lost: 0 })
  const r = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
  expect(JSON.stringify(r.sections).includes('keep changes small')).toBe(false)
})

test('the scratchpad keeps the newest 2000 steers', async ($, on) => {
  const store = new Map<string, unknown>([['steers', Array.from({ length: 2000 }, (_, i) => ({ nudge: `old ${i}`, session: 's', repo: '' }))]])
  mock.env(on, { SAWBUCK_JUDGE: 'native' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: null }))
  on('fs.exists', () => ({ value: false }))
  on('fs.read', (_, e) => { throw new Error(`ENOENT: ${e.path}`) })
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"pressure":1,"axis":"x","nudge":"newest one"}', usage: { input: 1, output: 1 } } }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/notes', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.prompt.submit({ text: 'no, other way' })
  await new Promise((r) => setTimeout(r, 150))
  const list = store.get('steers') as any[]
  expect(list.length).toBe(2000)
  expect(list[1999].nudge).toBe('newest one')
})

test('the memory band names no command that is gone: it points at the CLI for history', async ($, on) => {
  mock.env(on, { SAWBUCK_JUDGE: 'off' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('.git') || e.path.endsWith('LOGBOOK.md') }))
  on('fs.read', (_, e) => { throw new Error(`ENOENT: ${e.path}`) })
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount({ plugin: 'sawbuck-reins', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } as any })
  const band = await ui.find({ type: 'Text', text: /memory/ })
  expect(band?.text).toContain('sawbuck context')
  expect(band?.text).not.toContain('/sawbuck-reins:context')
})
