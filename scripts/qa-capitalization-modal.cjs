const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true, hasTouch: true });
    await page.goto(process.env.QA_ORIGIN || 'https://localhost:5176');
    await page.evaluate(async () => {
      const storage = await (await import('/src/storage/storageService.ts')).createStorage();
      const now = new Date().toISOString();
      await storage.importData({ settings: { language: 'en', formulaIdPrefix: 'ACC' }, formulas: [{ id: 'qa', formulaId: 'ACC-QA', name: 'Modal QA', date: '', notes: '', rows: [{ id: 'r', material: 'indole', parts: 1000 }], createdAt: now, updatedAt: now }], archive: [], versions: [], meta: {} });
    });
    await page.reload();
    for (const width of [1440, 1920, 820, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      if (width < 768) { await page.locator('.mobile-formula-actions').click(); await page.locator('[data-action="time-machine"]').click(); }
      else await page.locator('.tm-page-action').click();
      await page.locator('.tm-save').click();
      const save = page.locator('.tm-save-box .primary');
      await save.click();
      const dialog = page.locator('.tm-capitalization-warning');
      await dialog.waitFor();
      assert(await dialog.locator('button').first().evaluate(e => e === document.activeElement));
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
        assert(await page.evaluate(() => !!document.activeElement.closest('.tm-capitalization-warning')));
      }
      for (const selector of ['.tm-close', '.tm-save', '#tm-tab-compare', '.tm-save-box .primary']) {
        const box = await page.locator(selector).boundingBox();
        // Only click uncovered backdrop positions, not the dialog's own controls.
        const target = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, { x: box.x + 2, y: box.y + 2 });
        if (target === 'tm-capitalization-overlay') await page.mouse.click(box.x + 2, box.y + 2);
        assert(await dialog.isVisible());
        assert(await page.locator(selector).evaluate(e => !!e.closest('[inert]')));
      }
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert(await save.evaluate(e => e === document.activeElement));
      assert(await page.locator('.tm-content').evaluate(e => !e.inert));
      await save.click();
      await dialog.locator('button').first().click();
      await dialog.waitFor({ state: 'detached' });
      await save.click();
      await dialog.locator('button').last().click();
      await dialog.waitFor({ state: 'detached' });
      await page.locator('.tm-close').click();
      await page.waitForFunction(() => !document.querySelector('.time-machine-stage').classList.contains('is-open'));
      console.log('PASS', width, 'pointer blocking, inert background, Tab trap, Escape, Edit, save');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
