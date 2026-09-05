// Isolated browser data; uses the supplied Playwright runtime without dependencies.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
  const context = await browser.newContext({ignoreHTTPSErrors:true,hasTouch:true});
  const page = await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.QA_ORIGIN || 'https://127.0.0.1:5175');
  await page.evaluate(async()=>{
   const storage=await(await import('/src/storage/storageService.ts')).createStorage();
   const date=new Date().toISOString();
   const formula={id:'qa',formulaId:'ACC-QA',name:'Focus QA',date,notes:'',rows:[{id:'r',rowId:'r',material:'Linalool',parts:1000}],createdAt:date,updatedAt:date};
   const version={versionId:'v1',parentFormulaId:'qa',versionNumber:1,kind:'manual',createdAt:date,note:'',sourceCurrentUpdatedAt:date,snapshot:{name:'Historical',date,notes:'',formulaId:'ACC-QA',rows:formula.rows}};
   await storage.importData({settings:{language:'en',formulaIdPrefix:'ACC'},formulas:[formula],archive:[],versions:[version],meta:{}});
  });
  await page.reload();
  const panel=page.locator('.tm-panel'), close=page.locator('.tm-close');
  const focused=locator=>locator.evaluate(e=>e===document.activeElement);
  async function open(width) {
   if(width<768){await page.locator('.mobile-formula-actions').click();await page.locator('[data-action="time-machine"]').click();}
   else await page.locator('.tm-page-action').click();
   await page.waitForFunction(()=>document.querySelector('.time-machine-stage')?.classList.contains('is-open'));
  }
  async function closed(width){
   await page.waitForFunction(()=>!document.querySelector('.time-machine-stage')?.classList.contains('is-open'));
   assert(await focused(page.locator(width<768?'.mobile-formula-actions':'.tm-page-action')),'opener return');
   assert.equal(await page.locator('.formula-stage').evaluate(e=>e.inert),false);
  }
  for(const [width,height] of [[1440,900],[1920,1080],[1180,820],[1024,768],[820,1180],[768,1024],[430,932],[390,844],[375,812],[360,800],[1839,900],[1840,900]]){
   await page.setViewportSize({width,height});await open(width);
   assert.equal(await panel.getAttribute('aria-modal'),width<1840?'true':null);
   assert.equal(await page.locator('.formula-stage').evaluate(e=>e.inert),width<1840);
   if(width<1840){
    assert(await focused(close),'initial close focus');
    await close.press('Shift+Tab');assert(await page.evaluate(()=>document.activeElement.closest('.tm-panel')!==null));
    await page.keyboard.press('Tab');assert(await focused(close),'trap wraps');
   }else{
    assert(await focused(page.locator('.tm-page-action')),'companion keeps opener');
    await page.locator('input.material').first().focus();await page.keyboard.press('Escape');
    assert(await page.locator('.time-machine-stage').evaluate(e=>e.classList.contains('is-open')),'editor Escape ignored');
   }
   if(await page.locator('.tm-version-list-back').isVisible()) await page.locator('.tm-version-list-back').click();
   await page.locator('.tm-item.manual').first().click();
   await page.locator('.tm-make-batch').click();
   await page.waitForFunction(()=>document.activeElement?.classList.contains('tm-batch-back'));
   await page.locator('.tm-batch-back').click();
   await page.waitForFunction(()=>document.activeElement?.classList.contains('tm-make-batch'));
   await page.locator('.tm-restore-button:not(.tm-make-batch)').click();
   await page.locator('.tm-restore-confirm button').first().focus();await page.keyboard.press('Escape');
   assert.equal(await page.locator('.tm-restore-confirm').count(),0);
   assert(await page.locator('.time-machine-stage').evaluate(e=>e.classList.contains('is-open')));
   await close.click();await closed(width);
   await open(width);await close.press('Escape');await closed(width);
   console.log('PASS viewport, trap/companion, Batch handoff, confirmation Escape, close return',width,height);
  }
  await page.setViewportSize({width:1839,height:900});await open(1839);
  await page.setViewportSize({width:1840,height:900});
  await page.waitForFunction(()=>!document.querySelector('.formula-stage').inert);
  await page.locator('input.material').first().focus();
  await page.setViewportSize({width:1839,height:900});
  await page.waitForFunction(()=>document.activeElement?.classList.contains('tm-close'));
  await close.click();await closed(1839);
  // Reopen during the close animation through the real React trigger.
  await open(1839);await close.click();await page.locator('.tm-page-action').evaluate(e=>e.click());
  await page.waitForTimeout(400);
  assert(await page.locator('.time-machine-stage').evaluate(e=>e.classList.contains('is-open')),'old close timer cancelled');
  if(await page.locator('.tm-version-list-back').isVisible()) await page.locator('.tm-version-list-back').click();
  await page.locator('.tm-item.manual').first().click();
  await page.locator('.tm-make-batch').evaluate(e=>{e.click();document.querySelector('.tm-close').click()});
  await closed(1839);
  console.log('PASS live breakpoint, quick reopen, Batch/close race');
  // Phase 1 remains independent while Time Machine is closed.
  for(const width of [1440,768,375]){
   await page.setViewportSize({width,height:900});
   await page.locator('.new-btn').evaluate(e=>e.click());
   await page.locator('.origin-popover').waitFor();
   await page.locator('.origin-option').last().click();
   await page.locator('.origin-popover').waitFor({state:'detached'});
   await page.waitForTimeout(100);
   assert.equal(await focused(page.locator('input.material').first()),width>=1200,'Origin completion policy');
   const material=page.locator('input.material').first();
   await material.fill('Lin');await page.locator('.material-suggestion').first().waitFor();
   await material.press('ArrowDown');await material.press('Enter');
   assert(await focused(material));assert.equal(await page.locator('.material-suggestion:visible').count(),0);
   await material.press('Enter');assert(await focused(page.locator('input.parts').first()));
   console.log('PASS Phase 1 Origin / Memory Enter #1 / Enter #2',width);
  }
  await page.setViewportSize({width:1920,height:1080});await open(1920);
  await close.click();
  await page.locator('.formula-item').filter({hasText:'Focus QA'}).click();
  await page.waitForTimeout(400);
  assert(await page.locator('.time-machine-stage').evaluate(e=>e.classList.contains('is-open')),'context change cancels old close');
  assert(await focused(page.locator('.formula-item').filter({hasText:'Focus QA'})),'context navigation keeps focus');
  await close.click();await closed(1920);
  console.log('PASS Formula context change cancels stale close and preserves navigation focus');
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
