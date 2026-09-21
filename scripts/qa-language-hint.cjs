const { chromium } = require('playwright');
const assert = require('node:assert/strict');
// Run against the production preview; dev StrictMode can create two initial formulas.
const url = process.env.LANGUAGE_QA_URL || 'https://localhost:5192/';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [width, height] of [[1440,900], [820,1180], [390,844], [360,800]]) {
      const context = await browser.newContext({ locale: 'ko-KR', reducedMotion: 'reduce', ignoreHTTPSErrors: true, viewport: { width, height } });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(url);
      await page.locator('.first-start-modal').waitFor();
      async function check(owner) {
        const hint = page.locator('.korean-language-hint');
        await hint.waitFor({ state: 'visible' });
        assert.equal(await hint.count(), 1);
        assert.equal(await page.locator(owner + ' .korean-language-hint').count(), 1);
        const geometry = await page.evaluate(() => {
          const hint = document.querySelector('.korean-language-hint');
          const h = hint.getBoundingClientRect();
          const toggle = hint.closest('.language-toggle') || hint.parentElement.querySelector('.first-start-language');
          const t = toggle.getBoundingClientRect();
          const hit = document.elementFromPoint(h.x + h.width / 2, h.y + h.height / 2);
          return { within: h.left >= 0 && h.right <= innerWidth && h.bottom <= innerHeight, below: h.top >= t.bottom, unobscured: hint === hit || hint.contains(hit), overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.deepEqual(geometry, { within: true, below: true, unobscured: true, overflow: false });
      }
      await check('.first-start-modal');
      await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), `language-hint-modal-${width}.png`) });
      assert.equal(await page.evaluate(() => localStorage.getItem('accordbook.locale.explicit')), null);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await check('.language-toggle');
      await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), `language-hint-main-${width}.png`) });
      for (const owner of ['.language-toggle', '.first-start-modal']) {
        for (const language of ['en', 'ko']) {
          await page.evaluate(() => { localStorage.setItem('accordbook.locale', 'en'); localStorage.removeItem('accordbook.locale.explicit'); });
          await page.reload();
          await page.locator('.first-start-modal').waitFor().catch(async e => { console.log(await page.locator('body').innerText()); console.log(errors); throw e; });
          if (owner === '.language-toggle') await page.getByRole('button', { name: 'Close', exact: true }).click();
          await check(owner);
          await page.locator(owner).getByRole('button', { name: language === 'en' ? 'English' : '한국어', exact: true }).click();
          await page.waitForFunction(() => !document.querySelector('.korean-language-hint'));
          assert.deepEqual(await page.evaluate(() => [localStorage.getItem('accordbook.locale'), localStorage.getItem('accordbook.locale.explicit'), document.documentElement.lang]), [language, language, language]);
          await page.reload();
          await page.locator('.first-start-modal').waitFor();
          assert.equal(await page.locator('.korean-language-hint').count(), 0);
        }
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}x${height}: modal/main ownership, geometry, EN/KO clicks and reload, default EN`);
      await context.close();
    }
    const context = await browser.newContext({ locale: 'en-US', ignoreHTTPSErrors: true });
    const page = await context.newPage(); await page.goto(url); await page.locator('.first-start-modal').waitFor();
    assert.equal(await page.locator('.korean-language-hint').count(), 0);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.locator('.korean-language-hint').count(), 0);
    console.log('PASS non-Korean browser: no cue in either context');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
