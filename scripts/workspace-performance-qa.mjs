import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const browser=await chromium.launch({headless:true}),context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900},acceptDownloads:true}),page=await context.newPage()
page.setDefaultTimeout(60000)
const report={exports:[],imports:[],exportTasks:[],importTasks:[],queries:[],errors:[]}
page.on('pageerror',e=>report.errors.push(e.message))
async function resetTasks(){await page.waitForTimeout(100);await page.evaluate(()=>window.tasks=[])}
async function tasks(){await page.waitForTimeout(100);return page.evaluate(()=>window.tasks)}
async function queryScale(label){
 const value=await page.evaluate(async()=>{
  const id=localStorage.getItem('accordbook.activeFormulaId'),times={}
  for(const key of ['experiments','versions']){const t=performance.now();const records=await window.s[key].listByParentFormulaId(id);times[key]={ms:performance.now()-t,count:records.length}}
  const t=performance.now();await window.s.workspaces.readWorkspace(id);times.coherentMs=performance.now()-t
  return times
 });report.queries.push({label,...value})
}
async function openExperiments(){const t=performance.now();await page.getByRole('button',{name:'Experiments',exact:true}).click();await page.locator('.experiment-list-item').last().waitFor();assert.equal(await page.locator('.experiment-list-item').count(),30);const ms=performance.now()-t;await page.reload();await page.locator('.formula-name').waitFor();await init();return ms}
async function init(){await page.evaluate(async()=>{window.s=await (await import('/src/storage/storageService.ts')).createStorage();window.tasks=[];new PerformanceObserver(l=>window.tasks.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask'});window.stages=[];(await import('/src/services/workspaceProfile.ts')).observeWorkspaceProfile((stage,ms)=>window.stages.push({stage,ms}))})}
try{
 await page.goto('https://localhost:5173');await page.locator('main.main').waitFor();if(await page.locator('.first-start-close').isVisible())await page.locator('.first-start-close').click();await init()
 const path=resolve('.qa/workspace/large.accordbook'),original=JSON.parse(await readFile(path,'utf8'))
 for(let i=0;i<10;i++){
  const previous=await page.evaluate(()=>localStorage.getItem('accordbook.activeFormulaId'));await resetTasks();const t=performance.now()
  await page.locator('input[type=file][accept=".accordbook"]').nth(1).setInputFiles(path)
  await page.waitForFunction(id=>localStorage.getItem('accordbook.activeFormulaId')!==id,previous)
  await page.getByRole('status').filter({hasText:'Workspace imported.'}).waitFor()
  report.imports.push(performance.now()-t);report.importTasks.push(await tasks());report.lastImportStages=await page.evaluate(()=>window.stages.splice(0))
  if(i===0){await queryScale('1 large');report.experimentsOneMs=await openExperiments()}
 }
 await queryScale('10 large');report.experimentsTenMs=await openExperiments()
 const before=await page.evaluate(async()=>JSON.stringify(await window.s.exportData()))
 for(let i=0;i<10;i++){
  await page.getByRole('button',{name:'Export ▾',exact:true}).click();await resetTasks();const t=performance.now(),d=page.waitForEvent('download')
  await page.getByRole('button',{name:'Export formula workspace',exact:true}).click();const downloaded=await d;await readFile(await downloaded.path(),'utf8');report.exports.push(performance.now()-t);report.exportTasks.push(await tasks());report.lastExportStages=await page.evaluate(()=>window.stages.splice(0))
 }
 assert.equal(await page.evaluate(async()=>JSON.stringify(await window.s.exportData())),before)
 report.semantic=await page.evaluate(async original=>{
  const {normalizeStressImport}=await import('/tests/workspaceStressFixture.ts'),id=localStorage.getItem('accordbook.activeFormulaId'),records=await window.s.workspaces.readWorkspace(id)
  const {WorkspaceExecution}=await import('/src/services/workspaceExecution.ts'),main=new WorkspaceExecution('main')
  try {
    await main.run({kind:'load',input:original})
    const local=await main.run({kind:'remap',displayId:'QA-2610-999',importedAt:new Date().toISOString()})
    const expected=JSON.stringify(original)
    return JSON.stringify(normalizeStressImport(records,original))===expected && JSON.stringify(normalizeStressImport(local,original))===expected
  }finally{main.dispose()}
 },original);assert.ok(report.semantic)
 await page.evaluate(async()=>{
  const {stressFixture}=await import('/tests/workspaceStressFixture.ts'),{importWorkspace}=await import('/src/services/workspaceImporter.ts'),{toWorkspaceFile}=await import('/src/services/workspaceExport.ts')
  const file=toWorkspaceFile(await stressFixture({materials:4,versions:3,points:1,experiments:2,variants:8,revisions:2}))
  for(let i=0;i<50;i++){const result=await importWorkspace(window.s,file);if(!result.ok)throw Error(result.code)}
 });await queryScale('10 large + 50 unrelated small');report.experimentsFiftyMs=await openExperiments()
 await page.evaluate(async()=>{
  const {stressFixture}=await import('/tests/workspaceStressFixture.ts'),{importWorkspace}=await import('/src/services/workspaceImporter.ts'),{toWorkspaceFile}=await import('/src/services/workspaceExport.ts')
  const file=toWorkspaceFile(await stressFixture({materials:4,versions:3,points:1,experiments:2,variants:8,revisions:2}))
  for(let i=0;i<50;i++){const result=await importWorkspace(window.s,file);if(!result.ok)throw Error(result.code)}
 });await queryScale('10 large + 100 unrelated small')
 await page.waitForTimeout(1000)
 const t=performance.now();await page.locator('.tm-page-action').click();await page.locator('.tm-item').last().waitFor();report.timeMachineMs=performance.now()-t
 assert.equal(await page.locator('.tm-item.manual').count(),200);assert.equal(await page.locator('.tm-item.restore-point').count(),20)
 assert.deepEqual(report.errors,[])
 const summary=a=>{const v=[...a].sort((a,b)=>a-b);return {min:v[0],median:(v[4]+v[5])/2,max:v.at(-1)}}
 report.summary={export:summary(report.exports),import:summary(report.imports),exportLongTask:Math.max(0,...report.exportTasks.flat()),importLongTask:Math.max(0,...report.importTasks.flat())}
 console.log(JSON.stringify(report,null,2))
}catch(e){report.failure=e.stack;console.error(e);process.exitCode=1}
finally{await writeFile('.qa/workspace/performance-after.json',JSON.stringify(report,null,2));await browser.close()}
