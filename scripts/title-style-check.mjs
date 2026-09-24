import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
  await page.goto(process.argv[2] || 'https://127.0.0.1:5199')
  const title = page.locator('input.formula-name')
  await title.waitFor()
  await title.fill('Mcintosh Apple / Simplified Study')
  const read = () => title.evaluate(el => {
    const css = getComputedStyle(el)
    return { viewport: innerWidth, locale: document.documentElement.lang, size: css.fontSize, family: css.fontFamily, style: css.fontStyle, inline: el.style.cssText }
  })
  const initial = await read()
  console.log('desktop initial', initial)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  const mobile = await read()
  console.log('mobile', mobile)
  assert.ok(mobile.inline.includes('!important'), 'Long mobile titles should still fit')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.waitForTimeout(300)
  assert.deepEqual(await read(), initial, 'Returning to desktop must restore configured typography')
  console.log('desktop restored', await read())
  const welcomeClose = page.locator('.first-start-close')
  if (await welcomeClose.isVisible()) await welcomeClose.click()
  const english = page.locator('.language-toggle button[aria-label="English"]')
  const korean = page.locator('.language-toggle button').nth(1)
  await korean.click()
  const koreanStyle = await read()
  await english.click()
  assert.deepEqual(await read(), initial)
  await page.keyboard.press('Control+Alt+l')
  await page.waitForFunction(() => document.documentElement.lang === 'ko')
  assert.deepEqual(await read(), koreanStyle, 'Shortcut and language button should apply identical typography')
  await page.keyboard.press('Control+Alt+l')
  await page.waitForFunction(() => document.documentElement.lang === 'en')
  assert.deepEqual(await read(), initial, 'Language round trip should preserve English typography')
  console.log('PASS: resize restoration and button/shortcut typography parity')
  const fits = () => title.evaluate(el => {
    const css = getComputedStyle(el)
    const span = document.createElement('span')
    span.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
    span.style.font = css.font
    span.style.letterSpacing = css.letterSpacing
    span.textContent = el.value
    document.body.append(span)
    const width = span.getBoundingClientRect().width
    span.remove()
    const available = el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)
    if (width > available) console.log('overflow', { width, available, font: css.font, spacing: css.letterSpacing })
    return width <= available
  })
  for (const width of [1440, 1000, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const name of ['Mcintosh Apple / Simplified Study / Indole Concentration Comparison', 'A long experimental formula title '.repeat(5), '사과 향 조향 실험 / 인돌 농도와 잔향의 균형 비교 / 다음 실험을 위한 기록']) {
      await title.fill(name)
      assert.ok(await fits(), `Full title must fit at ${width}px: ${name}`)
    }
    await title.fill('Apple')
    assert.equal((await read()).inline, '', 'Short titles should use the original CSS size')
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await title.fill('Mcintosh Apple / Simplified Study / A longer title for a narrower field')
  await title.evaluate(el => { el.style.width = '240px' })
  await page.waitForTimeout(100)
  assert.ok(await fits(), 'Field width changes without a window resize should trigger fitting')
  await title.evaluate(el => el.style.removeProperty('width'))
  console.log('PASS: long English/Korean titles fit desktop, tablet, mobile and field-only resizing')
} finally {
  await browser.close()
}
