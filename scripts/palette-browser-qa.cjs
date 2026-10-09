const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
fs.mkdirSync('.temp', { recursive: true });
const origin = process.env.QA_ORIGIN || 'https://127.0.0.1:4179';
const viewports = [[1440,900],[1920,1080],[1180,820],[1024,768],[820,1180],[768,1024],[430,932],[390,844],[375,812],[360,800],[1199,900],[1200,900],[767,900],[768,900]];
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,reducedMotion:'reduce',viewport:{width:1440,height:900},acceptDownloads:true});
 const page=await context.newPage(); const errors=[]; let aiRequests=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url()); if(url.hostname!=='127.0.0.1' && url.hostname!=='localhost'){if(url.pathname.includes('/ai/'))aiRequests++;return route.abort()}return route.continue()});
 try {
 await page.goto(origin); await page.waitForFunction(()=>!!document.querySelector('.app'));
 await page.evaluate(async()=>{
  const s=await (await import('/src/storage/storageService.ts')).createStorage();const date=new Date().toISOString();const base={date,notes:'',createdAt:date,updatedAt:date};
  await s.importData({settings:{language:'en',formulaIdPrefix:'ACC'},formulas:[{...base,id:'palette-edit',formulaId:'ACC-TEST-001',name:'Palette QA',rows:[{id:'r1',material:'',parts:''}]},{...base,id:'palette-memory',formulaId:'ACC-TEST-002',name:'Memory',rows:[{id:'r2',material:'Linalool',parts:1000}]}],archive:[],versions:[],experiments:[],reviews:[],palette:[],meta:{}});
  await s.palette.add({materialName:'Linalyl acetate',alias:'Citrus ester'});localStorage.setItem('accordbook.active-formula','palette-edit');localStorage.setItem('accordbook.locale','en');
 });
 await page.reload();await page.locator('.accordbook-intro').waitFor({state:'hidden'});if(await page.locator('.first-start-modal').count())await page.keyboard.press('Escape');
 console.log('INITIAL', (await page.locator('body').innerText()).slice(0,500));
 const tools=()=>page.getByRole('button',{name:'Data Tools',exact:true});
 const closeDialog=async()=>{await page.locator('dialog[open]').last().getByRole('button',{name:'Close / 닫기',exact:true}).click()};
 const openTools=async()=>{if(!(await tools().isVisible()) || (await tools().boundingBox())?.x<0){await page.getByRole('button',{name:'Open notebook',exact:true}).click()}await tools().click()};
 await openTools(); await page.keyboard.press('Escape');assert(await tools().evaluate(e=>e===document.activeElement));
 await openTools();await page.locator('.formula-name').click();assert.equal(await page.locator('.data-tools-popover').count(),0);
 // Keyboard selection keeps material focus; second Enter advances to Parts.
 const material=page.locator('input.material').first(), parts=page.locator('input.parts').first();
 await material.fill('Lin');assert.deepEqual(await page.locator('.material-suggestion').allTextContents(),['Linalyl acetate','Linalool']);
 await material.press('ArrowDown');await material.press('ArrowDown');await material.press('ArrowUp');await material.press('Enter');assert.equal(await material.inputValue(),'Linalyl acetate');assert(await material.evaluate(e=>e===document.activeElement));await material.press('Enter');assert(await parts.evaluate(e=>e===document.activeElement));
 await material.fill('Lin');await material.press('Escape');assert.equal(await page.locator('.material-suggestion').count(),0);
 await material.fill('Quick Material');assert.equal(await page.locator('.palette-quick-add').count(),1);
 assert.equal(await page.evaluate(async()=> (await (await (await import('/src/storage/storageService.ts')).createStorage()).palette.list()).length),1);
 await page.locator('.palette-quick-add').click();await page.locator('dialog[open]').getByRole('button',{name:'Save',exact:true}).click();await page.locator('dialog[open]').waitFor({state:'hidden'});await material.focus();assert.equal(await page.locator('.palette-quick-add').count(),0);
 // Missing material selection explicitly adds only the checked candidate.
 await material.fill('Missing Material');await parts.click();await page.locator('.palette-coverage').click();await page.locator('dialog[open] input[type=checkbox]').check();await page.getByRole('button',{name:'Add selected to Palette',exact:true}).click();await page.getByText('No missing materials.',{exact:true}).waitFor();await closeDialog();
 // Data Tools token owner retains state across close/reopen; raw value never redisplayed.
 await openTools();await page.getByRole('menuitem',{name:/AI Access Token/}).click();await page.locator('dialog[open] input[type=password]').fill('invalid');await page.getByRole('button',{name:'Connect',exact:true}).click();await page.getByRole('alert').filter({hasText:'Enter a valid token'}).waitFor();
 const token='A'.repeat(43);await page.locator('dialog[open] input[type=password]').fill(token);await page.getByRole('button',{name:'Connect',exact:true}).click();assert.equal(await page.locator('dialog[open] input[type=password]').count(),0);await closeDialog();
 await openTools();assert((await page.getByRole('menuitem',{name:/AI Access Token/}).innerText()).includes('●'));await page.keyboard.press('Escape');
 const stored=await page.evaluate(async()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage},backup:await (await (await import('/src/storage/storageService.ts')).createStorage()).exportData()}));assert(!stored.includes(token));
 const results=[];
 for(const [width,height] of viewports){
  await page.setViewportSize({width,height});await material.fill('Missing Material');await parts.click();
  const header=await page.locator('.table-head').boundingBox(),coverage=await page.locator('.palette-coverage').boundingBox(),materialHeading=page.locator('.palette-material-heading > span:first-child');assert(coverage.y+coverage.height<=header.y+1,'coverage stays above header');assert.match(await page.locator('.palette-coverage').innerText(),/Palette \d+\/\d+/,'coverage explains matched, total, and missing materials');assert.match(await page.locator('.palette-coverage').getAttribute('aria-label'),/unique materials, \d+ missing/,'coverage has a descriptive accessible name');
  if(width===375){const headingLayout=await materialHeading.evaluate(e=>({text:e.textContent,width:e.clientWidth,scrollWidth:e.scrollWidth}));assert.equal(headingLayout.text.toLowerCase(),'material name');assert(headingLayout.width>0 && headingLayout.width>=headingLayout.scrollWidth,'Material name is fully readable beside coverage at iPhone XS width');assert(await page.locator('.mobile-cas-badge').isVisible(),'mobile CAS control remains visible');}
  const aiButton=page.locator('.editor-actions .ai-review-trigger');
  if(await aiButton.count()){
   const resetButton=page.getByRole('button',{name:'Reset materials',exact:true}),addButton=page.getByRole('button',{name:'+ Add material',exact:true});
   const boxes=await Promise.all([aiButton.boundingBox(),resetButton.boundingBox(),addButton.boundingBox()]);assert(boxes.every(Boolean),'all three Formula actions are visible');
   assert(boxes.every(box=>Math.abs(box.y-boxes[0].y)<=1 && Math.abs(box.height-boxes[0].height)<=1),'Formula actions share one aligned row');
   assert(boxes.slice(1).every((box,i)=>box.x>=boxes[i].x+boxes[i].width-1),'Formula actions do not overlap');
   assert(boxes.every(box=>box.x>=0 && box.x+box.width<=width+1),'Formula actions fit in the viewport');
   assert(await Promise.all([aiButton,resetButton,addButton].map(button=>button.evaluate(e=>e.scrollWidth<=e.clientWidth+1)) ).then(values=>values.every(Boolean)),'Formula action labels are not clipped');
   if(width<=767)assert(boxes.every(box=>box.height>=44),'mobile action targets are at least 44px high');
  }
  await openTools();const dataHeight=await page.locator('.data-actions').evaluate(e=>e.getBoundingClientRect().height),menu=await page.locator('.data-tools-popover').boundingBox();assert(menu.x>=0 && menu.x+menu.width<=width+1 && menu.y>=0 && menu.y+menu.height<=height+1,'popover in viewport');await page.keyboard.press('Escape');assert.equal(await page.locator('.data-actions').evaluate(e=>e.getBoundingClientRect().height),dataHeight);
  await openTools();await page.getByRole('menuitem',{name:'Material Palette',exact:true}).click();assert.equal(await page.locator('.data-tools-popover').count(),0);if(width<1200)assert(!await page.locator('html').evaluate(e=>e.classList.contains('responsive-drawer-open')));
  const dialog=page.locator('dialog[open]');assert(await dialog.getByRole('button',{name:'Sample Excel',exact:true}).isVisible());assert(await dialog.getByRole('button',{name:'Export Excel',exact:true}).isVisible());assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'dialog has no horizontal overflow');
  const toolbar=await dialog.locator('.palette-toolbar .btn').evaluateAll(buttons=>buttons.map(button=>{const box=button.getBoundingClientRect();return{x:box.x,y:box.y,right:box.right,height:box.height}}));assert.equal(toolbar.length,4);assert(toolbar.every(box=>box.x>=0&&box.right<=width+1&&box.height>=40),'Palette toolbar actions fit viewport');if(width<=767){assert(Math.abs(toolbar[0].y-toolbar[1].y)<1&&Math.abs(toolbar[2].y-toolbar[3].y)<1&&toolbar[2].y>toolbar[0].y,'mobile Palette toolbar uses a balanced two-row grid')}else assert(toolbar.every(box=>Math.abs(box.y-toolbar[0].y)<1),'desktop Palette toolbar shares one row');
  assert(await dialog.locator('.palette-search input').evaluate(e=>e.getBoundingClientRect().width>200),'Palette search is usable');await dialog.getByRole('button',{name:'Edit',exact:true}).first().click();const details=page.locator('dialog[open]').last();const footer=await details.locator('.palette-form-actions .btn').evaluateAll(buttons=>buttons.map(button=>{const box=button.getBoundingClientRect();return{x:box.x,y:box.y,right:box.right,height:box.height}}));const detailBox=await details.boundingBox();assert.equal(footer.length,2);assert(Math.abs(footer[0].y-footer[1].y)<1&&footer[1].right<=detailBox.x+detailBox.width&&footer[1].right>=detailBox.x+detailBox.width-45,'details actions share a right-aligned row');assert(await details.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'details dialog has no horizontal overflow');if(width<=767)assert.equal(await details.locator('.palette-form-pair').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),1,'mobile dilution fields stack');if([1440,768,390,375,360].includes(width))await page.screenshot({path:`.temp/palette-details-${width}x${height}.png`});await details.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.screenshot({path:`.temp/palette-${width}x${height}.png`});await closeDialog();
  await openTools();await page.getByRole('menuitem',{name:/AI Access Token/}).click();const tokenDialog=page.locator('dialog[open]').last();if(await tokenDialog.getByRole('button',{name:'Disconnect',exact:true}).count())await tokenDialog.getByRole('button',{name:'Disconnect',exact:true}).click();const tokenInput=await tokenDialog.locator('.palette-token-row input').boundingBox(),connect=await tokenDialog.getByRole('button',{name:'Connect',exact:true}).boundingBox(),tokenBox=await tokenDialog.boundingBox();assert(Math.abs(tokenInput.y-connect.y)<1&&Math.abs(tokenInput.height-connect.height)<1,'token input and Connect share one row and height');assert(tokenInput.x>=tokenBox.x&&connect.x+connect.width<=tokenBox.x+tokenBox.width,'token controls fit dialog');assert(await tokenDialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'token dialog has no horizontal overflow');if([1440,768,390,375,360].includes(width))await page.screenshot({path:`.temp/palette-token-${width}x${height}.png`});await closeDialog();
  if(width<1200 && await page.locator('html').evaluate(e=>e.classList.contains('responsive-drawer-open')))await page.mouse.click(width-8,height/2);
  await page.locator('.palette-coverage').click();assert(await page.locator('dialog[open]').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await closeDialog();
  await material.fill('QA missing long material '+width);const quick=await page.locator('.palette-quick-add').boundingBox();assert(quick.x>=0 && quick.x+quick.width<=width+1);await page.screenshot({path:`.temp/palette-quick-${width}x${height}.png`});await material.press('Escape');
  results.push({width,height,headerHeight:header.height,drawerHeight:dataHeight,status:'PASS'});console.log('VIEWPORT PASS',width,height);
 }
 await page.setViewportSize({width:1440,height:900});await openTools();await page.getByRole('menuitem',{name:'Material Palette',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Sample Excel',exact:true}).click();const sample=await download;assert.equal(sample.suggestedFilename(),'Accordbook-Material-Palette-Sample.xlsx');await sample.saveAs('.temp/palette-sample.xlsx');
 await page.locator('dialog[open] input[type=file]').setInputFiles('.temp/palette-sample.xlsx');await page.getByRole('heading',{name:'Excel import preview',exact:true}).waitFor();assert((await page.locator('.palette-preview-rows').innerText()).includes('Ambroxan'));await page.getByRole('button',{name:'Apply new materials',exact:true}).click();await page.getByRole('heading',{name:'Excel import preview',exact:true}).waitFor({state:'hidden'});await closeDialog();
 // Visual viewport contraction approximates the available area above a soft keyboard.
 await page.setViewportSize({width:360,height:800});await openTools();await page.getByRole('menuitem',{name:'Material Palette',exact:true}).click();await page.getByRole('button',{name:'+ Add Material',exact:true}).click();await page.setViewportSize({width:360,height:360});const small=await page.locator('dialog[open]').last().boundingBox();assert(small.y>=0 && small.y+small.height<=360);await page.locator('dialog[open]').last().getByRole('button',{name:'Save',exact:true}).scrollIntoViewIfNeeded();await closeDialog();await closeDialog();await page.setViewportSize({width:1440,height:900});
 await page.reload();await page.locator('.accordbook-intro').waitFor({state:'hidden'});await openTools();assert((await page.getByRole('menuitem',{name:/AI Access Token/}).innerText()).includes('○'));
 assert.equal(aiRequests,0);assert.deepEqual(errors,[]);fs.writeFileSync('.temp/palette-browser-results.json',JSON.stringify({results,aiRequests,errors},null,2));console.log('PASS all Palette browser checks');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
