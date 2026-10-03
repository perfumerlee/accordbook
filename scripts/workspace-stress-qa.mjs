import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const base=process.env.WORKSPACE_QA_URL||'https://localhost:5173',out=resolve('.qa/workspace')
await mkdir(out,{recursive:true})
const report={checks:[],measurements:{},errors:[]};const check=(name,data=true)=>{report.checks.push({name,data});console.log('PASS',name,JSON.stringify(data))}
const browser=await chromium.launch({headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900},acceptDownloads:true})
const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message))
const boot=async p=>{await p.goto(base);await p.locator('main.main').waitFor();if(await p.locator('.first-start-close').isVisible())await p.locator('.first-start-close').click()}
async function init(p){await p.evaluate(async()=>{
  const {createStorage}=await import('/src/storage/storageService.ts');window.qaStorage=await createStorage()
  window.qaImport=(await import('/src/services/workspaceImporter.ts')).importWorkspace
  window.qaFile=(await import('/src/services/workspaceExport.ts')).toWorkspaceFile
})}
try{
  await boot(page);await init(page)
  report.measurements.stages=await page.evaluate(async()=>{
    const {stressFixture}=await import('/tests/workspaceStressFixture.ts')
    const {validateWorkspaceFile}=await import('/src/services/workspaceValidation.ts')
    const {verifyWorkspaceProvenance}=await import('/src/services/workspaceProvenance.ts')
    const {remapWorkspace}=await import('/src/services/workspaceIdRemapping.ts')
    const {serializeWorkspaceFile}=await import('/src/services/workspaceExport.ts')
    const {WorkspaceExportCoordinator}=await import('/src/services/workspaceExportCoordinator.ts')
    const source=await stressFixture();await window.qaStorage.workspaces.appendWorkspaceAtomic(source)
    localStorage.setItem('accordbook.activeFormulaId',source.formula.id)
    const timings={};const timed=async(name,f)=>{const t=performance.now(),v=await f();timings[name]=performance.now()-t;return v}
    const records=await timed('coherentReadMs',()=>window.qaStorage.workspaces.readWorkspace(source.formula.id))
    const file=window.qaFile(records);await timed('validationMs',()=>validateWorkspaceFile(file))
    await timed('provenanceMs',()=>verifyWorkspaceProvenance(file))
    await timed('remappingMs',()=>remapWorkspace(file,'QA-2610-999',new Date().toISOString()))
    const c=new WorkspaceExportCoordinator();c.register({formulaId:source.formula.id,role:'formula',blockedReason:()=>undefined,flush:async()=>{}})
    const prepared=await timed('prepareMs',()=>c.prepare(window.qaStorage,source.formula.id));if(!prepared.ready)throw Error(prepared.reason)
    const text=await timed('serializeMs',()=>serializeWorkspaceFile(window.qaFile(prepared.workspace)))
    await timed('jsonParseMs',()=>JSON.parse(text));await timed('parseValidateMs',async()=> (await import('/src/services/workspaceImport.ts')).parseWorkspaceFile(text))
    timings.bytes=new TextEncoder().encode(text).byteLength
    return timings
  })
  check('large fixture and stage timings',report.measurements.stages)
  await page.reload();await page.locator('.formula-name').waitFor();await init(page)
  await page.evaluate(()=>{
    window.qaLongTasks=[];new PerformanceObserver(list=>window.qaLongTasks.push(...list.getEntries().map(x=>x.duration))).observe({type:'longtask',buffered:false})
    window.qaUrls=new Set();const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL)
    URL.createObjectURL=b=>{const u=create(b);window.qaUrls.add(u);return u};URL.revokeObjectURL=u=>{window.qaUrls.delete(u);revoke(u)}
  })
  let fileText;const exports=[]
  const before=await page.evaluate(async()=>JSON.stringify(await window.qaStorage.exportData()))
  for(let i=0;i<10;i++){
    await page.getByRole('button',{name:'Export ▾',exact:true}).click();const wait=page.waitForEvent('download');const start=performance.now()
    await page.getByRole('button',{name:'Export formula workspace',exact:true}).click();const d=await wait
    const text=await readFile(await d.path(),'utf8');exports.push(performance.now()-start)
    if(i===0){fileText=text;await d.saveAs(resolve(out,'large.accordbook'))}else assert.deepEqual({...JSON.parse(text),exportedAt:null},{...JSON.parse(fileText),exportedAt:null})
  }
  assert.equal(await page.evaluate(async()=>JSON.stringify(await window.qaStorage.exportData())),before)
  const leaks=await page.evaluate(()=>({urls:window.qaUrls.size,anchors:document.querySelectorAll('a[download]').length,longTasks:window.qaLongTasks}))
  assert.equal(leaks.urls,0);assert.equal(leaks.anchors,0)
  report.measurements.exports=exports;report.measurements.exportLongTasks=leaks.longTasks
  check('10 real downloads; identical graph; no storage mutation or URL/anchor leak',{exports,leaks})
  // Clean browser context, isolated IndexedDB, using the actual file input.
  const destination=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900},acceptDownloads:true})
  const target=await destination.newPage();target.setDefaultTimeout(60000);await boot(target);await init(target)
  await target.evaluate(()=>{
    window.qaCommitTimes=[];const append=window.qaStorage.workspaces.appendWorkspaceAtomic.bind(window.qaStorage.workspaces)
    window.qaStorage.workspaces.appendWorkspaceAtomic=async input=>{const t=performance.now();try{return await append(input)}finally{window.qaCommitTimes.push(performance.now()-t)}}
    window.qaLongTasks=[];new PerformanceObserver(list=>window.qaLongTasks.push(...list.getEntries().map(x=>x.duration))).observe({type:'longtask',buffered:false})
  })
  let start=performance.now()
  await target.locator('input[type=file][accept=".accordbook"]').nth(1).setInputFiles(resolve(out,'large.accordbook'))
  await target.getByRole('status').filter({hasText:'Workspace imported.'}).waitFor()
  report.measurements.uiImportMs=performance.now()-start
  const semantic=await target.evaluate(async originalText=>{
    const {normalizeStressImport}=await import('/tests/workspaceStressFixture.ts')
    const id=localStorage.getItem('accordbook.activeFormulaId'),records=await window.qaStorage.workspaces.readWorkspace(id),original=JSON.parse(originalText)
    return {equal:JSON.stringify(normalizeStressImport(records,original))===JSON.stringify(original),id,versions:records.versions.length,experiments:records.experiments.length,variants:records.experiments.flatMap(e=>e.variants).length,evaluations:records.experiments.flatMap(e=>e.variants).flatMap(v=>v.evaluations||[]).length}
  },fileText)
  assert.ok(semantic.equal);check('clean profile UI import and full normalized semantic equality',semantic)
  const repeated=await target.evaluate(async text=>{
    const file=JSON.parse(text),results=[],durations=[]
    for(let i=0;i<9;i++){const start=performance.now(),r=await window.qaImport(window.qaStorage,file);if(!r.ok)throw Error(r.code);results.push(r);durations.push(performance.now()-start)}
    const data=await window.qaStorage.exportData(),imports=data.formulas.filter(f=>f.workspaceImport),ids=[...data.versions.map(v=>v.versionId),...data.experiments.flatMap(e=>[e.experimentId,...e.variants.flatMap(v=>[v.variantId,...(v.evaluations||[]).map(ev=>ev.evaluationId)])])]
    return {count:imports.length,displayUnique:new Set(imports.map(f=>f.formulaId)).size,runtimeUnique:new Set(ids).size===ids.length,durations,commitMs:window.qaCommitTimes,longTasks:window.qaLongTasks,meta:data.meta}
  },fileText)
  assert.equal(repeated.count,10);assert.equal(repeated.displayUnique,10);assert.ok(repeated.runtimeUnique)
  report.measurements.imports=repeated;check('10 independent imports; global runtime IDs and display IDs unique',repeated)
  // Large-history UI remains the production Notebook.
  start=performance.now();await target.locator('.tm-page-action').click();await target.locator('.tm-item').last().waitFor();report.measurements.timeMachineMs=performance.now()-start
  assert.equal(await target.locator('.tm-item.manual').count(),200)
  assert.equal(await target.locator('.tm-item.restore-point').count(),20)
  await target.locator('.tm-item.manual').filter({hasText:'Version note 0'}).first().click()
  await target.getByRole('tab',{name:'COMPARE',exact:true}).click();await target.locator('.tm-compare').waitFor()
  await target.getByRole('tab',{name:'VERSION',exact:true}).click();await target.getByRole('button',{name:'COMPOSITION',exact:true}).click();await target.locator('.tm-composition-workspace').waitFor()
  await target.locator('.tm-composition-workspace .tm-batch-back').click();await target.getByRole('button',{name:'MAKE BATCH',exact:true}).click();await target.getByLabel('Batch amount',{exact:true}).fill('100');await target.locator('.tm-batch-table').waitFor()
  await target.locator('.tm-close').click();await target.locator('.tm-page-action').click();await target.getByRole('checkbox',{name:'Select Version 200 for Multi-Version Sheet',exact:true}).check();await target.getByRole('button',{name:'VIEW AS SHEET',exact:true}).click();await target.locator('.multi-version-sheet table').waitFor();await target.getByRole('button',{name:'Close Multi-Version Sheet',exact:true}).click()
  if(await target.locator('.tm-close').isVisible())await target.locator('.tm-close').click()
  start=performance.now();await target.getByRole('button',{name:'Experiments',exact:true}).click();await target.locator('.experiment-list-item').last().waitFor();report.measurements.experimentsMs=performance.now()-start
  assert.equal(await target.locator('.experiment-list-item').count(),30);await target.locator('.experiment-list-item').first().click();await target.locator('.rail-parent').first().click();await target.getByRole('button',{name:'Record an evaluation',exact:true}).waitFor()
  check('200 manual Versions / 20 restore-points / 30 Experiments usable in real UI',report.measurements)
  await target.screenshot({path:resolve(out,'large-experiment.png'),fullPage:true})
  await destination.close()
  assert.deepEqual(report.errors,[])
}catch(error){report.failure=error.stack;console.error(error);process.exitCode=1}
finally{await writeFile(resolve(out,'stress-report.json'),JSON.stringify(report,null,2));await browser.close()}
