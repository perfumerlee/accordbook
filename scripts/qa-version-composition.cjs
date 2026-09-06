// Run with an existing Playwright runtime and an isolated browser profile.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.QA_ORIGIN || 'https://localhost:5176');
    await page.evaluate(async () => {
      const storage = await (await import('/src/storage/storageService.ts')).createStorage();
      const now = new Date().toISOString();
      const rows = ['Hedione', 'Bergamot', 'Hedione', ' '].map((material, i) => ({ rowId: 'r' + i, material, parts: 250, cas: 'SECRET-CAS', dilution: { enabled: true, percent: 10, solvent: 'DPG' } }));
      const version = { versionId: 'v7', parentFormulaId: 'qa', versionNumber: 7, kind: 'manual', createdAt: now, note: '', sourceCurrentUpdatedAt: now, snapshot: { name: 'Historical Citrus', date: '', notes: 'SECRET-NOTES', formulaId: 'ACC-QA', rows } };
      const formula = { id: 'qa', formulaId: 'ACC-QA', name: 'Current renamed', date: '', notes: '', rows: [...rows.map(r => ({ ...r, id: r.rowId })), { id: 'extra', material: 'Iso E Super', parts: 0 }], createdAt: now, updatedAt: now };
      await storage.importData({ settings: { language: 'en', formulaIdPrefix: 'ACC' }, formulas: [formula], archive: [], versions: [version, { ...version, kind: 'restore-point', versionNumber: null, versionId: 'rp' }], meta: {} });
    });
    await page.reload();
    const data = () => page.evaluate(async () => (await (await import('/src/storage/storageService.ts')).createStorage()).exportData());
    const before = await data();
    for (const [width, height] of [[1440,900],[1920,1080],[1180,820],[1024,768],[820,1180],[768,1024],[430,932],[390,844],[375,812],[360,800]]) {
      await page.setViewportSize({ width, height });
      if (width < 768) { await page.locator('.mobile-formula-actions').click(); await page.locator('[data-action="time-machine"]').click(); }
      else await page.locator('.tm-page-action').click();
      await page.locator('.time-machine-stage.is-open').waitFor({ state: 'attached' });
      if (await page.locator('.tm-version-list-back').isVisible()) await page.locator('.tm-version-list-back').click();
      await page.locator('.tm-item.restore-point').click();
      assert.equal(await page.locator('.tm-composition-action').count(), 0);
      await page.locator('.tm-version-list-back').click();
      await page.locator('.tm-item.manual').click();
      const batch = page.locator('.tm-make-batch'), action = page.locator('.tm-composition-action');
      await action.scrollIntoViewIfNeeded();
      const a = await action.boundingBox(), b = await batch.boundingBox();
      assert(Math.abs(a.y - b.y) < 2 && a.x > b.x, 'Composition right of Batch');
      assert(await page.locator('.tm-version-actions-grid').evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'action overflow');
      await action.click();
      await page.waitForFunction(() => document.activeElement?.closest('.tm-composition-workspace') !== null);
      const view = page.locator('.tm-composition-workspace');
      assert.deepEqual(await view.locator('li').allTextContents(), ['Bergamot', 'Hedione']);
      const text = await view.innerText();
      assert(text.includes('Historical Citrus') && text.includes('v7 · 2 Materials') && text.includes('Proportions hidden'));
      for (const secret of ['Current renamed', 'Iso E Super', 'SECRET', '250', 'DPG', 'ACC-QA']) assert(!text.includes(secret));
      assert(await view.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'composition overflow');
      await view.locator('button').click();
      await page.waitForFunction(() => document.activeElement?.classList.contains('tm-composition-action'));
      await batch.click();
      await page.waitForFunction(() => document.activeElement?.closest('.tm-batch-workspace') !== null);
      await page.locator('.tm-batch-workspace > button').click();
      await page.waitForFunction(() => document.activeElement?.classList.contains('tm-make-batch'));
      await page.locator('.tm-version-actions-grid > button').first().click();
      assert(await page.locator('.tm-restore-confirm').isVisible());
      await page.locator('.tm-restore-confirm button').first().focus();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.tm-restore-confirm').count(), 0);
      await page.locator('#tm-tab-compare').click();
      assert(await page.locator('#tm-view-compare').isVisible());
      await page.locator('#tm-tab-version').click();
      await action.click();
      await page.waitForFunction(() => document.activeElement?.closest('.tm-composition-workspace') !== null);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.time-machine-stage')?.classList.contains('is-open'));
      console.log('PASS', width, height, 'eligibility, layout, historical data, focus/Back, Batch, Compare, restore confirmation, Escape');
    }
    assert.deepEqual(await data(), before, 'read-only storage snapshot');
    assert.deepEqual(errors, []);
    console.log('PASS storage unchanged; no browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
