const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.QA_ORIGIN || 'https://127.0.0.1:4183';
const viewports = [[1440,900],[768,1024],[430,932],[390,844],[375,812],[360,800],[767,900],[1199,900],[1200,900]];
(async () => {
  fs.mkdirSync('.temp', { recursive:true });
  const browser = await chromium.launch({ channel:'msedge', headless:true });
  const context = await browser.newContext({ ignoreHTTPSErrors:true, reducedMotion:'reduce' });
  const page = await context.newPage(), errors = [], results = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  try {
    await page.goto(origin); await page.waitForFunction(() => !!document.querySelector('.app'));
    await page.evaluate(async () => {
      const storage = await (await import('/src/storage/storageService.ts')).createStorage();
      const date = new Date().toISOString();
      const names = ['Hedione','Iso E Super','Linalool','Ambroxan','Benzyl acetate','Phenyl ethyl alcohol','Vanillin','Stemone','HEDIONE',''];
      await storage.importData({ settings:{language:'en',formulaIdPrefix:'ACC'}, formulas:[{id:'status-qa',formulaId:'ACC-QA',name:'Material status QA',date,notes:'',createdAt:date,updatedAt:date,rows:names.map((material,i)=>({id:`r${i}`,material,parts:material ? 100 : ''}))}], archive:[],versions:[],experiments:[],reviews:[],palette:[],meta:{} });
      await storage.palette.add({materialName:'Hedione'}); await storage.palette.add({materialName:'Iso E Super'});
      localStorage.setItem('accordbook.active-formula','status-qa'); localStorage.setItem('accordbook.locale','en');
    });
    await page.reload(); await page.locator('.accordbook-intro').waitFor({state:'hidden'});
    if (await page.locator('.first-start-modal').count()) await page.keyboard.press('Escape');
    for (const language of ['en','ko']) {
      await page.getByRole('button',{name:language === 'en' ? 'English' : '한국어',exact:true}).click();
      for (const [width,height] of viewports) {
        await page.setViewportSize({width,height});
        const status = page.locator('.material-status-row'), header = page.locator('.table-head'), coverage = page.locator('.palette-coverage');
        assert.equal(await header.locator('.palette-coverage').count(),0);
        assert.match(await status.innerText(),language === 'en' ? /8 MATERIALS[\s\S]*Palette 2\/8 · Missing 6/ : /원료 8개[\s\S]*팔레트 2\/8 · 누락 6/);
        const h = await header.boundingBox(), s = await status.boundingBox(), c = await coverage.boundingBox();
        assert(s.y+s.height<=h.y+1 && c.y+c.height<=h.y+1,'status is above header');
        const columns = [header.locator(':scope > div').nth(0),header.locator('.palette-material-heading'),header.locator(width<=767 ? '.mobile-cas-badge' : '.cas-heading')];
        const boxes = await Promise.all(columns.map(e=>e.boundingBox()));
        assert(boxes.every(b=>b && b.y>=h.y-1 && b.y+b.height<=h.y+h.height+1),'all column labels share header row');
        assert(boxes[0].x+boxes[0].width<=boxes[1].x+1 && boxes[1].x+boxes[1].width<=boxes[2].x+1,'columns do not overlap');
        for (const e of [status,coverage,header.locator('.palette-material-heading > span')]) assert(await e.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'labels are not clipped');
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page has no horizontal overflow');
        const rowParts = await page.locator('input.parts').first().boundingBox();
        assert(Math.abs(rowParts.x+rowParts.width/2-(boxes[0].x+boxes[0].width/2))<5,'parts header stays aligned');
        await coverage.click(); await page.getByRole('heading',{name:language==='en'?'Missing Materials':'누락 원료',exact:true}).waitFor();
        await page.keyboard.press('Escape');
        if ([375,1440].includes(width)) await page.screenshot({path:`.temp/material-status-${language}-${width}.png`});
        results.push({language,width,height,status:'PASS'}); console.log('PASS',language,width,height);
      }
    }
    assert.deepEqual(errors,[]); fs.writeFileSync('.temp/material-status-results.json',JSON.stringify({results,errors},null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
