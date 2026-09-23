const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const text = fs.readFileSync('public/formula-drops/2026-001/ACBK-DROP-2026-001-McintoshApple.accordbook','utf8');
const title = JSON.parse(text).formula.name;
const drop = {dropId:'DROP-2026-001',slug:'2026-001',year:2026,sequence:1,title,subtitle:'',description:'',status:'ACTIVE',startAt:null,expiresAt:'2026-09-30T00:00:00Z'};
const base='https://127.0.0.1:5178';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
 for(const viewport of [{width:390,height:844},{width:360,height:800},{width:1440,height:900},{width:1920,height:1080}]) {
  const context=await browser.newContext({viewport,ignoreHTTPSErrors:true,acceptDownloads:true});
  await context.addInitScript(()=>{if(!localStorage.getItem('accordbook.locale')) localStorage.setItem('accordbook.locale','en');if(!sessionStorage.getItem('accordbook.drop.session.locale')) sessionStorage.setItem('accordbook.drop.session.locale','ko');if(!localStorage.getItem('accordbook.drop.locale')) localStorage.setItem('accordbook.drop.locale','ko')});
  const events=[]; let mode='valid'; let resolutions=0;
  await context.route('https://script.google.com/**',async route=>{
   const body=JSON.parse(route.request().postData()||'{}'); let result;
   if(body.action==='get-drop') result={ok:true,drop};
   else if(body.action==='resolve-drop-package'){resolutions++;result=mode==='failure'?{ok:false,error:'package_unavailable'}:{ok:true,package:{dropId:drop.dropId,fileName:'test.accordbook',packageType:'accordbook-formula',title,packageText:mode==='paid'?'{"type":"accordbook-paid-package"}':mode==='malformed'?'{}':text}};}
   else if(body.action==='get-download') result={ok:true,accepted:true,duplicate:false,download:{fileName:'test.accordbook',fileUrl:base+'/formula-drops/2026-001/ACBK-DROP-2026-001-McintoshApple.accordbook'}};
   else {events.push(body);result={ok:true,accepted:true,duplicate:false};}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result),headers:{'access-control-allow-origin':'*'}});
  });
  const page=await context.newPage();
  await page.goto(base+'/drop/2026-001');
  const cta=page.getByRole('link',{name:'Accordbook에서 열기',exact:true}).first();
  await cta.waitFor();
  const ctaAudit=await page.locator('.formula-drop-button').evaluateAll(nodes=>nodes.map(node=>({label:(node.textContent||'').trim(),color:getComputedStyle(node).color,background:getComputedStyle(node).backgroundColor})));
  assert.ok(ctaAudit.length>=2);
  for(const cta of ctaAudit){assert.ok(cta.label);assert.notEqual(cta.color,cta.background);}
  async function auditHierarchy(locale) {
   const panel=page.locator('.formula-drop-cover-download');
   const primary=panel.getByRole('link');
   const secondary=panel.getByRole('button');
   assert.match(await panel.innerText(),locale==='ko'?/파일로 보관하기/:/Save the file/);
   const colors=await panel.evaluate(node=>{
    const a=node.querySelector('a'),b=node.querySelector('button');
    return {primary:getComputedStyle(a).backgroundColor,secondary:getComputedStyle(b).backgroundColor,ordered:!!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING)};
   });
   assert.ok(colors.ordered);assert.notEqual(colors.primary,colors.secondary);
   for(const action of [primary,secondary]){
    await action.hover();await action.focus();
    const style=await action.evaluate(node=>({color:getComputedStyle(node).color,background:getComputedStyle(node).backgroundColor,outline:getComputedStyle(node).outlineStyle}));
    assert.notEqual(style.color,style.background);assert.notEqual(style.outline,'none');
   }
   const a=await primary.boundingBox(),b=await secondary.boundingBox();
   assert.ok(b.y>=a.y+a.height);assert.ok(a.height>=44);
   await panel.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'drop-hierarchy-'+locale+'-'+viewport.width+'.png')});
  }
  await auditHierarchy('ko');
  const topDownload=page.waitForEvent('download');
  await page.locator('.formula-drop-cover-download').getByRole('button').click();
  assert.ok(await (await topDownload).path());
  await page.goto(base+'/drop/2026-001');await cta.waitFor();
  assert.equal(await cta.getAttribute('href'),'/?from=drop&drop=DROP-2026-001');await cta.click();
  await page.getByRole('button',{name:'포뮬러 가져오기',exact:true}).waitFor();
  assert.match(await page.locator('.drop-direct-dialog').innerText(),/11 원료 · 1000 parts/);
  assert.equal(await page.locator('.formula-list .formula-item').count(),1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('accordbook.locale')),'en');
  const box=await page.locator('.drop-direct-dialog').boundingBox();assert.ok(box.x>=0 && box.x+box.width<=viewport.width);
  await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'drop-handoff-'+viewport.width+'.png')});
  await page.getByRole('button',{name:'포뮬러 가져오기',exact:true}).click();
  await page.waitForFunction(()=>!location.search.includes('from=drop'));
  assert.equal(await page.locator('.formula-list .formula-item').count(),2);
  assert.ok(events.some(e=>e.eventType==='import_success' && e.source==='direct_handoff'));
  const before=resolutions;await page.reload();await page.locator('.formula-name').waitFor();assert.equal(resolutions,before);
  for(const bad of ['failure','paid','malformed']) {mode=bad;await page.goto(base+'/?from=drop&drop=DROP-2026-001&keep=1#note');await page.getByRole('heading',{name:'포뮬러를 불러오지 못했습니다'}).waitFor();await page.getByRole('button',{name:'.accordbook 파일 다운로드',exact:true}).waitFor();}
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'.accordbook 파일 다운로드',exact:true}).click();const download=await downloadPromise;assert.deepEqual(JSON.parse(fs.readFileSync(await download.path(),'utf8')).formula,JSON.parse(text).formula);
  await page.getByRole('button',{name:'닫기',exact:true}).click();assert.match(page.url(),/keep=1#note$/);
  const prior=resolutions;await page.goto(base+'/?from=drop&drop=bad');await page.getByRole('heading',{name:'포뮬러를 불러오지 못했습니다'}).waitFor();assert.equal(resolutions,prior);
  await page.evaluate(()=>localStorage.setItem('accordbook.drop.locale','en'));await page.goto(base+'/drop/2026-001');await page.getByRole('link',{name:'OPEN IN ACCORDBOOK',exact:true}).first().waitFor();
  await auditHierarchy('en');
  console.log('PASS',viewport.width+'x'+viewport.height,'CTA, confirmation, import, locale, cleanup, reload, invalid ID, paid/malformed rejection, fallback');
  await context.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
