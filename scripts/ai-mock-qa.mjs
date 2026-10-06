// Local-only acceptance harness. No backend files, cloud accounts, or production data are changed.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const backend = resolve(process.env.AI_QA_BACKEND || '../accordbook-ai')
const out = resolve(process.env.AI_QA_OUTPUT || '.qa/workspace/ai')
const origin = 'http://127.0.0.1:5183'
const endpoint = 'http://127.0.0.1:8086/v1/ai/formula-review'
const emulator = process.env.FIRESTORE_EMULATOR_HOST
if (!emulator || !/^(localhost|127\.0\.0\.1):\d+$/.test(emulator)) throw Error('Local emulator required')
process.env.METADATA_SERVER_DETECTION = 'none'
const projectId = 'demo-ai1c-' + randomUUID().slice(0, 8)
const load = path => import(pathToFileURL(resolve(backend, 'dist', path)).href)
const [{ createApp }, { readConfig }, { TransactionalQuotaStore }, { FirestoreAtomicDatabase }, auth, { mockFormulaReview }, { createLogger }] = await Promise.all([
  load('app.js'), load('config.js'), load('security/quota.js'), load('persistence/firestoreQuotaStore.js'),
  load('security/authentication.js'), load('agents/mockFormulaReview.js'), load('observability/logger.js'),
])
const { Firestore } = createRequire(resolve(backend, 'package.json'))('@google-cloud/firestore')
const admin = new Firestore({ projectId })
const policy = { enabled: true, perMinute: 3, perDay: 20, globalDaily: 100, globalInflight: 5, leaseMs: 120000 }
await admin.doc('aiControl/policy').set(policy)
const issued = []
async function account(changes = {}) {
  const token = auth.createAccessToken()
  issued.push(token)
  await admin.doc('aiTokens/' + auth.hashToken(token)).set({ aiUserId: randomUUID(), tokenHash: auth.hashToken(token), expiresAt: Date.now() + 3600000, revoked: false, ...changes })
  return token
}
const logs = [], consoleLines = [], requests = [], checks = [], viewports = []
const check = name => { checks.push(name); console.log('PASS', name) }
let mode = 'normal'
let release
const runner = async (request, signal) => {
  if (mode === 'malformed') return { summary: 'invalid' }
  if (mode === 'html') return { summary: '<img src=x onerror=alert(1)>', observations: [], nextChecks: [] }
  if (mode === 'delay') await new Promise(resolve => { release = resolve })
  return mockFormulaReview(request, signal)
}
const config = readConfig({ NODE_ENV: 'test', PORT: '8086', GOOGLE_CLOUD_PROJECT: projectId, FIRESTORE_EMULATOR_HOST: emulator,
  AI_ENABLED: 'true', DEV_ORIGINS: origin, RUN_TIMEOUT_MS: '2500', PROVIDER_TIMEOUT_MS: '2500', SERVER_DEADLINE_MS: '5000' })
const app = await createApp(config, new TransactionalQuotaStore(new FirestoreAtomicDatabase(new Firestore({ projectId }))), runner, createLogger(line => logs.push(line)))
await app.listen({ host: '127.0.0.1', port: 8086 })
const vite = await createServer({ configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 5183, strictPort: true, hmr: false },
  define: { 'import.meta.env.VITE_AI_ENABLED': JSON.stringify('true'), 'import.meta.env.VITE_AI_ENDPOINT': JSON.stringify(endpoint) } })
await vite.listen()
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
await context.route('**/*', route => {
  const url = new URL(route.request().url())
  return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  window.__aiQaWrites = 0
  for (const name of ['put', 'add', 'delete', 'clear']) {
    const original = IDBObjectStore.prototype[name]
    IDBObjectStore.prototype[name] = function (...args) { window.__aiQaWrites++; return original.apply(this, args) }
  }
})
const page = await context.newPage()
page.setDefaultTimeout(12000)
page.on('console', message => consoleLines.push(message.text()))
page.on('pageerror', () => { checks.push('UNEXPECTED_PAGE_ERROR') })
page.on('request', request => {
  if (request.url() === endpoint && request.method() === 'POST') requests.push({ body: request.postDataJSON(), headers: request.headers(), url: request.url() })
})
const panel = page.locator('.ai-review')
const execute = async () => {
  const sent = page.waitForRequest(request => request.url() === endpoint && request.method() === 'POST')
  await panel.locator('.ai-review-execute').click()
  await sent
}
const settle = () => page.waitForTimeout(2300)
const dump = () => page.evaluate(async () => {
  const { createStorage } = await import('/src/storage/storageService.ts')
  return { data: await (await createStorage()).exportData(), local: { ...localStorage }, writes: window.__aiQaWrites }
})
async function connect(token) {
  const clear = panel.getByRole('button', { name: /^(Clear token|토큰 지우기)$/ })
  if (await clear.isVisible()) await clear.click()
  await panel.locator('input[type=password]').fill(token)
  assert.equal(await panel.locator('input[type=password]').getAttribute('type'), 'password')
  await panel.getByRole('button', { name: /^(Use token|토큰 사용)$/ }).click()
}
async function runClient(token, key, extra = {}) {
  return page.evaluate(async ({ endpoint, token, key, extra }) => {
    const { reviewFormula } = await import('/src/services/aiClient.ts')
    const controller = new AbortController()
    if (extra.abort) setTimeout(() => controller.abort(), 150)
    try {
      await reviewFormula({ connection: { enabled: true, endpoint }, context: { type: 'accordbook-ai-context', version: 1, scope: 'formula_review', formula: { rows: [{ material: 'Hedione', parts: 100 }] } },
        locale: 'en', disclosureVersion: 1, token, signal: controller.signal, idempotencyKey: key, timeoutMs: extra.timeoutMs })
      return 'OK'
    } catch (error) { return error.code }
  }, { endpoint, token, key, extra })
}
try {
  await page.goto(origin)
  await page.locator('main.main').waitFor()
  await page.evaluate(async () => {
    const { browserFixture } = await import('/tests/workspaceBrowserFixture.ts')
    const { createStorage } = await import('/src/storage/storageService.ts')
    const { createProvenance } = await import('/src/services/provenance.ts')
    const s = await createStorage()
    const { source } = await browserFixture()
    source.formula.name = 'CANARY_NAME'
    source.formula.notes = 'CANARY_NOTES'
    source.formula.workspaceImport = { sourceFormulaId: 'CANARY_WORKSPACE', importedAt: '2026-10-01T00:00:00.000Z' }
    source.formula.provenance = await createProvenance(source.formula, 'created', { originType: 'original', creator: 'CANARY_ORIGIN', note: 'CANARY_PROVENANCE' })
    for (const version of source.versions) { version.note = 'CANARY_VERSION'; version.sourceRevisionId = source.formula.provenance.revisions[0].revisionId }
    for (const experiment of source.experiments) experiment.name = 'CANARY_EXPERIMENT'
    await s.workspaces.appendWorkspaceAtomic(source)
    await s.saveFormula({ ...source.formula, license: 'CANARY_LICENSE', drop: 'CANARY_DROP' })
    await s.meta.setSequence('CANARY_METADATA', 42)
    const other = { ...source.formula, id: 'other-formula', formulaId: 'OTHER-001', name: 'CANARY_UNRELATED', releasedVersionId: undefined }
    await s.saveFormula(other)
    localStorage.setItem('accordbook.activeFormulaId', source.formula.id)
    await s.settings.save({ formulaIdPrefix: 'ACC', language: 'en' })
    localStorage.setItem('accordbook.locale', 'en')
  })
  await page.reload()
  await page.locator('.intro-splash').waitFor({ state: 'hidden' })
  if (await page.locator('.first-start-close').isVisible()) await page.locator('.first-start-close').click()
  await page.locator('.formula-name').waitFor()
  await settle()
  await panel.getByRole('button', { name: 'AI REVIEW', exact: true }).click()
  assert.equal(requests.length, 0)
  assert.equal(await panel.getByRole('checkbox').nth(0).isChecked(), false)
  assert.equal(await panel.getByRole('checkbox').nth(1).isChecked(), false)
  await panel.getByRole('button', { name: 'I understand the transmission scope' }).click()
  const good = await account()
  await connect(good)
  const before = await dump()
  const firstSent = page.waitForRequest(request => request.url() === endpoint && request.method() === 'POST')
  await page.evaluate(() => { const button = document.querySelector('.ai-review-execute'); button.click(); button.click() })
  await firstSent
  await panel.locator('.ai-review-result').waitFor()
  await settle()
  assert.deepEqual(await dump(), before)
  assert.equal(requests.length, 1)
  const sent = requests[0]
  assert.deepEqual(Object.keys(sent.body).sort(), ['context', 'disclosureVersion', 'locale'])
  assert.deepEqual(Object.keys(sent.body.context.formula), ['rows'])
  assert.deepEqual(sent.body.context.formula.rows[1].dilution, { percent: 10, solvent: 'DPG' })
  for (const canary of ['CANARY_', 'formula-source', 'ACC-2610-001', good]) assert.ok(!JSON.stringify(sent.body).includes(canary))
  assert.ok(sent.headers.authorization === 'Bearer ' + good, 'authorization header contract')
  assert.match(sent.headers['idempotency-key'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  check('actual authenticated HTTP + CORS; exact allowlist; success has zero DB/localStorage/Core/Backup writes')
  await panel.getByRole('checkbox').nth(0).check(); await panel.getByRole('checkbox').nth(1).check()
  await execute(); await panel.locator('.ai-review-result').waitFor()
  assert.equal(requests.at(-1).body.context.formula.name, 'CANARY_NAME')
  assert.equal(requests.at(-1).body.context.formula.notes, 'CANARY_NOTES')
  await panel.getByRole('checkbox').nth(0).uncheck(); await panel.getByRole('checkbox').nth(1).uncheck()
  check('name and Notes explicit opt-in only; result becomes stale on selection change')
  assert.ok(await panel.locator('.ai-review-stale').isVisible())

  const invalid = auth.createAccessToken()
  await connect(invalid)
  const failureBefore = await dump()
  await execute(); await panel.getByRole('alert').waitFor()
  assert.match(await panel.getByRole('alert').innerText(), /Token not authorized/)
  await settle(); assert.deepEqual(await dump(), failureBefore)
  check('401 UI sanitized; failure has zero DB/Core/Backup writes')
  for (const [changes, code] of [[{ revoked: true }, 'TOKEN_REVOKED'], [{ expiresAt: Date.now() - 1000 }, 'TOKEN_EXPIRED']]) {
    assert.equal(await runClient(await account(changes), randomUUID()), code)
  }
  const duplicate = await account(), key = randomUUID()
  assert.equal(await runClient(duplicate, key), 'OK')
  assert.equal(await runClient(duplicate, key), 'DUPLICATE_REQUEST')
  await admin.doc('aiControl/policy').set({ ...policy, perMinute: 1 })
  const limited = await account()
  assert.equal(await runClient(limited, randomUUID()), 'OK')
  assert.equal(await runClient(limited, randomUUID()), 'RATE_LIMITED')
  await admin.doc('aiControl/policy').set({ ...policy, perDay: 1 })
  const quota = await account()
  assert.equal(await runClient(quota, randomUUID()), 'OK')
  assert.equal(await runClient(quota, randomUUID()), 'QUOTA_EXCEEDED')
  await admin.doc('aiControl/policy').set(policy)
  check('actual revoked/expired, duplicate, rate and daily quota responses')

  mode = 'malformed'
  assert.equal(await runClient(await account(), randomUUID()), 'INVALID_RESULT')
  mode = 'delay'
  const interrupted = runClient(await account(), randomUUID(), { abort: true })
  assert.equal(await interrupted, 'ABORTED'); release?.(); await page.waitForTimeout(200)
  const timeout = runClient(await account(), randomUUID(), { timeoutMs: 150 })
  assert.equal(await timeout, 'TIMEOUT'); release?.(); await page.waitForTimeout(200)
  mode = 'normal'
  check('actual invalid runner result and interrupted/timeout HTTP; no retries')

  await connect(await account())
  const editCount = requests.length
  // One browser task: controlled onChange commits before the deferred request capture, before the 250ms timer.
  await page.evaluate(() => {
    const input = document.querySelector('input.parts')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '777')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('.ai-review-execute').click()
  })
  await panel.locator('.ai-review-result').waitFor()
  assert.equal(requests.length, editCount + 1)
  assert.equal(requests.at(-1).body.context.formula.rows[0].parts, 777)
  await settle()
  const stored = await dump()
  assert.equal(stored.data.formulas.find(f => f.id === 'formula-source').rows[0].parts, 777)
  check('latest edit captured before 250ms autosave; normal autosave persists it')

  const imeCount = requests.length
  await page.locator('input.material').first().dispatchEvent('compositionstart')
  await panel.locator('.ai-review-execute').click(); await page.waitForTimeout(100)
  assert.equal(requests.length, imeCount)
  await page.locator('input.material').first().dispatchEvent('compositionend')
  await page.locator('input.cas').first().fill('')
  await page.locator('input.material').first().fill('Benzyl acetate')
  await execute(); await panel.locator('.ai-review-result').waitFor()
  assert.equal(requests.at(-1).body.context.formula.rows[0].cas, '140-11-4')
  check('IME blocks unfinished composition; material blur CAS included in final snapshot')
  await settle()
  const controlWrites = (await dump()).writes
  await page.locator('input.parts').first().fill('779')
  await settle()
  const controlDelta = (await dump()).writes - controlWrites
  await connect(await account())
  const reviewWrites = (await dump()).writes
  await page.locator('input.parts').first().fill('780')
  await execute(); await panel.locator('.ai-review-result').waitFor(); await settle()
  assert.equal((await dump()).writes - reviewWrites, controlDelta)
  assert.ok(controlDelta > 0)
  check('pending autosave control: edit plus AI produces exactly the same DB write count as edit alone')

  mode = 'delay'
  await connect(await account())
  await execute()
  await panel.getByText('Review in progress…', { exact: true }).last().waitFor()
  const runningCount = requests.length
  await page.locator('input.parts').first().fill('778')
  assert.ok(await panel.locator('.ai-review-stale').isVisible())
  release?.(); await page.waitForTimeout(300)
  assert.equal(await panel.locator('.ai-review-result').count(), 0)
  assert.equal(requests.length, runningCount)
  check('edits abort current request; late result ignored; editor remains usable')

  await connect(await account()); await execute()
  await panel.getByText('Review in progress…', { exact: true }).last().waitFor()
  await page.getByRole('button', { name: /OTHER-001 CANARY_UNRELATED/ }).click()
  release?.(); await page.waitForTimeout(300)
  assert.equal(await panel.locator('.ai-review-result').count(), 0)
  assert.equal(await panel.locator('.ai-review-body').count(), 0)
  await panel.getByRole('button', { name: 'AI REVIEW', exact: true }).click()
  assert.equal(await panel.locator('input[type=password]').count(), 1)
  check('Formula switch unmounts, clears token/result, ignores late response')
  await connect(await account()); await execute()
  await panel.getByText('Review in progress…', { exact: true }).last().waitFor()
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  release?.(); await page.waitForTimeout(200)
  await panel.getByRole('button', { name: 'AI REVIEW', exact: true }).click()
  assert.equal(await panel.locator('.ai-review-result').count(), 0)
  assert.equal(await panel.locator('input[type=password]').inputValue(), '')
  check('closing a running review clears token, aborts and ignores its late response')
  mode = 'html'
  await connect(await account()); await execute(); await panel.locator('.ai-review-result').waitFor()
  assert.equal(await panel.locator('.ai-review-result img').count(), 0)
  assert.ok((await panel.locator('.ai-review-result').innerText()).includes('<img src=x onerror=alert(1)>'))
  check('response HTML displayed as inert React text')
  mode = 'normal'
  await connect(await account()); await execute(); await panel.locator('.ai-review-result').waitFor()

  const matrix = [[1440,900],[1920,1080],[1180,820],[1024,768],[820,1180],[768,1024],[430,932],[390,844],[375,812],[360,800],[1199,900],[1200,900],[767,1024]]
  for (const [width, height] of matrix) {
    await page.setViewportSize({ width, height })
    await panel.scrollIntoViewIfNeeded()
    const measure = await page.evaluate(() => {
      const p = document.querySelector('.ai-review')
      return { viewport: innerWidth, document: document.documentElement.scrollWidth, panel: p.clientWidth, panelScroll: p.scrollWidth,
        overflow: [...p.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > p.getBoundingClientRect().right + 1).length }
    })
    assert.ok(measure.document <= width + 1, 'document overflow at ' + width)
    assert.ok(measure.panelScroll <= measure.panel + 1 && measure.overflow === 0, 'panel overflow at ' + width)
    viewports.push({ width, height, ...measure })
    await page.screenshot({ path: resolve(out, 'ai-' + width + 'x' + height + '.png') })
  }
  await panel.getByRole('button', { name: 'Clear token', exact: true }).click()
  await panel.locator('input[type=password]').fill('not-a-token')
  await panel.getByRole('button', { name: 'Use token', exact: true }).click()
  for (const [width, height] of matrix) {
    await page.setViewportSize({ width, height })
    assert.equal(await panel.locator('.ai-review-execute').isDisabled(), true)
    assert.equal(await panel.locator('input[type=password]').inputValue(), '')
    const measured = await panel.evaluate(p => ({ scroll: p.scrollWidth, width: p.clientWidth, page: document.documentElement.scrollWidth, viewport: innerWidth }))
    assert.ok(measured.scroll <= measured.width + 1 && measured.page <= measured.viewport + 1)
    viewports.push({ width, height, state: 'masked-token/error/disabled', ...measured })
  }
  await panel.locator('input[type=password]').focus()
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'AI REVIEW')
  assert.equal(await panel.locator('.ai-review-body').count(), 0)
  await page.keyboard.press('Enter')
  assert.equal(await panel.locator('input[type=password]').inputValue(), '')
  await page.getByRole('button', { name: '한국어', exact: true }).click()
  assert.ok((await panel.innerText()).includes('로컬 MOCK'))
  await page.screenshot({ path: resolve(out, 'ai-ko-767.png') })
  check('13 responsive sizes and breakpoints; masked token, keyboard Escape/focus restoration, Korean')

  await page.setViewportSize({ width: 1440, height: 900 })
  await connect(await account())
  await app.close()
  await execute(); await panel.getByRole('alert').waitFor()
  assert.match(await panel.getByRole('alert').innerText(), /연결에 실패/)
  const countAfterStop = requests.length
  await page.waitForTimeout(300)
  assert.equal(requests.length, countAfterStop)
  await page.locator('input.parts').first().fill('501')
  await settle()
  assert.equal((await dump()).data.formulas.find(f => f.id === 'other-formula').rows[0].parts, 501)
  check('backend stopped: actionable connection error, no retry, editing/autosave still work')

  const final = await dump()
  const sensitiveLogs = consoleLines.join('\n') + logs.join('\n')
  for (const value of [...issued, invalid, 'CANARY_', 'formula-source', 'ACC-2610-001']) assert.ok(!sensitiveLogs.includes(value), 'log privacy')
  for (const value of issued) assert.ok(!JSON.stringify(final).includes(value), 'token persistence')
  const bundlePaths = (await readdir(resolve('dist/assets'))).filter(path => path.endsWith('.js'))
  const bundle = (await Promise.all(bundlePaths.map(path => readFile(resolve('dist/assets', path), 'utf8')))).join('\n')
  for (const value of [...issued, invalid]) assert.ok(!bundle.includes(value), 'token in production bundle')
  check('production JavaScript contains none of the individually issued test tokens')
  const localChanges = Object.entries(final.local).filter(([key, value]) => before.local[key] !== value)
  assert.ok(!JSON.stringify(localChanges).includes('CANARY_'))
  assert.equal(checks.includes('UNEXPECTED_PAGE_ERROR'), false)
  check('tokens absent from DB/localStorage/logs; canaries absent from logs and new localStorage values')
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ checks, viewports, requestCount: requests.length, backendChanged: false, projectId }, null, 2))
} finally {
  release?.()
  await browser.close()
  await vite.close()
  await app.close()
  await admin.terminate()
}
