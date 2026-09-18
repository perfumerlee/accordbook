import { readFile, mkdir, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import https from 'node:https'

const root = process.cwd()
const baseUrl = process.env.GUIDE_CAPTURE_URL || 'https://localhost:5173'
const manifest = JSON.parse(await readFile(join(root, 'scripts/guide-capture.manifest.json'), 'utf8'))
const filter = process.argv[2]
const captures = (filter ? manifest.filter(item => item.chapter === filter) : manifest).filter(item => item.enabled !== false)
if (!captures.length) throw new Error(`No Guide captures configured for: ${filter}`)
let server
async function available() { try { if (baseUrl.startsWith('https:')) await new Promise((resolve, reject) => https.get(baseUrl, { rejectUnauthorized: false }, response => { response.resume(); response.on('end', resolve) }).on('error', reject)); else await fetch(baseUrl); return true } catch { return false } }
if (!(await available())) { const port = new URL(baseUrl).port || '5173'; server = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--port', port], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }); for (let i=0;i<30&&!await available();i++) await new Promise(r=>setTimeout(r,500)) }
if (!(await available())) throw new Error(`Guide capture server unavailable: ${baseUrl}`)
const browser = await chromium.launch({ headless: true })

async function waitForAccordbookStable(page) {
  await page.locator('main.main').waitFor({ state: 'visible', timeout: 15000 })
  await page.evaluate(() => document.fonts?.ready)
  await page.getByText(/Saved locally|로컬 저장 완료/).waitFor({ state: 'visible', timeout: 10000 })
}

async function prepareGettingStartedFormula(page) {
  await waitForAccordbookStable(page)
  const welcomeClose = page.locator('.first-start-close')
  if (await welcomeClose.count()) await welcomeClose.click({ force: true })
  const welcomeBackdrop = page.locator('.first-start-backdrop')
  if (await welcomeBackdrop.count()) await welcomeBackdrop.evaluate((element) => element.remove())
  const title = page.locator('input.formula-name')
  await title.fill('Documentation Formula')
  const materialInputs = page.locator('.rows input.material')
  const partsInputs = page.locator('.rows input[type="number"]')
  await materialInputs.first().fill('Bergamot')
  await partsInputs.first().fill('40')
  for (const [name, parts] of [['Hedione', '30'], ['Iso E Super', '20'], ['Galaxolide', '10']]) {
    await page.getByRole('button', { name: /\+ Add material|\+ 원료 추가/i }).click()
    await materialInputs.nth(await materialInputs.count() - 1).fill(name)
    await partsInputs.nth(await partsInputs.count() - 1).fill(parts)
  }
  await page.waitForTimeout(700)
  await page.getByText(/Saved locally|로컬 저장 완료/).waitFor({ state: 'visible', timeout: 10000 })
}

async function prepareTimeMachineHistory(page, state = 'time-machine-timeline') {
  await prepareGettingStartedFormula(page)
  const open = page.getByRole('button', { name: /TIME MACHINE/i }).first()
  await open.click()
  const saveVersion = async (note) => {
    await page.getByRole('button', { name: /\+ SAVE VERSION/i }).click()
    const noteBox = page.getByPlaceholder(/Optional experiment/i)
    if (await noteBox.count()) await noteBox.fill(note)
    await page.getByRole('button', { name: 'Save Version', exact: true }).click()
    await page.waitForTimeout(500)
  }
  await saveVersion('Documentation baseline')
  await page.getByRole('button', { name: /Time Machine/i }).first().press('Escape').catch(() => {})
  await page.locator('.tm-close').click().catch(() => {})
  await page.locator('.rows input[type="number"]').nth(0).fill('45')
  await page.getByRole('button', { name: /TIME MACHINE/i }).first().click()
  await saveVersion('Documentation revision')
  if (!(await page.getByText(/v2/).count())) throw new Error('Time Machine preparation failed: second saved version is not visible')
  if (state === 'time-machine-version-detail' || state === 'time-machine-restore') {
    await page.locator('.tm-item').first().click()
    await page.getByText(/READ ONLY|VERSION NOTE/).first().waitFor({ state: 'visible' })
    if (state === 'time-machine-restore') await page.getByRole('button', { name: /RESTORE THIS VERSION/i }).click()
  }
  if (state === 'time-machine-compare') {
    await page.locator('.tm-item').first().click()
    await page.getByRole('button', { name: /^COMPARE$/i }).click()
    await page.getByText(/COMPARE/i).first().waitFor({ state: 'visible' })
  }
}

async function prepareExperiments(page, withVariants = false) {
  await prepareGettingStartedFormula(page)
  await page.getByRole('button', { name: /EXPERIMENTS|실험/i }).first().click({ force: true })
  const remainingWelcome = page.locator('.first-start-backdrop')
  if (await remainingWelcome.count()) await remainingWelcome.evaluate((element) => element.remove())
  await page.getByRole('button', { name: /CREATE EXPERIMENT|실험 만들기/i }).click()
  await page.getByLabel(/EXPERIMENT NAME|실험 이름/i).fill('Soft Floral Study')
  await page.getByRole('button', { name: /^CREATE$|^만들기$/i }).click()
  await page.locator('.experiment-detail').waitFor({ state: 'visible', timeout: 10000 })
  if (withVariants) {
    const add = page.getByRole('button', { name: /\+ ADD VARIANT|\+ 시안 추가/i })
    await add.click()
    await add.click()
    const branch = page.getByRole('button', { name: /Create Branch from A/i })
    if (await branch.count()) await branch.click()
    await page.waitForTimeout(500)
  }
}

async function prepareFormulaFileActions(page) {
  await prepareGettingStartedFormula(page)
  await page.getByRole('button', { name: /Export|내보내기/i }).click()
  await page.getByRole('button', { name: /Export current formula|현재 포뮬러 내보내기/i }).waitFor({ state: 'visible' })
}

try {
  for (const item of captures) {
    const context = await browser.newContext({ viewport: item.viewport, reducedMotion: 'reduce', ignoreHTTPSErrors: true })
    try {
      const page = await context.newPage()
      if (item.locale === 'ko') await context.addInitScript(() => localStorage.setItem('accordbook.locale', 'ko'))
      await page.goto(baseUrl + item.route, { waitUntil: 'networkidle' })
      if (item.state === 'formula-with-materials') await prepareGettingStartedFormula(page)
      if (item.state.startsWith('time-machine-')) await prepareTimeMachineHistory(page, item.state)
      if (item.state === 'experiments-base' || item.state === 'experiments-variants') await prepareExperiments(page, item.state === 'experiments-variants')
      if (item.state === 'formula-file-actions') await prepareFormulaFileActions(page)
      if (item.state === 'drop-detail') await page.waitForSelector('.formula-drop-detail', { state: 'visible', timeout: 15000 })
      await waitForAccordbookStable(page).catch(() => {})
      const target = page.locator(item.target)
      await target.waitFor({ state: 'visible', timeout: 10000 })
      const output = resolve(root, 'content/guide/assets', item.output)
      await mkdir(resolve(output, '..'), { recursive: true })
      await target.screenshot({ path: output, type: 'png' })
      console.log(`Captured ${item.captureId} → ${output}`)
    } finally { await context.close() }
  }
} finally { await browser.close(); if (server) server.kill() }
