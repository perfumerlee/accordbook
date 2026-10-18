const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

// Isolated browser profile and local fixtures. Never connects to a user's browser or production.
(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 4193, strictPort: false, hmr: false, open: false } });
  let browser;
  const results = [];
  const test = async (name, run) => { await run(); results.push(name); console.log(`PASS ${name}`); };
  try {
    await server.listen();
    const origin = `${server.config.server.https ? 'https' : 'http'}://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin);
    await page.locator('.app').waitFor();
    await page.evaluate(async () => {
      const storage = await (await import('/src/storage/storageService.ts')).createStorage();
      const stamp = new Date().toISOString();
      await storage.importData({ settings: { language: 'en', formulaIdPrefix: 'ACC' }, formulas: [{ id: 'paste-qa-current', formulaId: 'ACC-QA-001', name: 'Existing Formula', date: stamp.slice(0, 10), createdAt: stamp, updatedAt: stamp, notes: 'Keep this note', rows: [{ id: 'r1', rowId: 'r1', material: 'Hedione', parts: 1000 }] }], archive: [], versions: [], experiments: [], reviews: [], palette: [], meta: {} });
      localStorage.setItem('accordbook.activeFormulaId', 'paste-qa-current');
      localStorage.setItem('accordbook.locale', 'en');
    });
    await page.reload();
    await page.locator('.accordbook-intro').waitFor({ state: 'hidden' });
    if (await page.locator('.first-start-modal').count()) await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.formula-name')?.value === 'Existing Formula');
    // Allow the existing notebook's hydration effects to settle before watching writes.
    await page.waitForTimeout(600);
    const snapshot = () => page.evaluate(async () => (await (await (await import('/src/storage/storageService.ts')).createStorage()).exportData()));
    const before = await snapshot();
    await page.evaluate(() => {
      window.__pasteWrites = [];
      for (const method of ['put', 'add', 'delete', 'clear']) {
        const original = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function (...args) { window.__pasteWrites.push(`idb:${this.name}:${method}`); return original.apply(this, args); };
      }
      for (const method of ['setItem', 'removeItem', 'clear']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (...args) { window.__pasteWrites.push(`storage:${method}`); return original.apply(this, args); };
      }
    });
    const trigger = () => page.locator('.export-wrap > button').filter({ hasText: /^(Import|가져오기)/ });
    const menu = () => trigger().locator('..').locator('.export-menu');
    const dialog = () => page.locator('.formula-paste-dialog[open]');
    const source = () => dialog().locator('.fp-source');
    const open = async () => { await trigger().click(); await menu().getByRole('button', { name: /^(Paste from Excel|Excel에서 붙여넣기)$/ }).click(); await dialog().waitFor(); };
    const review = () => dialog().getByRole('button', { name: 'Review', exact: true });
    const row = n => dialog().locator('.fp-row').nth(n);
    const cancel = () => dialog().getByRole('button', { name: /^(Cancel|취소)$/ }).click();

    await test('existing Formula and backup import still open their file choosers', async () => {
      await trigger().click();
      const buttons = menu().locator('button');
      assert.equal(await buttons.count(), 3);
      for (const index of [1, 2]) {
        if (!await menu().count()) await trigger().click();
        console.log(`Checking import option ${index}: ${await buttons.nth(index).innerText()}`);
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), buttons.nth(index).click()]);
        assert.equal(chooser.isMultiple(), false);
      }
      if (await menu().count()) await page.keyboard.press('Escape');
    });
    await test('Import entry opens a modal and closes its menu', async () => {
      await open();
      assert.equal(await menu().count(), 0);
      assert(await dialog().evaluate(element => element.matches(':modal')));
      assert(await dialog().locator('h2').evaluate(element => element === document.activeElement));
      assert.equal(await dialog().getByRole('button', { name: /Create Formula/ }).count(), 0);
    });
    await test('malformed paste reports an error and cannot proceed', async () => {
      await source().fill('"broken\t100');
      assert.match(await dialog().innerText(), /quoted cell is malformed/);
      assert.equal(await review().isDisabled(), true);
    });
    const original = 'Material\tParts\n\tbad\nHedione\t700';
    await test('headers map automatically and invalid cells can proceed to Review', async () => {
      await source().fill(original);
      assert.match(await dialog().innerText(), /Header detected/);
      assert.equal(await dialog().getByLabel('Material Column', { exact: true }).inputValue(), '0');
      await review().click();
      assert.equal(await dialog().locator('.fp-row').count(), 2);
      assert.match(await row(0).innerText(), /Source Row 2/);
      assert.match(await dialog().innerText(), /Valid rows subtotal: 700 parts/);
    });
    await test('inline corrections revalidate names, integer Parts and totals', async () => {
      await row(0).getByLabel('Material', { exact: true }).fill('DPG');
      await row(0).getByLabel('Parts', { exact: true }).fill('300');
      assert.match(await dialog().innerText(), /Total Parts: 1,000 \/ 1,000 parts/);
      assert.equal(await row(0).locator('[aria-invalid=true]').count(), 0);
      await row(0).getByLabel('Parts', { exact: true }).fill('1.5');
      assert.match(await row(0).innerText(), /Parts must be an integer/);
      assert.match(await dialog().innerText(), /Valid rows subtotal: 700 parts/);
      await row(0).getByLabel('Parts', { exact: true }).fill('0');
      assert.match(await dialog().innerText(), /Row checks complete/);
      assert.match(await dialog().innerText(), /Incomplete Formula/);
    });
    await test('duplicate warnings update without merging rows', async () => {
      await row(0).getByLabel('Material', { exact: true }).fill('HEDIONE');
      assert.match(await row(1).innerText(), /Duplicate material/);
      assert.equal(await dialog().locator('.fp-row').count(), 2);
      await row(0).getByLabel('Material', { exact: true }).fill('DPG');
      assert.doesNotMatch(await row(1).innerText(), /Duplicate material/);
    });
    await test('paste, mapping and review perform no persistence calls', async () => {
      assert.deepEqual(await page.evaluate(() => window.__pasteWrites), []);
      assert.deepEqual(await snapshot(), before);
    });
    await test('language switching preserves edited values and the Formula name', async () => {
      await dialog().getByLabel('Formula Name', { exact: true }).fill('Review name');
      await dialog().getByRole('button', { name: 'Cancel', exact: true }).focus();
      await page.keyboard.press('Control+Alt+l');
      await dialog().getByRole('heading', { name: '가져오기 검토', exact: true }).waitFor();
      assert.equal(await dialog().getByLabel('포뮬러 이름', { exact: true }).inputValue(), 'Review name');
      assert.equal(await row(0).getByLabel('원료명', { exact: true }).inputValue(), 'DPG');
      assert.equal(await row(0).getByLabel('배합량', { exact: true }).inputValue(), '0');
      await dialog().getByRole('button', { name: '취소', exact: true }).focus();
      await page.keyboard.press('Control+Alt+l');
      await dialog().getByRole('heading', { name: 'Import Review', exact: true }).waitFor();
      // The existing app-wide language shortcut persists language. Exclude only those calls.
      await page.waitForTimeout(300);
      await page.evaluate(() => { window.__pasteWrites = []; });
    });
    await test('Back preserves source and edits; changing source clears stale mapping and edits', async () => {
      await dialog().getByRole('button', { name: 'Back to Paste', exact: true }).click();
      assert.equal(await source().inputValue(), original);
      await review().click();
      assert.equal(await row(0).getByLabel('Parts', { exact: true }).inputValue(), '0');
      await dialog().getByRole('button', { name: 'Back to Paste', exact: true }).click();
      await source().fill('120\tBergamot\tnote\n880\tHedione\tnote');
      assert.equal(await dialog().getByLabel('Material Column', { exact: true }).inputValue(), '-1');
    });
    await test('manual reversed mapping requires explicit handling of extra columns', async () => {
      await dialog().getByLabel('Material Column', { exact: true }).selectOption('1');
      await dialog().getByLabel('Parts Column', { exact: true }).locator('option[value="1"]:disabled').waitFor({ state: 'attached' });
      assert.equal(await dialog().getByLabel('Parts Column', { exact: true }).locator('option[value="1"]').evaluate(option => option.disabled), true);
      await dialog().getByLabel('Parts Column', { exact: true }).selectOption('0');
      assert.equal(await review().isDisabled(), true);
      await dialog().getByRole('checkbox', { name: /Ignore Column 3/ }).check();
      await review().click();
      assert.equal(await row(0).getByLabel('Material', { exact: true }).inputValue(), 'Bergamot');
      assert.equal(await row(0).getByLabel('Parts', { exact: true }).inputValue(), '120');
    });
    await test('dilution proposal is explicit, editable, localized, and never silently persisted in DIL-2', async () => {
      await dialog().getByRole('button', { name: 'Back to Paste', exact: true }).click();
      await source().fill('Material\tParts\nAmbroxan 10%\t300\nAmbroxan 10% in DPG\t300\nHedione\t400');
      await review().click();
      const firstDilution = row(0);
      const secondDilution = row(1);
      assert.match(await firstDilution.innerText(), /10% dilution detected/);
      assert.match(await firstDilution.innerText(), /Original material: Ambroxan 10%/);
      assert.match(await firstDilution.innerText(), /Suggested material: Ambroxan/);
      assert.equal(await firstDilution.getByLabel('Dilution (%)', { exact: true }).count(), 0);
      assert.equal(await dialog().getByRole('button', { name: 'Create Formula', exact: true }).isDisabled(), false);
      await secondDilution.getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      assert.equal(await secondDilution.getByLabel('Solvent', { exact: true }).inputValue(), 'DPG');
      await secondDilution.getByRole('button', { name: 'Keep Original Material Name', exact: true }).click();

      await firstDilution.getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      await page.waitForFunction(() => document.activeElement?.matches('.fp-dilution-fields input:not([type="number"])'));
      assert.equal(await firstDilution.getByLabel('Suggested material', { exact: true }).evaluate(element => element === document.activeElement), true);
      assert.equal(await firstDilution.getByLabel('Solvent', { exact: true }).inputValue(), '');
      assert.match(await firstDilution.getByRole('alert').innerText(), /Enter or confirm a solvent/);
      assert.equal(await dialog().getByRole('button', { name: 'Create Formula', exact: true }).isDisabled(), true);

      await firstDilution.getByLabel('Solvent', { exact: true }).fill('DPG');
      await firstDilution.getByLabel('Dilution (%)', { exact: true }).fill('101');
      assert.match(await firstDilution.getByRole('alert').innerText(), /percentage from 0 to 100/);
      await firstDilution.getByLabel('Dilution (%)', { exact: true }).fill('10.5');
      await secondDilution.getByRole('button', { name: 'Keep Original Material Name', exact: true }).click();
      assert.equal(await dialog().getByRole('button', { name: 'Create Formula', exact: true }).isDisabled(), false);
      await row(2).getByLabel('Parts', { exact: true }).fill('399');
      await row(2).getByLabel('Parts', { exact: true }).fill('400');
      assert.equal(await firstDilution.getByLabel('Dilution (%)', { exact: true }).inputValue(), '10.5');
      assert.equal(await secondDilution.getByRole('button', { name: 'Keep Original Material Name', exact: true }).getAttribute('aria-pressed'), 'true');

      await dialog().getByRole('button', { name: 'Cancel', exact: true }).focus();
      await page.keyboard.press('Control+Alt+l');
      await dialog().getByRole('heading', { name: '가져오기 검토', exact: true }).waitFor();
      assert.equal(await firstDilution.getByLabel('용매', { exact: true }).inputValue(), 'DPG');
      assert.equal(await firstDilution.getByLabel('희석률 (%)', { exact: true }).inputValue(), '10.5');
      assert.equal(await secondDilution.getByRole('button', { name: '원본 원료명 유지', exact: true }).getAttribute('aria-pressed'), 'true');
      await dialog().getByRole('button', { name: '취소', exact: true }).focus();
      await page.keyboard.press('Control+Alt+l');
      await dialog().getByRole('heading', { name: 'Import Review', exact: true }).waitFor();
      await page.waitForTimeout(300);
      await page.evaluate(() => { window.__pasteWrites = []; });

      await dialog().getByRole('button', { name: 'Back to Paste', exact: true }).click();
      await review().click();
      assert.equal(await firstDilution.getByLabel('Dilution (%)', { exact: true }).inputValue(), '10.5');
      await firstDilution.getByLabel('Material', { exact: true }).fill('Ambroxan Special 10%');
      assert.equal(await firstDilution.getByRole('button', { name: 'Apply Dilution', exact: true }).getAttribute('aria-pressed'), 'false');
      assert.equal(await firstDilution.getByLabel('Dilution (%)', { exact: true }).count(), 0);
      await firstDilution.getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      await firstDilution.getByLabel('Solvent', { exact: true }).fill('DPG');
      await firstDilution.getByRole('button', { name: 'Keep Original Material Name', exact: true }).click();
      assert.equal(await dialog().getByRole('button', { name: 'Create Formula', exact: true }).isDisabled(), false);
      assert.match(await firstDilution.innerText(), /The original material name will be kept/);

      await dialog().getByRole('button', { name: 'Back to Paste', exact: true }).click();
      await dialog().getByLabel('Material Column', { exact: true }).selectOption('-1');
      await dialog().getByLabel('Parts Column', { exact: true }).selectOption('0');
      await dialog().getByLabel('Material Column', { exact: true }).selectOption('1');
      await dialog().getByLabel('Material Column', { exact: true }).selectOption('-1');
      await dialog().getByLabel('Parts Column', { exact: true }).selectOption('1');
      await dialog().getByLabel('Material Column', { exact: true }).selectOption('0');
      await review().click();
      assert.equal(await row(0).getByLabel('Dilution (%)', { exact: true }).count(), 0);
      assert.equal(await row(0).getByRole('button', { name: 'Apply Dilution', exact: true }).getAttribute('aria-pressed'), 'false');
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual(await page.evaluate(() => window.__pasteWrites), []);
      await cancel();
      await open();
      await source().fill('Material\tParts\nAmbroxan 10%\t1000');
      await review().click();
      assert.equal(await row(0).getByRole('button', { name: 'Apply Dilution', exact: true }).getAttribute('aria-pressed'), 'false');
      await row(0).getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      assert.equal(await dialog().getByRole('button', { name: 'Create Formula', exact: true }).isDisabled(), true);
    });
    await test('Cancel clears state, returns focus, and reopening starts clean', async () => {
      await cancel();
      assert.equal(await page.locator('.formula-paste-dialog').count(), 0);
      assert(await trigger().evaluate(element => element === document.activeElement));
      await open();
      assert.equal(await source().inputValue(), '');
      assert.equal(await review().isDisabled(), true);
    });
    await test('Tab stays in the modal, background cannot receive focus, and Escape closes', async () => {
      await source().focus();
      await page.keyboard.press('Tab');
      assert(await dialog().getByRole('button', { name: 'Cancel', exact: true }).evaluate(element => element === document.activeElement));
      await page.keyboard.press('Shift+Tab');
      assert(await source().evaluate(element => element === document.activeElement));
      await page.locator('.formula-name').evaluate(element => element.focus());
      assert(await dialog().evaluate(element => element.contains(document.activeElement)));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.formula-paste-dialog').count(), 0);
      assert(await trigger().evaluate(element => element === document.activeElement));
    });
    await test('Import outside-click behavior remains intact', async () => {
      await trigger().click();
      await page.locator('.formula-name').click();
      assert.equal(await menu().count(), 0);
    });
    await open();
    const large = 'Material\tParts\n' + Array.from({ length: 200 }, (_, index) => `Long material name ${index} ${'Bergamot '.repeat(12)}\t5`).join('\n');
    await source().fill(large);
    await review().click();
    await test('200 rows render and remain editable with preserved source order', async () => {
      assert.equal(await dialog().locator('.fp-row').count(), 200);
      const last = row(199).getByLabel('Parts', { exact: true });
      await last.fill('6');
      assert.match(await dialog().innerText(), /Total Parts: 1,001/);
      await last.fill('5');
    });
    fs.mkdirSync('.temp', { recursive: true });
    const matrix = [[1440,900],[1920,1080],[1180,820],[1024,768],[820,1180],[768,1024],[430,932],[390,844],[375,812],[360,800],[1199,900],[1200,900],[767,900],[768,900]];
    for (const [width, height] of matrix) {
      await test(`viewport ${width}x${height}: bounds, overflow and action access`, async () => {
        await page.setViewportSize({ width, height });
        await dialog().locator('.fp-body').evaluate(element => { element.scrollTop = 0; });
        const metrics = await dialog().evaluate(element => {
          const rect = element.getBoundingClientRect();
          const body = element.querySelector('.fp-body');
          const footer = element.querySelector('.fp-footer').getBoundingClientRect();
          return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, overflow: element.scrollWidth - element.clientWidth, bodyOverflow: body.scrollWidth - body.clientWidth, footerBottom: footer.bottom };
        });
        assert(metrics.x >= 0 && metrics.y >= 0 && metrics.right <= width + 1 && metrics.bottom <= height + 1);
        assert(metrics.overflow <= 1 && metrics.bodyOverflow <= 1, JSON.stringify(metrics));
        assert(metrics.footerBottom <= height + 1);
        const input = row(0).getByLabel('Parts', { exact: true });
        await input.fill('5');
        assert(await dialog().getByRole('button', { name: 'Cancel', exact: true }).isVisible());
        if (width === 1440 || width === 390) await page.screenshot({ path: `.temp/formula-paste-${width}.png` });
      });
    }
    await test('short mobile viewport keeps review body scrollable and navigation accessible', async () => {
      await page.setViewportSize({ width: 390, height: 420 });
      assert((await dialog().locator('.fp-body').boundingBox()).height > 40);
      await row(199).getByLabel('Material', { exact: true }).fill('Edited last row');
      await dialog().getByRole('button', { name: 'Back to Paste', exact: true }).click();
      assert.equal(await source().inputValue(), large);
      await cancel();
    });
    await test('mobile drawer opens Paste, mapping fits, and Escape returns to Import', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Open notebook', exact: true }).click();
      await open();
      await source().fill('Material\tParts\tNotes\nHedione\t1000\tSample');
      await dialog().getByRole('checkbox', { name: /Ignore Column 3/ }).check();
      assert(await dialog().evaluate(element => element.scrollWidth <= element.clientWidth + 1));
      await page.screenshot({ path: '.temp/formula-paste-mapping-390.png' });
      await review().click();
      await row(0).getByLabel('Material', { exact: true }).fill('Mobile material');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.formula-paste-dialog').count(), 0);
      assert(await trigger().evaluate(element => element === document.activeElement));
      await open();
      assert.equal(await source().inputValue(), '');
      await cancel();
    });
    await open();
    await source().fill('Material\tParts\nAmbroxan 10% DPG\t500\nHedione\t500');
    await review().click();
    await test('ambiguous notation stays unchanged and does not create dilution controls', async () => {
      assert.match(await row(0).innerText(), /percentage notation is ambiguous/i);
      assert.equal(await row(0).getByRole('button', { name: 'Apply Dilution', exact: true }).count(), 0);
      assert.equal(await row(0).getByLabel('Material', { exact: true }).inputValue(), 'Ambroxan 10% DPG');
      assert.equal(await dialog().getByRole('button', { name: 'Create Formula', exact: true }).isDisabled(), false);
      await cancel();
    });
    await open();
    await source().fill('Material\tParts\nAmbroxan 10% in DPG\t600\nHedione\t400');
    await review().click();
    await row(0).getByRole('button', { name: 'Apply Dilution', exact: true }).click();
    const proposalViewports = [[1440,900],[1920,1080],[1180,820],[1024,768],[820,1180],[768,1024],[430,932],[390,844],[375,812],[360,800],[1199,900],[1200,900],[767,900],[768,900]];
    for (const [width, height] of proposalViewports) {
      await test(`dilution controls ${width}x${height}: fit and stay reachable`, async () => {
        await page.setViewportSize({ width, height });
        const metrics = await dialog().evaluate(element => {
          const rect = element.getBoundingClientRect();
          const body = element.querySelector('.fp-body');
          const panel = element.querySelector('.fp-dilution').getBoundingClientRect();
          const fields = element.querySelector('.fp-dilution-fields');
          return { x: rect.x, right: rect.right, overflow: element.scrollWidth - element.clientWidth, bodyOverflow: body.scrollWidth - body.clientWidth, panelRight: panel.right, width: fields.getBoundingClientRect().width };
        });
        assert(metrics.x >= 0 && metrics.right <= width + 1 && metrics.overflow <= 1 && metrics.bodyOverflow <= 1, JSON.stringify(metrics));
        assert(metrics.panelRight <= width + 1, JSON.stringify(metrics));
        assert.equal(await row(0).getByLabel('Dilution (%)').getAttribute('inputmode'), 'decimal');
        assert.equal(await row(0).getByLabel('Dilution (%)').inputValue(), '10');
      });
    }
    await dialog().getByRole('button', { name: 'Cancel', exact: true }).click();
    await test('existing Formula and all associated records are unchanged; no review writes', async () => {
      assert.deepEqual(await page.evaluate(() => window.__pasteWrites), []);
      assert.deepEqual(await snapshot(), before);
      assert.equal(await page.locator('.formula-name').inputValue(), 'Existing Formula');
      assert.deepEqual(errors, []);
    });
    await test('failed atomic save keeps review data and a retry creates one active Formula', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open();
      await source().fill('Material\tParts\nAmbroxan 10% in DPG\t400\nHedione\t600');
      await review().click();
      await row(0).getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      await dialog().getByLabel('Formula Name', { exact: true }).fill('Paste QA Import');
      await page.waitForFunction(() => document.querySelector('.fp-name')?.value === 'Paste QA Import');
      assert.equal(await dialog().getByLabel('Formula Name', { exact: true }).inputValue(), 'Paste QA Import');
      await page.evaluate(() => {
        window.__pastePreviousAdd = IDBObjectStore.prototype.add;
        window.__failPasteAdd = true;
        IDBObjectStore.prototype.add = function (...args) {
          if (this.name === 'formulas' && window.__failPasteAdd) {
            window.__failPasteAdd = false;
            throw new DOMException('Injected persistence failure', 'QuotaExceededError');
          }
          return window.__pastePreviousAdd.apply(this, args);
        };
      });
      const create = dialog().getByRole('button', { name: 'Create Formula', exact: true });
      await create.click();
      await dialog().getByRole('alert').filter({ hasText: 'Unable to create Formula' }).waitFor();
      assert.equal(await dialog().count(), 1);
      assert.equal(await dialog().getByLabel('Formula Name', { exact: true }).inputValue(), 'Paste QA Import');
      assert.equal(await row(0).getByLabel('Parts', { exact: true }).inputValue(), '400');
      assert.equal(await row(0).getByLabel('Dilution (%)', { exact: true }).inputValue(), '10');
      assert.equal(await row(0).getByLabel('Solvent', { exact: true }).inputValue(), 'DPG');
      assert.deepEqual(await snapshot(), before);
      await page.evaluate(() => { IDBObjectStore.prototype.add = window.__pastePreviousAdd; });
      await create.evaluate(element => {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.locator('.formula-paste-dialog').waitFor({ state: 'detached' });
      await page.waitForFunction(() => document.querySelector('.formula-name')?.value === 'Paste QA Import');
      const after = await snapshot();
      const imported = after.formulas.find(formula => formula.name === 'Paste QA Import');
      assert(imported);
      assert.deepEqual(imported.rows.map(item => [item.material, item.parts, item.dilution]), [['Ambroxan', 400, { enabled: true, percent: 10, solvent: 'DPG' }], ['Hedione', 600, undefined]]);
      assert.equal(after.formulas.filter(formula => formula.name === 'Paste QA Import').length, 1);
      assert(after.formulas.some(formula => formula.id === 'paste-qa-current' && formula.name === 'Existing Formula'));
      assert.deepEqual(after.versions, before.versions);
      assert.deepEqual(after.experiments, before.experiments);
      const writes = await page.evaluate(() => window.__pasteWrites);
      assert.equal(writes.filter(write => write === 'idb:formulas:add').length, 1);
      assert.equal(writes.filter(write => write === 'idb:meta:put').length, 1);
      assert.equal(writes.some(write => /idb:(versions|experiments|reviews):/.test(write)), false);
      await page.waitForFunction(() => document.activeElement?.matches('input.material'));
    });
    await test('approved dilution displays after reload with original Parts and calculator semantics', async () => {
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.formula-name')?.value === 'Paste QA Import');
      const firstRow = page.locator('.row').first();
      assert.equal(await firstRow.locator('input.material').inputValue(), 'Ambroxan');
      assert.equal(await firstRow.locator('input.parts').inputValue(), '400');
      assert.equal(await firstRow.locator('.dilution-suffix').innerText(), '@10% in DPG');
      const calculations = await page.evaluate(async () => {
        const { calculateDilution } = await import('/src/services/dilutionCalculator.ts');
        const { calculateFormulaTotals } = await import('/src/services/formulaCalculator.ts');
        const formula = (await (await import('/src/storage/storageService.ts')).createStorage()).formulas.list().then(items => items.find(item => item.name === 'Paste QA Import'));
        const saved = await formula;
        return { parts: saved.rows[0].parts, dilution: calculateDilution(saved.rows[0]), totals: calculateFormulaTotals(saved.rows) };
      });
      assert.equal(calculations.parts, 400);
      assert.equal(calculations.dilution.activeParts, 40);
      assert.equal(calculations.dilution.solventParts, 360);
      assert.equal(calculations.totals.totalParts, 1000);
      assert.equal(calculations.totals.batchWeightGrams, 10);
      assert.deepEqual(errors, []);
    });
    await test('explicitly chosen solvent is required and then persists for a solvent-free proposal', async () => {
      await open();
      await source().fill('Material\tParts\nCoumarin @1%\t20\nHedione\t980');
      await review().click();
      await row(0).getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      assert.match(await row(0).getByRole('alert').innerText(), /Enter or confirm a solvent/);
      assert.equal(await dialog().getByRole('button', { name: 'Create Formula', exact: true }).isDisabled(), true);
      await row(0).getByLabel('Solvent', { exact: true }).fill('ALC');
      assert.equal(await dialog().getByRole('button', { name: 'Create Formula', exact: true }).isDisabled(), false);
      await dialog().getByLabel('Formula Name', { exact: true }).fill('Explicit Solvent QA');
      await dialog().getByRole('button', { name: 'Create Formula', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.formula-name')?.value === 'Explicit Solvent QA');
      const imported = (await snapshot()).formulas.find(formula => formula.name === 'Explicit Solvent QA');
      assert.equal(imported.rows[0].material, 'Coumarin');
      assert.deepEqual(imported.rows[0].dilution, { enabled: true, percent: 1, solvent: 'ALC' });
      assert.equal(imported.rows[0].parts, 20);
    });
    await test('Apply @10% in ALC saves Coumarin with 3 Parts and survives reload', async () => {
      await open();
      await source().fill('Material\tParts\nCoumarin @10% in ALC\t3');
      await review().click();
      const dilution = row(0);
      assert.match(await dilution.innerText(), /10% dilution detected/);
      assert.match(await dilution.innerText(), /Suggested material: Coumarin/);
      assert.equal(await dilution.getByLabel('Solvent', { exact: true }).count(), 0);
      await dilution.getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      assert.equal(await dilution.getByLabel('Suggested material', { exact: true }).inputValue(), 'Coumarin');
      assert.equal(await dilution.getByLabel('Dilution (%)', { exact: true }).inputValue(), '10');
      assert.equal(await dilution.getByLabel('Solvent', { exact: true }).inputValue(), 'ALC');
      await dialog().getByLabel('Formula Name', { exact: true }).fill('At Notation QA');
      await dialog().getByRole('button', { name: 'Create Formula', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.formula-name')?.value === 'At Notation QA');
      const imported = (await snapshot()).formulas.find(formula => formula.name === 'At Notation QA');
      assert.deepEqual(imported.rows.map(item => [item.material, item.parts, item.dilution]), [
        ['Coumarin', 3, { enabled: true, percent: 10, solvent: 'ALC' }],
      ]);
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.formula-name')?.value === 'At Notation QA');
      const firstRow = page.locator('.row').first();
      assert.equal(await firstRow.locator('input.material').inputValue(), 'Coumarin');
      assert.equal(await firstRow.locator('input.parts').inputValue(), '3');
      assert.equal(await firstRow.locator('.dilution-suffix').innerText(), '@10% in ALC');
    });
    await test('Keep Original creates a row without dilution metadata', async () => {
      await open();
      await source().fill('Material\tParts\nCoumarin (@10% in ALC)\t3');
      await review().click();
      await row(0).getByRole('button', { name: 'Keep Original Material Name', exact: true }).click();
      await dialog().getByLabel('Formula Name', { exact: true }).fill('Keep Original QA');
      await dialog().getByRole('button', { name: 'Create Formula', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.formula-name')?.value === 'Keep Original QA');
      const imported = (await snapshot()).formulas.find(formula => formula.name === 'Keep Original QA');
      assert.equal(imported.rows[0].material, 'Coumarin (@10% in ALC)');
      assert.equal(imported.rows[0].parts, 3);
      assert.equal(imported.rows[0].dilution, undefined);
    });
    await test('Import solvent suggestions require explicit selection and preserve keyboard, language and Escape behavior', async () => {
      await open();
      await source().fill('Material\tParts\nAmbroxan @10% in Dipropylene Glycol\t1000');
      await review().click();
      const dilution = row(0);
      await dilution.getByRole('button', { name: 'Apply Dilution', exact: true }).click();
      const solvent = dilution.getByLabel('Solvent', { exact: true });
      assert.equal(await solvent.inputValue(), 'Dipropylene Glycol');
      await solvent.fill('Dipropylene');
      const suggestions = dialog().getByRole('listbox', { name: 'Solvent suggestions' });
      const dpg = dialog().getByRole('option', { name: /DPG — Dipropylene Glycol/ });
      await dpg.waitFor({ state: 'visible' });
      assert.equal(await solvent.inputValue(), 'Dipropylene');
      await dpg.click();
      assert.equal(await solvent.inputValue(), 'DPG');

      await solvent.fill('Alcohol');
      await dialog().getByRole('option', { name: /ALC — Ethanol/ }).waitFor({ state: 'visible' });
      assert.equal(await solvent.inputValue(), 'Alcohol');
      await solvent.press('ArrowDown');
      assert.equal(await solvent.inputValue(), 'Alcohol');
      await solvent.press('Escape');
      assert.equal(await dialog().count(), 1);
      assert.equal(await suggestions.isVisible(), false);
      assert.equal(await solvent.inputValue(), 'Alcohol');

      await solvent.fill('Ethyl Alcohol');
      await dialog().getByRole('option', { name: /ALC — Ethanol/ }).waitFor({ state: 'visible' });
      await dialog().getByRole('button', { name: 'Cancel', exact: true }).focus();
      await page.keyboard.press('Control+Alt+l');
      await dialog().getByRole('heading', { name: '가져오기 검토', exact: true }).waitFor();
      const koreanSolvent = dilution.getByLabel('용매', { exact: true });
      assert.equal(await koreanSolvent.inputValue(), 'Ethyl Alcohol');
      await dialog().getByRole('button', { name: '취소', exact: true }).focus();
      await page.keyboard.press('Control+Alt+l');
      await dialog().getByRole('heading', { name: 'Import Review', exact: true }).waitFor();
      await page.waitForTimeout(250);

      await solvent.focus();
      await solvent.press('ArrowDown');
      assert.equal(await solvent.inputValue(), 'Ethyl Alcohol');
      await solvent.press('Enter');
      assert.equal(await solvent.inputValue(), 'ALC');
      await solvent.fill('DPG');
      await solvent.press('Tab');
      assert.equal(await solvent.inputValue(), 'DPG');
      await solvent.fill('My Custom Solvent');
      assert.equal(await suggestions.isVisible(), false);
      assert.equal(await solvent.inputValue(), 'My Custom Solvent');

      await page.setViewportSize({ width: 390, height: 420 });
      await solvent.fill('Dipropylene');
      await dpg.waitFor({ state: 'visible' });
      const listBounds = await suggestions.boundingBox();
      assert(listBounds && listBounds.x >= 0 && listBounds.y >= 0 && listBounds.x + listBounds.width <= 391 && listBounds.y + listBounds.height <= 421, JSON.stringify(listBounds));
      await cancel();
      await page.setViewportSize({ width: 1440, height: 900 });
    });
    await test('Notebook DIL shares suggestions, keeps custom values, and persists only explicit changes', async () => {
      const firstRow = page.locator('.row').first();
      await firstRow.locator('.dilution-btn').click();
      const solvent = page.locator('.dilution-panel .solvent-input');
      assert.equal(await solvent.inputValue(), 'ALC');
      await solvent.fill('Dipropylene');
      const suggestion = page.getByRole('listbox', { name: 'Solvent suggestions' }).getByText('DPG — Dipropylene Glycol', { exact: true });
      await suggestion.click();
      assert.equal(await solvent.inputValue(), 'DPG');
      const formulaId = await page.evaluate(() => localStorage.getItem('accordbook.activeFormulaId'));
      await page.waitForFunction(async id => {
        const data = await (await (await import('/src/storage/storageService.ts')).createStorage()).exportData();
        return data.formulas.find(formula => formula.id === id)?.rows[0]?.dilution?.solvent === 'DPG';
      }, formulaId);
      await solvent.fill('My Custom Solvent');
      assert.equal(await solvent.inputValue(), 'My Custom Solvent');
      await solvent.press('Tab');
      assert.equal(await solvent.inputValue(), 'My Custom Solvent');
      await page.waitForFunction(async id => {
        const data = await (await (await import('/src/storage/storageService.ts')).createStorage()).exportData();
        return data.formulas.find(formula => formula.id === id)?.rows[0]?.dilution?.solvent === 'My Custom Solvent';
      }, formulaId);
      await page.locator('.autosave-status.saving').waitFor();
      await page.locator('.autosave-status.saved-locally').waitFor();
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.formula-name')?.value === 'Keep Original QA');
      await page.waitForFunction(async id => {
        const data = await (await (await import('/src/storage/storageService.ts')).createStorage()).exportData();
        return data.formulas.find(formula => formula.id === id)?.rows[0]?.dilution?.solvent === 'My Custom Solvent';
      }, formulaId);
      await page.locator('.row .dilution-suffix').first().waitFor({ state: 'visible' });
      assert.equal(await page.locator('.row').first().locator('.dilution-suffix').innerText(), '@10% in My Custom Solvent');
      assert.deepEqual(errors, []);
    });
    console.log(`Browser checks: ${results.length} passed, 0 failed. Automated Edge; no manual or real mobile-keyboard QA.`);
    fs.writeFileSync('.temp/formula-paste-qa.json', JSON.stringify({ passed: results.length, checks: results }, null, 2));
  } finally { if (browser) await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
