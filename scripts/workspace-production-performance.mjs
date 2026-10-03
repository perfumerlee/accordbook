import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const browser=await chromium.launch({headless:true}),context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900},acceptDownloads:true}),page=await context.newPage()
const report={imports:[],exports:[],importTasks:[],exportTasks:[],errors:[]},url='https://localhost:4173'
page.on('pageerror',e=>report.errors.push(e.message));page.setDefaultTimeout(60000)
async function clear(){await page.waitForTimeout(100);await page.evaluate(()=>window.tasks=[])}
async function tasks(){await page.waitForTimeout(100);return page.evaluate(()=>window.tasks)}
try{
 await page.goto(url);await page.locator('main.main').waitFor();await page.locator('.first-start-close').click()
 await page.evaluate(()=>{window.tasks=[];new PerformanceObserver(l=>window.tasks.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask'})})
 for(let i=0;i<10;i++){
  await clear();const previous=await page.evaluate(()=>localStorage.getItem('accordbook.activeFormulaId')),t=performance.now()
  await page.locator('input[type=file][accept=".accordbook"]').nth(1).setInputFiles(resolve('.qa/workspace/large.accordbook'))
  await page.waitForFunction(id=>localStorage.getItem('accordbook.activeFormulaId')!==id,previous);await page.getByRole('status').filter({hasText:'Workspace imported.'}).waitFor()
  report.imports.push(performance.now()-t);report.importTasks.push(await tasks())
 }
 for(let i=0;i<10;i++){
  await page.getByRole('button',{name:'Export ▾',exact:true}).click();await clear();const t=performance.now(),wait=page.waitForEvent('download')
  await page.getByRole('button',{name:'Export formula workspace',exact:true}).click();const d=await wait;const file=JSON.parse(await readFile(await d.path(),'utf8'));report.exports.push(performance.now()-t);report.exportTasks.push(await tasks())
  assert.equal(file.versions.length,220);assert.equal(file.experiments.length,30);assert.equal(file.experiments.flatMap(e=>e.variants).length,540);assert.ok(file.formula.provenance)
 }
 let t=performance.now();await page.locator('.tm-page-action').click();await page.locator('.tm-item').last().waitFor();report.timeMachineMs=performance.now()-t;assert.equal(await page.locator('.tm-item.manual').count(),200)
 await page.locator('.tm-close').click();await page.locator('.tm-item').last().waitFor({state:'hidden'})
 t=performance.now();await page.getByRole('button',{name:'Experiments',exact:true}).click();await page.locator('.experiment-list-item').last().waitFor();report.experimentsMs=performance.now()-t;assert.equal(await page.locator('.experiment-list-item').count(),30)
 const summary=a=>{const v=[...a].sort((a,b)=>a-b);return {min:v[0],median:(v[4]+v[5])/2,max:v.at(-1)}}
 report.summary={import:summary(report.imports),export:summary(report.exports),importLongTask:Math.max(0,...report.importTasks.flat()),exportLongTask:Math.max(0,...report.exportTasks.flat())}
 const selected=await page.evaluate(()=>localStorage.getItem('accordbook.activeFormulaId'))
 await page.reload();await page.locator('.formula-name').waitFor()
 for(let i=0;i<50;i++){
  const previous=await page.evaluate(()=>localStorage.getItem('accordbook.activeFormulaId'))
  await page.locator('input[type=file][accept=".accordbook"]').nth(1).setInputFiles(resolve('.qa/workspace/accordbook-qa-cedar-citrus-study-complete-development-history.accordbook'))
  await page.waitForFunction(id=>localStorage.getItem('accordbook.activeFormulaId')!==id,previous)
 }
 await page.evaluate(id=>localStorage.setItem('accordbook.activeFormulaId',id),selected);await page.reload();await page.locator('.formula-name').waitFor();await page.waitForTimeout(1000)
 await page.evaluate(()=>{window.tasks=[];new PerformanceObserver(l=>window.tasks.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask'})})
 t=performance.now();await page.locator('.tm-page-action').click();await page.locator('.tm-item').last().waitFor();report.timeMachineAfter50Ms=performance.now()-t;report.timeMachineAfter50Tasks=await tasks()
 await page.locator('.tm-close').click();await page.locator('.tm-item').last().waitFor({state:'hidden'})
 t=performance.now();await page.getByRole('button',{name:'Experiments',exact:true}).click();await page.locator('.experiment-list-item').last().waitFor();report.experimentsAfter50Ms=performance.now()-t;assert.equal(await page.locator('.experiment-list-item').count(),30)
 // Real Chromium v3 -> v4, with all six stores populated before the app starts.
 const migrated=await browser.newContext({ignoreHTTPSErrors:true,acceptDownloads:true}),p=await migrated.newPage()
 await p.goto(url+'/favicon.ico')
 const source=JSON.parse(await readFile('.qa/workspace/large.accordbook','utf8'))
 await p.evaluate(async file=>{
  await new Promise((resolve,reject)=>{const r=indexedDB.open('accordbook',3);r.onupgradeneeded=()=>{for(const s of ['formulas','archive','versions','experiments','settings','meta'])r.result.createObjectStore(s)};r.onerror=()=>reject(r.error);r.onsuccess=()=>{
   const db=r.result,tx=db.transaction(['formulas','archive','versions','experiments','settings','meta'],'readwrite'),formula={...file.formula,rows:file.formula.rows.map((row,i)=>({...row,id:'runtime-'+i}))}
   tx.objectStore('formulas').put(formula,formula.id);tx.objectStore('archive').put({...formula,id:'archived'},'archived')
   file.versions.forEach(v=>tx.objectStore('versions').put(v,v.versionId));file.experiments.forEach(e=>tx.objectStore('experiments').put(e,e.experimentId));tx.objectStore('settings').put({formulaIdPrefix:'QA',language:'en'},'current');tx.objectStore('meta').put(400,'QA-2610')
   tx.oncomplete=()=>{db.close();localStorage.setItem('accordbook.activeFormulaId',formula.id);resolve()};tx.onabort=()=>reject(tx.error)
  }})
 },source)
 await p.goto(url);await p.locator('.formula-name').waitFor()
 const data=await p.evaluate(async()=>new Promise((resolve,reject)=>{const r=indexedDB.open('accordbook',4);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['formulas','archive','versions','experiments','settings','meta'],'readonly'),result={version:db.version,indexes:[],counts:{},meta:null};for(const name of ['versions','experiments'])result.indexes.push(tx.objectStore(name).index('parentFormulaId').keyPath);for(const name of ['formulas','archive','versions','experiments'])tx.objectStore(name).count().onsuccess=e=>result.counts[name]=e.target.result;tx.objectStore('meta').get('QA-2610').onsuccess=e=>result.meta=e.target.result;tx.oncomplete=()=>{db.close();resolve(result)}}}))
 assert.deepEqual(data,{version:4,indexes:['parentFormulaId','parentFormulaId'],counts:{formulas:1,archive:1,versions:220,experiments:30},meta:400});report.migration=data
 await p.getByRole('button',{name:'Export ▾',exact:true}).click();const download=p.waitForEvent('download');await p.getByRole('button',{name:'Export formula workspace',exact:true}).click();const restored=JSON.parse(await readFile(await (await download).path(),'utf8'));assert.deepEqual({...restored,exportedAt:null},{...source,exportedAt:null})
 await p.locator('input[type=file][accept=".accordbook"]').nth(1).setInputFiles(resolve('.qa/workspace/large.accordbook'));await p.getByRole('status').filter({hasText:'Workspace imported.'}).waitFor();report.migrationRoundTrip=true
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));await migrated.close()
}catch(e){report.failure=e.stack;console.error(e);process.exitCode=1}
finally{await writeFile('.qa/workspace/production-performance.json',JSON.stringify(report,null,2));await browser.close()}
