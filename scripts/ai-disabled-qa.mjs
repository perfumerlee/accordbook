// Production-disabled smoke QA; uses the existing synthetic Workspace fixture through a test-only helper server.
import assert from 'node:assert/strict'
import { createServer, preview } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const out = resolve(process.env.AI_QA_OUTPUT || '.qa/workspace/ai')
const helper = await createServer({ configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 5183, hmr: false, strictPort: true },
  define: { 'import.meta.env.VITE_AI_ENABLED': JSON.stringify('false'), 'import.meta.env.VITE_AI_ENDPOINT': JSON.stringify('') } })
await helper.listen()
const production = await preview({ configFile: false, preview: { host: '127.0.0.1', port: 5184, strictPort: true } })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
await context.route('**/*', async route => {
  const url = new URL(route.request().url())
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort()
  if (/^\/(src|tests|node_modules|@vite|@id|@fs)\//.test(url.pathname)) {
    const response = await route.fetch({ url: 'http://127.0.0.1:5183' + url.pathname + url.search })
    return route.fulfill({ response })
  }
  return route.continue()
})
const page = await context.newPage()
page.setDefaultTimeout(15000)
let aiRequests = 0
page.on('request', r => { if (r.url().includes('/v1/ai/')) aiRequests++ })
const checks = []
const check = name => { checks.push(name); console.log('PASS', name) }
try {
  await page.goto('http://127.0.0.1:5184')
  await page.locator('main.main').waitFor()
  await page.evaluate(async () => {
    const { browserFixture } = await import('/tests/workspaceBrowserFixture.ts')
    const { createStorage } = await import('/src/storage/storageService.ts')
    const s = await createStorage(), { source } = await browserFixture()
    await s.workspaces.appendWorkspaceAtomic(source)
    await s.settings.save({ formulaIdPrefix: 'ACC', language: 'en' })
    localStorage.setItem('accordbook.activeFormulaId', source.formula.id)
    localStorage.setItem('accordbook.locale', 'en')
  })
  await page.reload()
  await page.locator('.intro-splash').waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.ai-review').count(), 0)
  await page.locator('input.parts').first().fill('501')
  await page.waitForTimeout(2300)
  assert.equal(await page.evaluate(async () => {
    const { createStorage } = await import('/src/storage/storageService.ts')
    return (await (await createStorage()).formulas.get('formula-source')).rows[0].parts
  }), 501)
  check('production build hides AI; editing/autosave work with no backend')
  await page.getByRole('button', { name: 'Export ▾', exact: true }).click()
  const downloadPending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export formula workspace', exact: true }).click()
  const download = await downloadPending
  const path = await download.path()
  await page.locator('input[type=file][accept=".accordbook"]').nth(1).setInputFiles(path)
  await page.getByRole('status').filter({ hasText: 'Workspace imported.' }).waitFor()
  check('production-disabled Workspace export/import roundtrip works')
  await page.locator('.tm-page-action').click()
  await page.locator('.tm-item').first().waitFor()
  assert.equal(await page.locator('.tm-item.manual').count(), 3)
  await page.locator('.tm-close').click()
  await page.getByRole('button', { name: 'Experiments', exact: true }).click()
  await page.locator('.experiment-list-item').first().waitFor()
  await page.locator('.experiment-list-item').first().click()
  await page.locator('.experiment-detail').waitFor()
  check('production-disabled Time Machine and Experiments retain imported histories')
  assert.equal(aiRequests, 0)
  check('zero AI network requests throughout production-disabled Core workflows')
  // Separate dev page: actual React boundary class and no-current-Formula branch.
  const probe = await context.newPage()
  await probe.goto('http://127.0.0.1:5183')
  await probe.locator('main.main').waitFor()
  await probe.evaluate(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js')
    const React = reactModule.default ?? reactModule
    const domModule = await import('/node_modules/.vite/deps/react-dom_client.js')
    const { createRoot } = domModule.default ?? domModule
    const { default: Boundary } = await import('/src/components/AiErrorBoundary.tsx')
    const { default: Panel } = await import('/src/components/AiFormulaReview.tsx')
    const host = document.createElement('div'); host.id = 'ai-boundary-probe'; document.body.prepend(host)
    function Broken() { throw new Error('AI_TEST_RENDER_FAILURE') }
    createRoot(host).render(React.createElement(Boundary, { language: 'en' }, React.createElement(Broken)))
    const second = document.createElement('div'); second.id = 'ai-empty-probe'; document.body.prepend(second)
    createRoot(second).render(React.createElement(Panel, { language: 'en', connection: { enabled: true, endpoint: 'http://127.0.0.1:8086/v1/ai/formula-review' } }))
  })
  await probe.locator('#ai-boundary-probe').getByText('AI Review is unavailable. You can continue editing the Formula.').waitFor()
  await probe.locator('#ai-empty-probe').getByRole('button', { name: 'AI REVIEW', exact: true }).click()
  await probe.locator('#ai-empty-probe').getByText('No current Formula is available.').waitFor()
  assert.equal(await probe.locator('#ai-empty-probe .ai-review-execute').isDisabled(), true)
  await probe.locator('.intro-splash').waitFor({ state: 'hidden' })
  await probe.locator('input.parts').first().fill('502')
  check('render exception stays inside AI boundary; no-current-Formula UI; Notebook remains editable')
  await mkdir(out, { recursive: true })
  await writeFile(resolve(out, 'disabled-report.json'), JSON.stringify({ checks, aiRequests }, null, 2))
} finally {
  await browser.close(); await helper.close(); await new Promise(resolve => production.httpServer.close(resolve))
}
