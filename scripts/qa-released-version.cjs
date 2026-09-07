const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.QA_ORIGIN || 'https://localhost:5177');
    const seed = () => page.evaluate(async () => {
      const storage = await (await import('/src/storage/storageService.ts')).createStorage();
      const now = '2026-09-07T00:00:00.000Z';
      const rows = [{ id: 'r', rowId: 'r', material: 'Hedione', parts: 1000 }];
      const f = { id: 'qa', formulaId: 'ACC-QA', name: 'Current', date: '2026-09-07', notes: '', rows, createdAt: now, updatedAt: now };
      const version = { versionId: 'v1', parentFormulaId: 'qa', versionNumber: 1, kind: 'manual', createdAt: now, sourceCurrentUpdatedAt: now, note: '', snapshot: { name: 'Historical', date: f.date, formulaId: f.formulaId, notes: '', rows } };
      await storage.importData({ settings: { language: 'en', formulaIdPrefix: 'ACC' }, formulas: [f], archive: [], versions: [version, { ...version, versionId: 'v2', versionNumber: 2 }, { ...version, versionId: 'rp', versionNumber: null, kind: 'restore-point' }], meta: {} });
    });
    const read = () => page.evaluate(async () => (await (await import('/src/storage/storageService.ts')).createStorage()).exportData());
    const open = async width => {
      if (width < 768) { await page.locator('.mobile-formula-actions').click(); await page.locator('[data-action="time-machine"]').click(); }
      else await page.locator('.tm-page-action').click();
      await page.locator('.tm-item.manual').first().waitFor();
    };
    const select = number => page.locator('.tm-item.manual').filter({ hasText: `v${number}` }).click();
    const action = () => page.locator('.tm-release-status > button');
    for (const [width, height] of [[1440,900],[1920,1080],[1180,820],[1024,768],[820,1180],[768,1024],[430,932],[390,844],[375,812],[360,800]]) {
      await seed(); await page.reload(); await page.setViewportSize({ width, height }); await open(width);
      const before = await read();
      await page.locator('.tm-item.restore-point').click(); assert.equal(await action().count(), 0);
      await page.locator('.tm-version-list-back').click(); await select(1);
      assert(await page.locator('.tm-release-status').evaluate(e => e.scrollWidth <= e.clientWidth + 1));
      await action().click();
      const dialog = page.locator('.tm-release-confirm'); await dialog.waitFor();
      await page.waitForFunction(() => document.activeElement === document.querySelector('.tm-release-confirm button'));
      await page.keyboard.press('Shift+Tab');
      assert(await dialog.locator('button').last().evaluate(e => e === document.activeElement));
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
      assert(await action().evaluate(e => e === document.activeElement));
      assert.deepEqual(await read(), before);
      await action().click(); await dialog.locator('button').last().click();
      await dialog.waitFor({ state: 'detached' });
      assert(await page.locator('.tm-release-status .tm-released').isVisible());
      assert(await page.locator('.tm-release-status').evaluate(e => e === document.activeElement));
      const first = await read(); assert.equal(first.formulas[0].releasedVersionId, 'v1');
      assert.equal(first.formulas[0].updatedAt, before.formulas[0].updatedAt);
      assert.deepEqual(first.versions, before.versions);
      await page.locator('.tm-version-list-back').click();
      assert.equal(await page.locator('.tm-item .tm-released').count(), 1);
      await select(2); await action().click();
      assert((await dialog.innerText()).includes('replace v1'));
      assert(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
      await dialog.locator('button').last().click(); await dialog.waitFor({ state: 'detached' });
      assert.equal((await read()).formulas[0].releasedVersionId, 'v2');
      await page.locator('.tm-composition-action').click();
      assert.deepEqual(await page.locator('.tm-composition li').allTextContents(), ['Hedione']);
      await page.locator('.tm-composition-workspace > button').click();
      await page.locator('.tm-make-batch').click();
      await page.locator('.tm-batch-workspace > button').click();
      await page.locator('#tm-tab-compare').click(); assert(await page.locator('#tm-view-compare').isVisible());
      await page.reload(); await open(width);
      assert.equal(await page.locator('.tm-item .tm-released').count(), 1);
      assert((await page.locator('.tm-item').filter({ has: page.locator('.tm-released') }).textContent()).includes('v2'));
      await select(2); assert(await page.locator('.tm-release-status .tm-released').isVisible());
      await page.locator('.tm-close').click();
      await page.waitForFunction(() => !document.querySelector('.time-machine-stage').classList.contains('is-open'));
      console.log('PASS', width, height, 'confirm/cancel, replacement, list/detail, focus, persistence, layout, Composition/Batch/Compare');
    }
    await page.evaluate(() => localStorage.setItem('accordbook.locale', 'ko'));
    await page.reload(); await open(360); await select(1);
    assert((await page.locator('.tm-release-status').innerText()).includes('RELEASE STATUS'));
    await action().click(); assert((await page.locator('.tm-release-confirm').innerText()).includes('기존 v2 대신'));
    assert.deepEqual(errors, []);
    console.log('PASS KO English labels and localized confirmation; no browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
