const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [drop, core, locale] of [['ko', 'en', 'en-US'], ['en', 'ko', 'ko-KR'], [null, 'en', 'ko-KR']]) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, locale });
      await context.addInitScript(({ drop, core }) => {
        localStorage.setItem('accordbook.locale', core);
        if (drop) sessionStorage.setItem('accordbook.drop.session.locale', drop);
        sessionStorage.setItem('accordbook.drop.access', JSON.stringify({ dropSlug: '2026-001', title: 'QA Formula', download: { fileName: 'test.accordbook', fileUrl: 'https://example.com/test', accessName: 'test', accessLast4: '0123', accessPin: '123456' } }));
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => new Promise(resolve => setTimeout(resolve, 100)) } });
      }, { drop, core });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto('https://127.0.0.1:5189/?from=drop&drop=2026-001');
      const banner = page.locator('.drop-inbound-guidance');
      await banner.waitFor();
      const expected = drop || 'ko';
      assert.equal(await banner.getAttribute('lang'), expected);
      // Changing a notebook field causes the parent to render and recreate the banner.
      await page.locator('.formula-name').fill('Rerender regression');
      assert.equal(await banner.getAttribute('lang'), expected);
      assert.match(await banner.innerText(), expected === 'ko' ? /끝 4자리: 0123/ : /LAST 4 DIGITS: 0123/);
      await banner.locator('button').first().click();
      await page.waitForFunction(expected => document.querySelector('.drop-inbound-guidance button').textContent.includes(expected), expected === 'ko' ? '복사되었습니다' : 'COPIED');
      assert.equal(await page.evaluate(() => document.documentElement.lang), core);
      await banner.locator('.drop-inbound-dismiss').click();
      assert.equal(await banner.count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('accordbook.locale')), core);
      assert.deepEqual(errors, []);
      console.log(`PASS Drop=${drop || 'browser KO'}, core=${core}: render, rerender, async copy, dismissal`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
