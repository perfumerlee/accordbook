import { chromium } from 'playwright'
import { readFile,writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const browser=await chromium.launch({headless:true}),c=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}}),p=await c.newPage(),report={runs:[],errors:[]}
p.on('pageerror',e=>report.errors.push(e.message));p.setDefaultTimeout(60000)
await c.route(/\/(src|tests|node_modules|@vite|@id|@fs)\//,async route=>{const u=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:'https://localhost:5173'+u.pathname+u.search})})})
await c.addInitScript(()=>{
 window.measure={queries:[],preparationMs:0,tasks:[],clickAt:0,domAt:0,paintAt:0,introSeen:false,introHiddenAt:0}
 const get=IDBIndex.prototype.getAll
 IDBIndex.prototype.getAll=function(...args){const t=performance.now(),store=this.objectStore.name,r=get.apply(this,args);r.addEventListener('success',()=>{const count=r.result.length;window.measure.queries.push({store,start:t,end:performance.now(),count})});return r}
 const sort=Array.prototype.sort
 Array.prototype.sort=function(...args){const yes=this[0]?.versionId,t=performance.now(),result=sort.apply(this,args);if(yes)window.measure.preparationMs+=performance.now()-t;return result}
 const descriptor=Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype,'format')
 Object.defineProperty(Intl.DateTimeFormat.prototype,'format',{...descriptor,get(){const bound=descriptor.get.call(this);return (...args)=>{const t=performance.now();try{return bound(...args)}finally{window.measure.preparationMs+=performance.now()-t}}}})
 new PerformanceObserver(l=>window.measure.tasks.push(...l.getEntries().map(e=>({start:e.startTime,ms:e.duration})))).observe({type:'longtask'})
 addEventListener('click',e=>{if(e.target.closest?.('.tm-page-action')){window.measure.clickAt=performance.now();window.measure.domAt=0;window.measure.paintAt=0}},true)
 new MutationObserver(()=>{const m=window.measure;if(document.querySelector('.accordbook-intro'))m.introSeen=true;else if(m.introSeen&&!m.introHiddenAt)m.introHiddenAt=performance.now();if(m.clickAt&&!m.domAt&&document.querySelectorAll('.tm-item').length===220){m.domAt=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>m.paintAt=performance.now()))}}).observe(document,{childList:true,subtree:true})
})
try {
 await p.goto('https://localhost:4173');await p.locator('.first-start-close').click()
 const file=JSON.parse(await readFile('.qa/workspace/large.accordbook','utf8'))
 await p.evaluate(async text=>{
  const file=JSON.parse(text)
  const s=await (await import('/src/storage/storageService.ts')).createStorage(),{importWorkspace}=await import('/src/services/workspaceImporter.ts')
  for(let i=0;i<10;i++){const r=await importWorkspace(s,file);if(!r.ok)throw Error(r.code);localStorage.setItem('accordbook.activeFormulaId',r.formulaId)}
  const {stressFixture}=await import('/tests/workspaceStressFixture.ts'),{toWorkspaceFile}=await import('/src/services/workspaceExport.ts'),small=toWorkspaceFile(await stressFixture({materials:4,versions:3,points:1,experiments:2,variants:8,revisions:2}))
  for(let i=0;i<50;i++){const r=await importWorkspace(s,small);if(!r.ok)throw Error(r.code)}
 },JSON.stringify(file))
 const client=await c.newCDPSession(p);await client.send('Performance.enable')
 for(let i=0;i<5;i++){
  await p.reload();await p.locator('.formula-name').waitFor()
  const run={}
  for(const kind of ['cold','warm']){
   const before=Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]))
   const prep=await p.evaluate(()=>window.measure.preparationMs),t=performance.now()
   await p.locator('.tm-page-action').click();await p.locator('.tm-item').last().waitFor();await p.waitForFunction(()=>window.measure.paintAt>0)
   const ms=performance.now()-t,after=Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]))
   const m=await p.evaluate(()=>window.measure)
   run[kind]={visibleMs:ms,introHiddenAt:m.introHiddenAt,clickAt:m.clickAt,versionQueries:m.queries.filter(q=>q.store==='versions').map(q=>({ms:q.end-q.start,count:q.count,completedBeforeClick:q.end<=m.clickAt})),preparationSortAndDateMs:m.preparationMs-prep,clickToDomMs:m.domAt-m.clickAt,clickToPaintMs:m.paintAt-m.clickAt,scriptCpuMs:1000*(after.ScriptDuration-before.ScriptDuration),layoutAndStyleMs:1000*((after.LayoutDuration-before.LayoutDuration)+(after.RecalcStyleDuration-before.RecalcStyleDuration)),maxLongTask:Math.max(0,...m.tasks.filter(x=>x.start>=m.clickAt).map(x=>x.ms))}
   assert.equal(await p.locator('.tm-item').count(),220);await p.locator('.tm-close').click();await p.locator('.tm-item').last().waitFor({state:'hidden'})
  }
  report.runs.push(run);console.log(JSON.stringify(run))
 }
 assert.deepEqual(report.errors,[]);report.result='PASS'
}catch(error){report.failure=error.stack;report.result='FAIL';console.error(error);process.exitCode=1}
finally{await writeFile('.qa/workspace/cold-acceptance.json',JSON.stringify(report,null,2));await browser.close()}
