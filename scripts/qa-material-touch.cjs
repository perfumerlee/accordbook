// Uses the supplied Playwright runtime and an isolated browser profile.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const context = await browser.newContext({ignoreHTTPSErrors:true,hasTouch:true,viewport:{width:375,height:812}});
 const page = await context.newPage();
 await page.goto(process.env.QA_ORIGIN || 'https://127.0.0.1:5175');
 await page.evaluate(async () => {
  const storage = await (await import('/src/storage/storageService.ts')).createStorage();
  const date = new Date().toISOString();
  const base = {date,notes:'',createdAt:date,updatedAt:date};
  await storage.importData({settings:{language:'en',formulaIdPrefix:'ACC'},formulas:[
   {...base,id:'edit',formulaId:'ACC-2609-999',name:'Touch QA',rows:[{id:'edit-row',material:'',parts:''}]},
   {...base,id:'source',formulaId:'ACC-2609-001',name:'Source',rows:[{id:'source-row',material:'Linalool',parts:1000}]}
  ],archive:[],versions:[],meta:{}});
 });
 await page.reload();
 await page.locator('.formula-item.active').filter({hasText:'Touch QA'}).waitFor({state:'attached'});
 let dialogs=0;
 page.on('dialog',async d=>{dialogs++;await d.dismiss()});
 await page.evaluate(()=>{window.qaActions=0;document.querySelector('.editor-actions').addEventListener('click',()=>window.qaActions++)});
 for(const width of [375,360,390,430,768,1024,1440]) {
  await page.setViewportSize({width,height:900});
  const input=page.locator('input.material').first();
  await input.fill('Lin');
  const option=page.locator('.material-suggestion').filter({hasText:'Linalool'}).first();
  await option.waitFor({state:'visible'});
  await option.dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true,cancelable:true});
  assert.equal(await input.inputValue(),'Lin','pointerdown must not remove target');
  await option.tap();
  assert.equal(await input.inputValue(),'Linalool');
  assert(await input.evaluate(e=>e===document.activeElement),'focus retained');
  await input.press('Enter');
  assert(await page.locator('input.parts').first().evaluate(e=>e===document.activeElement));
  assert.equal(await page.locator('input.material').count(),1);
  console.log('PASS touch selection / focus / no action click',width);
 }
 assert.equal(dialogs,0);
 assert.equal(await page.evaluate(()=>window.qaActions),0);
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
