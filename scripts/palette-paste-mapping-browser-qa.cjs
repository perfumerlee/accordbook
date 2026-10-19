const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 4197, strictPort: false, hmr: false } });
  let browser;
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await page.goto(origin);
      await page.waitForFunction(() => !!document.querySelector('.app'));
      await page.evaluate(async () => {
        const storage = await (await import('/src/storage/storageService.ts')).createStorage();
        const date = new Date().toISOString();
        await storage.importData({ settings: { language: 'en', formulaIdPrefix: 'ACC' }, formulas: [{ id: 'paste-test', formulaId: 'ACC-TEST-001', name: 'Keep this formula', date, createdAt: date, updatedAt: date, notes: '', rows: [{ id: 'r1', material: 'Hedione', parts: 1000 }] }], archive: [], versions: [], experiments: [], reviews: [], palette: [], meta: {} });
        localStorage.setItem('accordbook.active-formula', 'paste-test'); localStorage.setItem('accordbook.locale', 'en');
      });
      await page.reload();
      await page.locator('.accordbook-intro').waitFor({ state: 'hidden' });
      if (await page.locator('.first-start-modal').count()) await page.keyboard.press('Escape');
      const list = () => page.evaluate(async () => { const storage = await (await import('/src/storage/storageService.ts')).createStorage(); return storage.palette.list(); });
      const formulas = () => page.evaluate(async () => { const storage = await (await import('/src/storage/storageService.ts')).createStorage(); return storage.formulas.list(); });
      const beforeFormula = await formulas();
      const openPalette = async () => {
        if (width < 1200) await page.getByRole('button', { name: 'Open notebook', exact: true }).click();
        await page.getByRole('button', { name: 'Data Tools', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Material Palette', exact: true }).click();
      };
      await openPalette();
      const openPaste = async text => {
        await page.getByRole('button', { name: 'Paste from Excel', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Paste from Excel', exact: true });
        await dialog.getByRole('textbox', { name: 'Spreadsheet data', exact: true }).fill(text);
        return dialog;
      };
      let dialog = await openPaste('원료명\tCAS Number\nBergamot\t8007-75-8\nBenzoin Resinoid @50% in DPG\t9000-72-0\nCoumarin @10%\t91-64-5');
      assert.equal(await dialog.getByLabel('Map column 1', { exact: true }).inputValue(), 'materialName');
      assert.equal(await dialog.getByLabel('Map column 2', { exact: true }).inputValue(), 'cas');
      assert(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1));
      await dialog.getByRole('button', { name: 'Review pasted rows', exact: true }).click();
      const review = () => page.getByRole('dialog', { name: 'Palette import review', exact: true });
      const apply = () => review().getByRole('button', { name: 'Apply new materials', exact: true });
      assert(await apply().isDisabled()); assert.equal((await list()).length, 0);
      await review().locator('.palette-paste-review-row').filter({ hasText: 'Benzoin Resinoid' }).getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      const coumarin = review().locator('.palette-paste-review-row').filter({ hasText: 'Coumarin' });
      await coumarin.getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      assert(await apply().isDisabled());
      await coumarin.getByRole('button', { name: 'Keep Original', exact: true }).click();
      assert(await apply().isEnabled());
      assert(await review().evaluate(element => element.scrollWidth <= element.clientWidth + 1));
      fs.mkdirSync('.temp', { recursive: true });
      await page.screenshot({ path: `.temp/palette-paste-mapping-${width}.png` });
      await apply().click(); await review().waitFor({ state: 'hidden' });
      let saved = await list();
      assert.equal(saved.length, 3);
      assert.deepEqual(saved.find(row => row.materialName === 'Benzoin Resinoid').dilution, { percent: 50, solvent: 'DPG' });
      assert.equal(saved.find(row => row.materialName === 'Coumarin @10%').dilution, undefined);
      assert.equal(saved.find(row => row.materialName === 'Bergamot').cas, '8007-75-8');
      dialog = await openPaste('Manual material\t123-45-6\t999');
      assert.equal(await dialog.getByRole('checkbox').isChecked(), false);
      await dialog.getByLabel('Map column 1', { exact: true }).selectOption('materialName');
      await dialog.getByLabel('Map column 2', { exact: true }).selectOption('cas');
      assert(await dialog.getByRole('button', { name: 'Review pasted rows', exact: true }).isDisabled());
      await dialog.getByLabel('Map column 3', { exact: true }).selectOption('ignore');
      await dialog.getByRole('button', { name: 'Review pasted rows', exact: true }).click();
      await apply().click(); await review().waitFor({ state: 'hidden' });
      dialog = await openPaste('Material Name\tDilution %\tSolvent\nConflicting material @10% in ALC\t20\tDPG');
      await dialog.getByRole('button', { name: 'Review pasted rows', exact: true }).click();
      assert((await review().innerText()).includes('different dilution values'));
      await review().getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      await apply().click(); await review().waitFor({ state: 'hidden' });
      dialog = await openPaste('원료명\tCAS Number\nBergamot\t8007-75-8');
      await dialog.getByRole('button', { name: 'Review pasted rows', exact: true }).click();
      assert(await apply().isDisabled());
      assert((await review().innerText()).includes('Duplicate — skipped'));
      await review().getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.deepEqual(await formulas(), beforeFormula);
      await page.reload(); await page.locator('.accordbook-intro').waitFor({ state: 'hidden' });
      saved = await list(); assert.equal(saved.length, 5);
      assert.deepEqual(saved.find(row => row.materialName === 'Conflicting material').dilution, { percent: 10, solvent: 'ALC' });
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}: aliases, manual mapping, dilution approval/conflict, duplicates, reload, Formula preservation`);
      await context.close();
    }
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
