import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const base='https://localhost:4173', helper='https://localhost:5173'
const browser=await chromium.launch({headless:true})
const report=process.env.WORKSPACE_ACCEPTANCE_ONLY==='legacy' ? JSON.parse(await readFile('.qa/workspace/final-acceptance.json','utf8')) : {checks:[],performance:{},scale:[],cold:[],errors:[]}
const large=JSON.parse(await readFile('.qa/workspace/large.accordbook','utf8'))
const check=(name,value=true)=>{report.checks.push({name,value});console.log('PASS',name)}
async function context(mode='normal') {
 const c=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900},acceptDownloads:true})
 // Production app/Worker assets are untouched; these routes expose only explicit QA helpers.
 await c.route(/\/(src|tests|node_modules|@vite|@id|@fs)\//,async route=>{const u=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:helper+u.pathname+u.search})})})
 await c.addInitScript(mode=>{
  window.qa={tasks:[],queries:[],sorts:[],frames:0,workers:0,live:0,mode}
  new PerformanceObserver(l=>window.qa.tasks.push(...l.getEntries().map(e=>({start:e.startTime,ms:e.duration})))).observe({type:'longtask'})
  const frame=()=>{window.qa.frames++;requestAnimationFrame(frame)};requestAnimationFrame(frame)
  const Native=window.Worker
  if(mode==='unavailable') window.Worker=undefined
  else window.Worker=class extends Native {
   constructor(...args){if(window.qa.mode==='startup')throw new Error('QA Worker initialization failure');super(...args);window.qa.workers++;window.qa.live++}
   postMessage(...args){if(window.qa.mode==='runtime'){setTimeout(()=>this.dispatchEvent(new Event('error')),0);return}return super.postMessage(...args)}
   terminate(){window.qa.live--;return super.terminate()}
  }
  const getAll=IDBIndex.prototype.getAll
  IDBIndex.prototype.getAll=function(...args){const start=performance.now(),store=this.objectStore.name,r=getAll.apply(this,args);r.addEventListener('success',()=>{const count=r.result.length;window.qa.queries.push({store,start,end:performance.now(),count,index:this.name})});return r}
  const sort=Array.prototype.sort
  Array.prototype.sort=function(...args){const version=this[0]?.versionId,start=performance.now(),result=sort.apply(this,args);if(version)window.qa.sorts.push({start,ms:performance.now()-start});return result}
 },mode)
 const p=await c.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>report.errors.push(e.message))
 await p.goto(base);await p.locator('main.main').waitFor()
 await p.locator('.first-start-close').click()
 return {c,p}
}
async function records(p){return JSON.parse(await p.evaluate(async()=>{const s=await (await import('/src/storage/storageService.ts')).createStorage();return JSON.stringify(await s.exportData())}))}
async function readSelected(p){return JSON.parse(await p.evaluate(async()=>{const s=await (await import('/src/storage/storageService.ts')).createStorage();return JSON.stringify(await s.workspaces.readWorkspace(localStorage.getItem('accordbook.activeFormulaId')))}))}
async function mark(p){await p.waitForTimeout(100);return p.evaluate(()=>({start:performance.now(),frames:window.qa.frames,workers:window.qa.workers}))}
async function finish(p,m,ms){await p.waitForTimeout(100);return p.evaluate(({m,ms})=>({ms,longTask:Math.max(0,...window.qa.tasks.filter(t=>t.start>=m.start).map(t=>t.ms)),frames:window.qa.frames-m.frames,workers:window.qa.workers-m.workers,live:window.qa.live}),{m,ms})}
async function input(p,file){await p.locator('input[type=file][accept=".accordbook"]').nth(1).setInputFiles({name:'acceptance.accordbook',mimeType:'application/vnd.accordbook',buffer:Buffer.from(JSON.stringify(file))})}
async function importFile(p,file){const old=await p.evaluate(()=>localStorage.getItem('accordbook.activeFormulaId')),m=await mark(p),t=performance.now();await input(p,file);await p.waitForFunction(id=>localStorage.getItem('accordbook.activeFormulaId')!==id,old);await p.getByRole('status').filter({hasText:'Workspace imported.'}).waitFor();const r=await finish(p,m,performance.now()-t);assert.equal(r.live,0);assert.ok(r.frames>0);return r}
async function exportFile(p){await p.getByRole('button',{name:'Export ▾',exact:true}).click();const m=await mark(p),t=performance.now(),pending=p.waitForEvent('download');await p.getByRole('button',{name:'Export formula workspace',exact:true}).click();const d=await pending,ms=performance.now()-t,text=await readFile(await d.path(),'utf8');return {file:JSON.parse(text),text,timing:await finish(p,m,ms)}}
async function timeline(p,count=220){const m=await mark(p),t=performance.now();await p.locator('.tm-page-action').click();await p.locator('.tm-item').last().waitFor();assert.equal(await p.locator('.tm-item').count(),count);const result=await finish(p,m,performance.now()-t);result.detail=await p.evaluate(()=>({queries:window.qa.queries.filter(q=>q.store==='versions'),sorts:window.qa.sorts}));await p.locator('.tm-close').click();await p.locator('.tm-item').last().waitFor({state:'hidden'});return result}
async function experiments(p,count=30){const m=await mark(p),t=performance.now();await p.getByRole('button',{name:'Experiments',exact:true}).click();await p.locator('.experiment-list-item').last().waitFor();assert.equal(await p.locator('.experiment-list-item').count(),count);const r=await finish(p,m,performance.now()-t);await p.getByRole('button',{name:'Close Experiments',exact:true}).click();return r}
async function queryScale(p,label){const measurements=await p.evaluate(async()=>{
 const s=await (await import('/src/storage/storageService.ts')).createStorage(),id=localStorage.getItem('accordbook.activeFormulaId'),result={}
 for(const key of ['versions','experiments']){const t=performance.now(),v=await s[key].listByParentFormulaId(id);result[key]={ms:performance.now()-t,count:v.length}}
 return result
});assert.equal(measurements.versions.count,220);assert.equal(measurements.experiments.count,30);report.scale.push({label,...measurements,timeMachine:await timeline(p),experimentsOpen:await experiments(p)})}
async function semantic(p,original){const normalized=await p.evaluate(async text=>{const original=JSON.parse(text),s=await (await import('/src/storage/storageService.ts')).createStorage(),records=await s.workspaces.readWorkspace(localStorage.getItem('accordbook.activeFormulaId'));return JSON.stringify((await import('/tests/workspaceStressFixture.ts')).normalizeStressImport(records,original))},JSON.stringify(original));assert.deepEqual(JSON.parse(normalized),original)}
const summarize=a=>{const s=a.map(v=>v.ms).sort((a,b)=>a-b);return {min:s[0],median:s.length%2?s[Math.floor(s.length/2)]:(s[s.length/2-1]+s[s.length/2])/2,max:s.at(-1),longTask:Math.max(...a.map(v=>v.longTask))}}
try {
 if(process.env.WORKSPACE_ACCEPTANCE_ONLY!=='legacy') {
 const normal=await context()
 const fresh=await normal.p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('accordbook');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction(['versions','experiments']);const v={version:db.version,indexes:['versions','experiments'].map(s=>t.objectStore(s).index('parentFormulaId').keyPath)};db.close();resolve(v)}}))
 assert.deepEqual(fresh,{version:4,indexes:['parentFormulaId','parentFormulaId']});check('fresh DB v4 and indexes',fresh)
 // Create an ordinary Formula using the production sidebar action.
 const create=normal.p.getByRole('button',{name:'+ New formula',exact:true});
 const prior=await normal.p.evaluate(()=>localStorage.getItem('accordbook.activeFormulaId'))
 await create.first().click();await normal.p.waitForFunction(id=>localStorage.getItem('accordbook.activeFormulaId')!==id,prior)
 await normal.p.locator('.formula-name').fill('First-run acceptance Formula');await normal.p.locator('.formula-name').blur()
 const first=await exportFile(normal.p);assert.equal(first.file.formula.name,'First-run acceptance Formula');await importFile(normal.p,first.file);check('fresh normal Formula creation and UI export/import')
 const normalFile=await normal.p.evaluate(async()=>{const {stressFixture}=await import('/tests/workspaceStressFixture.ts');return (await import('/src/services/workspaceExport.ts')).toWorkspaceFile(await stressFixture({materials:30,versions:20,points:3,experiments:3,variants:8,revisions:20}))})
 report.performance.normalImport=[];report.performance.normalExport=[]
 for(let i=0;i<5;i++){report.performance.normalImport.push(await importFile(normal.p,normalFile));report.performance.normalExport.push((await exportFile(normal.p)).timing)}
 report.normal={rows:30,manual:20,points:3,experiments:3,timeMachine:await timeline(normal.p,23),experimentsOpen:await experiments(normal.p,3)};await semantic(normal.p,normalFile);check('normal Workspace round-trip');await normal.c.close()

 // Exact Phase 7 file seeds a source; its production download is the receiving input.
 const source=await context();await source.p.evaluate(async file=>{const s=await (await import('/src/storage/storageService.ts')).createStorage();const formula={...file.formula,rows:file.formula.rows.map((r,i)=>({...r,id:'seed-'+i}))};await s.workspaces.appendWorkspaceAtomic({formula,versions:file.versions,experiments:file.experiments});localStorage.setItem('accordbook.activeFormulaId',formula.id)},large);await source.p.reload();await source.p.locator('.formula-name').waitFor()
 report.performance.largeExport=[];let downloaded
 for(let i=0;i<5;i++){const e=await exportFile(source.p);report.performance.largeExport.push(e.timing);assert.deepEqual({...e.file,exportedAt:large.exportedAt},large);downloaded=e.file;console.log('large export',i,Math.round(e.timing.ms))}
 const receiver=await context(),p=receiver.p;report.performance.largeImport=[]
 for(let i=0;i<10;i++){const r=await importFile(p,downloaded);assert.equal(r.workers,1);if(i<5)report.performance.largeImport.push(r);console.log('large import',i,Math.round(r.ms));if(i===0){await semantic(p,downloaded);await queryScale(p,'1 large')}}
 check('large source export → clean receiving context import; semantic equality')
 const selected=await p.evaluate(()=>localStorage.getItem('accordbook.activeFormulaId'));await queryScale(p,'10 large')
 const independent=await p.evaluate(async()=>{const s=await (await import('/src/storage/storageService.ts')).createStorage(),all=await s.exportData(),formulas=all.formulas.filter(f=>f.workspaceImport);return {count:formulas.length,unique:[formulas.map(f=>f.id),formulas.map(f=>f.formulaId),formulas.flatMap(f=>f.rows.map(r=>r.id)),all.versions.map(v=>v.versionId),all.experiments.map(e=>e.experimentId),all.experiments.flatMap(e=>e.variants.map(v=>v.variantId))].every(list=>new Set(list).size===list.length)}})
 assert.deepEqual(independent,{count:10,unique:true});check('ten duplicate imports independent runtime/display/history IDs')
 const privacy=(await exportFile(p)).text
 assert.deepEqual(Object.keys(JSON.parse(privacy)).sort(),['type','formatVersion','exportedAt','formula','versions','experiments'].sort())
 for(const key of ['settings','language','meta','sellerToken','pin','buyerName','visitorId','sessionId','activeFormulaId','directoryHandle','appsScriptSecret','archive'])assert.ok(!privacy.includes('"'+key+'"'),key)
 check('large raw export privacy boundary')
 const small=JSON.parse(await readFile('.qa/workspace/accordbook-qa-cedar-citrus-study-complete-development-history.accordbook','utf8'))
 for(let i=0;i<50;i++)await importFile(p,small)
 await p.evaluate(id=>localStorage.setItem('accordbook.activeFormulaId',id),selected);await p.reload();await p.locator('.formula-name').waitFor();await queryScale(p,'10 large + 50 small')
 // IDB queries happen on Formula activation (before opening the panel). Report separately.
 for(let i=0;i<5;i++){
  await p.reload();await p.locator('.formula-name').waitFor();const cold=await timeline(p),warm=await timeline(p)
  report.cold.push({cold,warm});console.log('cold',i,Math.round(cold.ms),'warm',Math.round(warm.ms))
 }
 report.performance.timeMachineCold=report.cold.map(r=>r.cold);report.performance.timeMachineWarm=report.cold.map(r=>r.warm)
 report.performance.experiments=[];for(let i=0;i<5;i++)report.performance.experiments.push(await experiments(p))
 check('five cold-start and warm Time Machine runs')
 await receiver.c.close();await source.c.close()

 for(const mode of ['startup','runtime','unavailable']){
  const {c,p}=await context(mode),before=await records(p)
  if(mode==='unavailable'){const timing=await importFile(p,large);await semantic(p,large);const e=await exportFile(p);assert.equal(e.file.versions.length,220);report.fallback={import:timing,export:e.timing};check('Worker unavailable fallback semantics')}
  else {await input(p,large);await p.getByRole('alert').filter({hasText:'Unable to save or read'}).waitFor();assert.deepEqual(await records(p),before);assert.equal(await p.evaluate(()=>window.qa.live),0);await p.evaluate(()=>window.qa.mode='normal');await importFile(p,small);check('Worker '+mode+' failure rollback, cleanup and UI retry')}
  await c.close()
 }
 for(const mode of ['normal','unavailable']){
  const {c,p}=await context(mode),before=await records(p)
  for(const field of ['revision','fingerprint','checkpoint']){
   const bad=structuredClone(large),prov=bad.formula.provenance
   if(field==='revision')prov.revisions[0].revisionHash='0'.repeat(64)
   if(field==='fingerprint')prov.currentFingerprint='0'.repeat(64)
   if(field==='checkpoint')prov.checkpoint.formulaSnapshot='[]'
   await input(p,bad);await p.getByRole('alert').filter({hasText:'could not be verified'}).waitFor();assert.deepEqual(await records(p),before)
  }
  check(mode+' provenance revision/fingerprint/checkpoint reject before writes');await c.close()
 }
 }
 {
 const {c,p}=await context('startup')
 for(const version of [1,2]){await input(p,{type:'accordbook-formula',formatVersion:version,formula:{name:'Legacy acceptance '+version,notes:'Legacy QA',rows:[{material:'Hedione',parts:1000}]},...(version===2?{provenance:{}}:{})});await p.waitForFunction(name=>document.querySelector('.formula-name')?.value===name,'Legacy acceptance '+version)}
 const paid=await p.evaluate(async()=>{const {source}=await (await import('/tests/workspaceBrowserFixture.ts')).browserFixture();const m=await import('/src/services/paidFormulaPackage.ts');const content=m.toPaidFormulaContent(source.formula);if('versions' in content||'experiments' in content)throw Error('private history leak');return m.createPaidFormulaPackageFromContent(content,{name:'QA',phoneLast4:'1234',pin:'123456'})})
 await input(p,paid);await p.getByRole('dialog',{name:'Import licensed formula'}).waitFor();assert.equal(await p.evaluate(()=>window.qa.workers),0);check('legacy v1/v2 and Licensed bypass unavailable Workspace Worker');await c.close()
 }
 for(const [key,value] of Object.entries(report.performance))if(Array.isArray(value))report.performance[key]={runs:value,summary:summarize(value)}
 assert.deepEqual(report.errors,[]);delete report.failure;report.result='PASS';console.log(JSON.stringify(Object.fromEntries(Object.entries(report.performance).map(([k,v])=>[k,v.summary])),null,2))
} catch(error){report.failure=error.stack;report.result='FAIL';console.error(error);process.exitCode=1}
finally{await writeFile(resolve('.qa/workspace/final-acceptance.json'),JSON.stringify(report,null,2));await browser.close()}
