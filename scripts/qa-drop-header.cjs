const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ channel: 'msedge', headless: true });
 try {
  for (const width of [1440, 820, 390, 360]) {
   const context = await browser.newContext({ locale: 'ko-KR', ignoreHTTPSErrors: true, viewport: { width, height: 900 } });
   const page = await context.newPage();
   const errors = []; page.on('pageerror', e => errors.push(e.message));
   for (const path of ['/drop?dropData=snapshot', '/drop/2026-001?dropData=snapshot']) {
    await page.goto('https://127.0.0.1:5189' + path);
    await page.locator('.formula-drop-header').waitFor();
    assert.equal(await page.getByRole('button', { name: '한국어', exact: true }).getAttribute('aria-pressed'), 'true');
    const geometry = await page.evaluate(() => {
     const header = document.querySelector('.formula-drop-header').getBoundingClientRect();
     const toggle = document.querySelector('.formula-drop-language-switch').getBoundingClientRect();
     const nav = document.querySelector('.formula-drop-nav').getBoundingClientRect();
     return { inside: toggle.left >= header.left && toggle.right <= header.right + 1 && toggle.bottom <= header.bottom, overlap: toggle.left < nav.right && toggle.right > nav.left && toggle.top < nav.bottom && toggle.bottom > nav.top };
    });
    assert.deepEqual(geometry, { inside: true, overlap: false });
   }
   await page.locator('.formula-drop-back').first().click();
   await page.waitForURL('**/drop');
   assert.match(await page.locator('.formula-drop-intro').innerText(), /조향사를 위한/);
   await page.getByRole('button', { name: 'English', exact: true }).click();
   assert.match(await page.locator('.formula-drop-intro').innerText(), /Formulas shared/);
   await page.reload();
   assert.equal(await page.getByRole('button', { name: 'English', exact: true }).getAttribute('aria-pressed'), 'true');
   assert.deepEqual(errors, []);
   console.log(`PASS ${width}px: index/detail header, KO navigation, EN switch/reload`);
   await context.close();
  }
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
