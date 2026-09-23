const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const sizes = [[1122,494],[1024,494],[1024,600],[820,600],[768,600],[446,539],[430,600],[430,932],[390,844],[375,812],[360,800],[1180,820],[1024,768],[820,1180],[768,1024],[1440,900],[1920,1080]];
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const context = await browser.newContext({ignoreHTTPSErrors:true});
 const page = await context.newPage();
 await page.goto('https://localhost:5186');
 await page.evaluate(async () => {
   const storage = await (await import('/src/storage/storageService.ts')).createStorage();
   const date = new Date().toISOString();
   const make = i => ({id:`qa-${i}`,formulaId:`ACC-QA-${i}`,name:`Landscape study ${i}`,date,notes:'',rows:[{id:`r${i}`,material:'Linalool',parts:1000}],createdAt:date,updatedAt:date});
   await storage.importData({settings:{language:'en',formulaIdPrefix:'ACC'},formulas:[1,2,3,4].map(make),archive:[5,6].map(make),versions:[],meta:{}});
 });
 await page.reload();
 await page.locator('.sidebar').waitFor({state:'attached'});
 for (const [width,height] of sizes) {
   await page.setViewportSize({width,height});
   if(width<1200 && !(await page.locator('html').getAttribute('class')||'').includes('responsive-drawer-open')) await page.locator('.notebook-toggle').click();
   await page.waitForTimeout(200);
   const result = await page.evaluate(() => {
     const el=s=>document.querySelector(s), h=s=>el(s)?.getBoundingClientRect().height||0;
     const list=el('.formula-list'), box=list.getBoundingClientRect();
     list.scrollTop=0;
     return {sidebar:h('.sidebar'),header:h('.brand')+h('.brand-sub'),prefix:h('.prefix-row'),newFormula:h('.new-btn'),heading:h('.library-notebook-title'),search:h('.formula-search'),list:list.clientHeight,scrollHeight:list.scrollHeight,archive:h('.archive-section-heading'),data:h('.data-actions')+h('.data-section-title'),rows:[...list.children].filter(e=>{const r=e.getBoundingClientRect();return r.top>=box.top&&r.bottom<=box.bottom}).length,overflow:document.documentElement.scrollWidth>innerWidth,sidebarOverflow:el('.sidebar').scrollWidth>el('.sidebar').clientWidth};
   });
   const list=page.locator('.formula-list');
   if(width===1122) await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'accordbook-landscape-after.png')});
   await list.hover(); await page.mouse.wheel(0,350); await page.waitForTimeout(150);
   result.scrollAfter=await list.evaluate(e=>e.scrollTop);
   console.log(JSON.stringify({width,height,...result}));
   if(!process.env.QA_BASELINE) {
     assert(!result.overflow && !result.sidebarOverflow,'horizontal overflow');
     if(width<1200) assert(result.sidebar<=height+1,'sidebar height');
     if(width>=768&&width<1200&&height<=600) assert(result.rows>=2,'two visible rows');
     if(result.scrollHeight>result.list+1) assert(result.scrollAfter>0,'wheel scroll');
   }
   await page.locator('.archive-section-heading').click();
   await page.locator('.archive-panel .archive-item').first().waitFor();
   if(width>=768&&width<1200&&height<=600) {
     assert(await page.locator('.archive-panel').evaluate(e=>e.clientHeight>=117),'archive usable height');
     assert(await page.locator('.sidebar').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'no second scrollbar');
   }
   await page.locator('.archive-section-heading').click();
   if(width===1122) {
     for(const label of ['Export','Import']) {
       await page.locator('.data-actions .export-wrap > button').filter({hasText:label}).click();
       const menu=page.locator('.export-menu.open');
       await menu.waitFor();
       assert(await menu.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}),'menu reachable');
       await page.locator('.data-actions .export-wrap > button').filter({hasText:label}).click();
     }
     const before=await page.evaluate(()=>scrollY);
     await page.mouse.move(width-20,height/2);await page.mouse.wheel(0,300);await page.waitForTimeout(150);
     assert.equal(await page.evaluate(()=>scrollY),before,'background locked');
     await page.locator('.drawer-scrim').click({position:{x:width-20,y:20}});
     assert.notEqual(await page.locator('html').evaluate(e=>getComputedStyle(e).overflowY),'hidden','unlock');
   }
 }
 await context.close();
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
