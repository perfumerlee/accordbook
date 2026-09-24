// Run against a local Vite dev server: node scripts/evaluation-smoke.mjs https://localhost:5186
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
let page
try {
  page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1100 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(process.argv[2] || 'https://localhost:5186')
  await page.locator('.experiments-page-action').waitFor()
  await page.evaluate(async () => {
    const { createStorage } = await import('/src/storage/storageService.ts')
    const { createExperimentFromCurrent, addVariantFromBase } = await import('/src/services/experimentLifecycle.ts')
    const storage = await createStorage()
    const formula = { id: 'evaluation-smoke', formulaId: 'ACC-EVAL-001', name: 'Evaluation study', notes: '', date: '2026-09-25', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rows: [{ id: 'r', rowId: 'r', material: 'Hedione', parts: 1000, cas: '24851-98-7', dilution: { enabled: true, percent: 10, solvent: 'DPG' } }] }
    await storage.formulas.save(formula)
    await storage.experiments.save(addVariantFromBase(createExperimentFromCurrent(formula)))
  })
  await page.reload()
  await page.getByRole('button', { name: /ACC-EVAL-001/ }).click()
  await page.locator('.experiments-page-action').click()
  await page.locator('.experiment-list-item').click()
  await page.getByRole('button', { name: 'A', exact: true }).click()
  await page.getByRole('button', { name: 'Record an evaluation', exact: true }).click()
  await page.getByLabel('What did you notice?').fill('The opening is clearer; the drydown needs more body.')
  await page.getByLabel('Next direction', { exact: true }).selectOption('continue')
  await page.getByLabel('What to try next (optional)').fill('Adjust the woody accord only.')
  // Draft survives navigation away from the Variant.
  await page.getByRole('button', { name: 'BASE', exact: true }).click()
  await page.getByRole('button', { name: 'A', exact: true }).click()
  assert.match(await page.getByLabel('What did you notice?').inputValue(), /opening is clearer/)
  await page.getByRole('button', { name: 'Save evaluation', exact: true }).click()
  await page.locator('.experiment-save-status[data-state="saved"]').waitFor()
  await page.getByLabel('Parts', { exact: true }).fill('500')
  await page.getByRole('button', { name: 'Edit evaluation', exact: true }).click()
  await page.getByLabel('What did you notice?').fill('Clearer opening. Rechecked after an hour.')
  await page.getByRole('button', { name: 'Save evaluation', exact: true }).click()
  await page.locator('.evaluation-card summary').click()
  assert.equal(await page.locator('.evaluation-snapshot tbody td').first().innerText(), '1000')
  await page.getByRole('button', { name: 'Create next Branch from this composition', exact: true }).click()
  await page.getByRole('button', { name: 'A1, Branch of A', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Parts', { exact: true }).inputValue(), '1000')
  assert.equal(await page.getByLabel('Variant note').inputValue(), 'Adjust the woody accord only.')
  await page.locator('.experiment-save-status[data-state="saved"]').waitFor()
  await page.getByRole('button', { name: 'A, 1 Branch', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Delete evaluation', exact: true }).isDisabled(), true)
  await page.locator('.evaluation-card summary').click()
  await page.locator('.variant-evaluations').scrollIntoViewIfNeeded()
  const screenshot = join(tmpdir(), 'accordbook-evaluation-smoke.png')
  await page.screenshot({ path: screenshot })
  await page.reload()
  await page.locator('.experiments-page-action').click()
  await page.locator('.experiment-list-item').click()
  await page.getByRole('button', { name: 'A, 1 Branch', exact: true }).click()
  assert.match(await page.locator('.evaluation-observation').innerText(), /Rechecked after an hour/)
  assert.equal(await page.getByLabel('Parts', { exact: true }).inputValue(), '500')
  await page.evaluate(() => localStorage.setItem('accordbook.locale', 'ko'))
  await page.setViewportSize({ width: 1180, height: 820 })
  await page.reload()
  await page.locator('.experiments-page-action').click()
  await page.locator('.experiment-list-item').click()
  await page.getByRole('button', { name: 'A, Branch 1개', exact: true }).click()
  await page.getByRole('button', { name: '시향 기록 남기기', exact: true }).click()
  await page.getByLabel('어땠나요?').fill('잔향을 다시 확인했습니다.')
  await page.getByRole('button', { name: '기록 저장', exact: true }).click()
  await page.locator('.experiment-save-status[data-state="saved"]').waitFor()
  assert.equal(await page.locator('.evaluation-card').count(), 2)
  await page.locator('.variant-evaluations').scrollIntoViewIfNeeded()
  const koreanScreenshot = join(tmpdir(), 'accordbook-evaluation-smoke-ko.png')
  await page.screenshot({ path: koreanScreenshot })
  // An unreferenced evaluation can be removed without affecting the linked one.
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '기록 삭제', exact: true }).first().click()
  assert.equal(await page.locator('.evaluation-card').count(), 1)
  for (const [verdict, field, text, button, purpose] of [
    ['hold', '확인할 것 (선택)', '하루 뒤 같은 농도에서 다시 시향한다.', '확인용 Branch 만들기', '확인용 Branch'],
    ['uncertain', '판단에 필요한 것 (선택)', 'BASE와 같은 조건에서 비교한다.', '비교용 Branch 만들기', '비교용 Branch'],
    ['stop', '이 방향을 종료한 이유 (선택)', '원하는 투명함과 멀어져 이 방향은 종료한다.', undefined, undefined],
  ]) {
    await page.getByRole('button', { name: '시향 기록 남기기', exact: true }).click()
    await page.getByLabel('어땠나요?').fill(`${verdict}: 배합의 변화를 다시 확인했습니다.`)
    await page.getByLabel('다음 방향', { exact: true }).selectOption(verdict)
    await page.getByLabel(field, { exact: true }).fill(text)
    if (verdict === 'hold') {
      // Switching to Finish here keeps the action separate from its reason.
      await page.getByLabel('다음 방향', { exact: true }).selectOption('stop')
      assert.equal(await page.getByLabel('남겨둔 다음 작업 (선택)', { exact: true }).inputValue(), text)
      await page.getByLabel('이 방향을 종료한 이유 (선택)', { exact: true }).fill('종료도 고려했지만 확인이 먼저 필요하다.')
      await page.getByLabel('다음 방향', { exact: true }).selectOption('hold')
      assert.equal(await page.getByLabel(field, { exact: true }).inputValue(), text)
      assert.match(await page.getByLabel('종료 판단 메모 (선택)', { exact: true }).inputValue(), /확인이 먼저/)
    }
    await page.getByRole('button', { name: '기록 저장', exact: true }).click()
    await page.locator('.experiment-save-status[data-state="saved"]').waitFor()
    const card = page.locator(`.evaluation-card[data-verdict="${verdict}"]`)
    if (button) {
      await card.getByRole('button', { name: button, exact: true }).click()
      assert.equal(await page.getByLabel('시안 노트').inputValue(), verdict === 'continue' ? text : '')
      assert.match(await page.locator('.variant-evaluations').innerText(), new RegExp(`이 Branch의 생성 목적: ${purpose}`))
      await page.locator('.experiment-save-status[data-state="saved"]').waitFor()
      await page.locator('.rail-parent').first().click()
      assert.match(await card.innerText(), new RegExp(purpose))
    } else {
      assert.equal(await card.getByRole('button', { name: /Branch/ }).count(), 0)
      assert.match(await card.innerText(), /이 방향을 종료한 이유/)
      // Reopening the evaluation restores its appropriate action.
      await card.getByRole('button', { name: '기록 수정', exact: true }).click()
      await page.getByLabel('다음 방향', { exact: true }).selectOption('continue')
      await page.getByRole('button', { name: '기록 저장', exact: true }).click()
      assert.equal(await page.getByRole('button', { name: '이 배합에서 다음 Branch 만들기', exact: true }).count(), 2)
      await page.locator('.evaluation-card').first().getByRole('button', { name: '기록 수정', exact: true }).click()
      await page.getByLabel('다음 방향', { exact: true }).selectOption('stop')
      assert.equal(await page.getByLabel(field, { exact: true }).inputValue(), text)
      await page.getByRole('button', { name: '기록 저장', exact: true }).click()
    }
  }
  await page.locator('.experiment-save-status[data-state="saved"]').waitFor()
  await page.reload()
  await page.locator('.experiments-page-action').click()
  await page.locator('.experiment-list-item').click()
  await page.locator('.rail-parent').first().click()
  assert.equal(await page.locator('.evaluation-card').count(), 4)
  assert.equal(await page.locator('.evaluation-card[data-verdict="stop"]').getByRole('button', { name: /Branch/ }).count(), 0)
  await page.setViewportSize({ width: 1440, height: 1700 })
  const directionsScreenshot = join(tmpdir(), 'accordbook-evaluation-directions.png')
  await page.locator('.variant-evaluations').screenshot({ path: directionsScreenshot })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', checks: ['draft navigation', 'snapshot preserved on edit', 'branch from historical rows', 'source deletion protected', 'IndexedDB reload', 'Korean tablet layout', 'delete unreferenced evaluation', 'all four direction actions', 'decision reason preserved across switching', 'finished evaluation reopened'], screenshot, koreanScreenshot, directionsScreenshot }))
} catch (error) {
  if (page) {
    console.error(await page.locator('.evaluation-form').innerHTML().catch(() => 'No evaluation form'))
    await page.screenshot({ path: join(tmpdir(), 'accordbook-evaluation-failure.png') }).catch(() => {})
  }
  throw error
} finally {
  await browser.close()
}
