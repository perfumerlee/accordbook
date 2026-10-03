import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const browser=await chromium.launch({headless:true}),context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}})
const a=await context.newPage(),b=await context.newPage(),report={checks:[]}
const check=(name,data=true)=>{report.checks.push({name,data});console.log('PASS',name,JSON.stringify(data))}
async function setup(page){await page.goto('https://localhost:5173');await page.locator('main.main').waitFor();await page.evaluate(async()=>{
  window.s=await (await import('/src/storage/storageService.ts')).createStorage()
  window.importer=(await import('/src/services/workspaceImporter.ts')).importWorkspace
  window.toFile=(await import('/src/services/workspaceExport.ts')).toWorkspaceFile
  window.source=await (await import('/tests/workspaceStressFixture.ts')).stressFixture({materials:4,versions:3,points:1,experiments:2,variants:8,revisions:20})
  window.file=window.toFile(window.source)
})}
try{
  await setup(a)
  await a.evaluate(async()=>{await window.s.workspaces.appendWorkspaceAtomic(window.source);localStorage.setItem('accordbook.activeFormulaId',window.source.formula.id)})
  await setup(b);await setup(a)
  for(const p of [a,b])await p.evaluate(()=>{window.qaWrites=[];const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){if(this.name==='formulas')window.qaWrites.push({name:value.name,id:value.id,time:Date.now()});return put.call(this,value,...args)}})
  const importBoth=await Promise.all([a,b].map(p=>p.evaluate(async()=>window.importer(window.s,window.file))))
  assert.ok(importBoth.every(r=>r.ok));assert.notEqual(importBoth[0].displayFormulaId,importBoth[1].displayFormulaId)
  check('two-tab concurrent imports yield distinct display IDs',importBoth.map(r=>r.displayFormulaId))
  // Actual editor autosave in A, coherent collector in B.
  await a.locator('.formula-name').fill('Saved from Tab A')
  await a.evaluate(async()=>{const until=performance.now()+10000;while((await window.s.formulas.get('stress-source')).name!=='Saved from Tab A'){if(performance.now()>until)throw Error('autosave timeout');await new Promise(r=>setTimeout(r,50))}})
  const saved=await b.evaluate(async()=> (await (await import('/src/services/workspaceCollector.ts')).collectWorkspace(window.s,'stress-source')))
  assert.ok(saved.ok);assert.equal(saved.workspace.formula.name,'Saved from Tab A')
  check('Tab B reads Tab A completed save')
  await a.evaluate(()=>{window.qaTimer=setTimeout;window.setTimeout=(fn,ms,...args)=>window.qaTimer(fn,ms===250?60000:ms,...args)})
  await a.locator('.formula-name').fill('Unsaved in Tab A')
  const unsaved=await b.evaluate(async()=> (await (await import('/src/services/workspaceCollector.ts')).collectWorkspace(window.s,'stress-source')))
  assert.ok(unsaved.ok);assert.equal(unsaved.workspace.formula.name,'Saved from Tab A')
  assert.equal(await a.locator('.formula-name').inputValue(),'Unsaved in Tab A')
  await a.evaluate(()=>{window.setTimeout=window.qaTimer})
  check('other-tab UI-only edit remains outside snapshot, draft preserved')
  const races=[]
  for(let i=0;i<12;i++){
    const [_,read]=await Promise.all([
      a.evaluate(async n=>{const e=await window.s.experiments.get('experiment-0');e.name=`Atomic experiment ${n}`;e.variants[0].note=`marker ${n}`;await window.s.experiments.save(e);const v={...window.source.versions[0],versionId:`race-version-${n}`,versionNumber:100+n,note:`race-${n}`};await window.s.versions.save(v)},i),
      b.evaluate(async()=>window.s.workspaces.readWorkspace('stress-source'))
    ])
    const e=read.experiments.find(e=>e.experimentId==='experiment-0')
    if(e.name.startsWith('Atomic experiment '))assert.equal(e.variants[0].note,'marker '+e.name.split(' ').at(-1))
    races.push(read.versions.length)
  }
  check('12 Version/Experiment write races return internally consistent records',races)
  const many=await b.evaluate(async()=>{
    await window.s.settings.save({formulaIdPrefix:'QA',language:'en'})
    const date=new Date(),month=String(date.getFullYear()).slice(-2)+String(date.getMonth()+1).padStart(2,'0')
    const db=await (await import('/src/storage/database.ts')).openDatabase()
    for(let i=1;i<=400;i++){const f={...window.source.formula,id:`unrelated-${i}`,formulaId:`QA-${month}-${String(i).padStart(3,'0')}`,name:`Unrelated ${i}`};delete f.releasedVersionId;await db.put(i>200?'archive':'formulas',f.id,f)}
    const before=JSON.stringify((await window.s.exportData()).formulas.filter(f=>f.id.startsWith('unrelated-')))
    const start=performance.now(),r=await window.importer(window.s,window.file)
    return {r,ms:performance.now()-start,unchanged:before===JSON.stringify((await window.s.exportData()).formulas.filter(f=>f.id.startsWith('unrelated-')))}
  })
  assert.ok(many.r.ok);assert.ok(many.r.displayFormulaId.endsWith('-401'));assert.ok(many.unchanged)
  check('200 active + 200 Archive collisions skipped without unrelated writes',many)
  const retry=await b.evaluate(async()=>{
    const original=window.s.workspaces.appendWorkspaceAtomic.bind(window.s.workspaces)
    const before=JSON.stringify(await window.s.exportData());let attempts=0
    // Exercise the real transaction CAS, avoiding class identity artifacts from dev-server HMR.
    window.s.workspaces.appendWorkspaceAtomic=async input=>{attempts++;return original({...input,metaUpdate:{...input.metaUpdate,expectedValue:input.metaUpdate.expectedValue-1}})}
    const result=await window.importer(window.s,window.file);window.s.workspaces.appendWorkspaceAtomic=original
    return {result,attempts,unchanged:before===JSON.stringify(await window.s.exportData())}
  })
  assert.equal(retry.result.code,'concurrent-allocation');assert.equal(retry.attempts,4);assert.ok(retry.unchanged)
  check('bounded CAS retry has no writes',retry)
  const quota=await b.evaluate(async()=>{
    const before=JSON.stringify(await window.s.exportData()),add=IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add=function(...args){if(this.name==='versions')throw new DOMException('Synthetic quota exhausted','QuotaExceededError');return add.apply(this,args)}
    const failed=await window.importer(window.s,window.file)
    IDBObjectStore.prototype.add=add
    const unchanged=before===JSON.stringify(await window.s.exportData()),retry=await window.importer(window.s,window.file)
    return {failed,unchanged,retry}
  })
  assert.equal(quota.failed.ok,false);assert.ok(quota.unchanged);assert.ok(quota.retry.ok)
  check('simulated quota failure rolls back and retry succeeds',quota)
  await a.locator('.formula-name').fill('Saved from Tab A')
  await a.waitForTimeout(1000)
  // Closing a tab with an active real transaction must not leave a partial append.
  const beforeClose=await b.evaluate(async()=>JSON.stringify(await window.s.exportData()))
  await a.evaluate(()=>{
    window.qaCommitReached=false;const add=IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add=function(...args){
      if(this.name==='versions'){
        window.qaCommitReached=true
        const store=this;const keepAlive=()=>{try{store.get('qa-keep-alive').onsuccess=keepAlive}catch{}}
        keepAlive();return store.get('qa-never-added')
      }
      return add.apply(this,args)
    }
    void window.importer(window.s,window.file)
  })
  await a.waitForFunction(()=>window.qaCommitReached)
  await a.close()
  const afterClose=await b.evaluate(async()=>JSON.stringify(await window.s.exportData()))
  assert.equal(afterClose,beforeClose)
  check('tab close during live transaction aborts all import records')
}catch(error){report.failure=error.stack;console.error(error);process.exitCode=1}
finally{await writeFile('.qa/workspace/concurrency-report.json',JSON.stringify(report,null,2));await browser.close()}
