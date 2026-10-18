const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 4194, strictPort: false, hmr: false, open: false } });
  let browser;
  const checks = [];
  const test = async (name, run) => { await run(); checks.push(name); console.log(`PASS ${name}`); };
  try {
    await server.listen();
    const origin = `${server.config.server.https ? 'https' : 'http'}://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin);
    await page.locator('.app').waitFor();
    await page.evaluate(async () => {
      const stamp = new Date().toISOString();
      const storage = await (await import('/src/storage/storageService.ts')).createStorage();
      await storage.importData({ settings: { language: 'en', formulaIdPrefix: 'ACC' }, formulas: [{ id: 'solvent-qa-formula', formulaId: 'ACC-SOLVENT-QA', name: 'Solvent QA Formula', date: stamp.slice(0, 10), createdAt: stamp, updatedAt: stamp, notes: '', rows: [{ id: 'solvent-row', rowId: 'solvent-row', material: 'Hedione', parts: 1000 }] }], archive: [], versions: [], experiments: [], reviews: [], palette: [], meta: {} });
      localStorage.setItem('accordbook.activeFormulaId', 'solvent-qa-formula');
      localStorage.setItem('accordbook.locale', 'en');
    });
    await page.reload();
    await page.locator('.accordbook-intro').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('.formula-name')?.value === 'Solvent QA Formula');

    const persistedSolvent = async solvent => page.waitForFunction(async expected => {
      const data = await (await (await import('/src/storage/storageService.ts')).createStorage()).exportData();
      return data.formulas.find(formula => formula.id === 'solvent-qa-formula')?.rows[0]?.dilution?.solvent === expected;
    }, solvent);

    await test('Notebook DIL offers canonical suggestion and preserves custom text through reload', async () => {
      await page.locator('.row').first().locator('.dilution-btn').click();
      const input = page.locator('.dilution-panel .solvent-input');
      assert.equal(await input.inputValue(), 'ALC');
      await input.fill('Dipropylene');
      await page.getByRole('option', { name: /DPG — Dipropylene Glycol/ }).click();
      assert.equal(await input.inputValue(), 'DPG');
      await persistedSolvent('DPG');
      await input.fill('My Custom Solvent');
      assert.equal(await input.inputValue(), 'My Custom Solvent');
      await persistedSolvent('My Custom Solvent');
      await page.locator('.autosave-status.saving').waitFor();
      await page.locator('.autosave-status.saved-locally').waitFor();
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.formula-name')?.value === 'Solvent QA Formula');
      await page.waitForFunction(async () => {
        const data = await (await (await import('/src/storage/storageService.ts')).createStorage()).exportData();
        return data.formulas.find(formula => formula.id === 'solvent-qa-formula')?.rows[0]?.dilution?.solvent === 'My Custom Solvent';
      });
      assert.equal(await page.locator('.row .dilution-suffix').innerText(), '@10% in My Custom Solvent');
      assert.deepEqual(errors, []);
    });

    const trigger = () => page.locator('.export-wrap > button').filter({ hasText: /^(Import|가져오기)/ });
    const dialog = () => page.locator('.formula-paste-dialog[open]');
    await test('Import Review keeps source names, requires explicit selection and handles dialog keyboard behavior', async () => {
      await trigger().click();
      await page.locator('.export-menu').getByRole('button', { name: /^(Paste from Excel|Excel에서 붙여넣기)$/ }).click({ force: true });
      await dialog().waitFor();
      await dialog().getByLabel('Paste spreadsheet data').fill('Material\tParts\nAmbroxan @10% in Dipropylene Glycol\t1000');
      await dialog().getByRole('button', { name: 'Review', exact: true }).click();
      const reviewRow = dialog().locator('.fp-row').first();
      await reviewRow.getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      const input = reviewRow.getByLabel('Solvent', { exact: true });
      assert.equal(await input.inputValue(), 'Dipropylene Glycol');
      await input.fill('Dipropylene');
      const option = dialog().getByRole('option', { name: /DPG — Dipropylene Glycol/ });
      await option.waitFor({ state: 'visible' });
      assert.equal(await input.inputValue(), 'Dipropylene');
      await option.click();
      assert.equal(await input.inputValue(), 'DPG');

      await input.fill('Alcohol');
      await dialog().getByRole('option', { name: /ALC — Ethanol/ }).waitFor({ state: 'visible' });
      assert.equal(await input.inputValue(), 'Alcohol');
      await input.press('ArrowDown');
      assert.equal(await input.inputValue(), 'Alcohol');
      await input.press('Escape');
      assert.equal(await dialog().count(), 1);
      assert.equal(await dialog().getByRole('listbox', { name: 'Solvent suggestions' }).isVisible(), false);
      assert.equal(await input.inputValue(), 'Alcohol');

      await input.fill('Ethyl Alcohol');
      await dialog().getByRole('option', { name: /ALC — Ethanol/ }).waitFor({ state: 'visible' });
      await input.press('ArrowDown');
      assert.equal(await input.inputValue(), 'Ethyl Alcohol');
      await input.press('Enter');
      assert.equal(await input.inputValue(), 'ALC');
      await input.fill('My Custom Solvent');
      assert.equal(await dialog().getByRole('listbox', { name: 'Solvent suggestions' }).isVisible(), false);
      assert.equal(await input.inputValue(), 'My Custom Solvent');
      await dialog().getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.deepEqual(errors, []);
    });

    await test('dialog suggestion list stays within a short smartphone viewport', async () => {
      await page.setViewportSize({ width: 390, height: 420 });
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.formula-name')?.value === 'Solvent QA Formula');
      await trigger().evaluate(button => button.click());
      await page.locator('.export-menu').getByRole('button', { name: /^(Paste from Excel|Excel에서 붙여넣기)$/ }).evaluate(button => button.click());
      await dialog().waitFor();
      await dialog().getByLabel('Paste spreadsheet data').fill('Material\tParts\nAmbroxan @10%\t1000');
      await dialog().getByRole('button', { name: 'Review', exact: true }).click();
      const reviewRow = dialog().locator('.fp-row').first();
      await reviewRow.getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      const input = reviewRow.getByLabel('Solvent', { exact: true });
      await input.fill('Alcohol');
      const list = dialog().getByRole('listbox', { name: 'Solvent suggestions' });
      await dialog().getByRole('option', { name: /ALC — Ethanol/ }).waitFor({ state: 'visible' });
      const bounds = await list.boundingBox();
      assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 391 && bounds.y + bounds.height <= 421, JSON.stringify(bounds));
      await input.press('Escape');
      assert.equal(await dialog().count(), 1);
      await dialog().getByRole('button', { name: /^(Cancel|취소)$/ }).click();
      assert.deepEqual(errors, []);
    });

    console.log(`Solvent input browser checks: ${checks.length} passed. Edge headless; simulated viewport matrix only.`);
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
