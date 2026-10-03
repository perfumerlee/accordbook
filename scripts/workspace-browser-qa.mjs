import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'

const base = process.env.WORKSPACE_QA_URL || 'https://localhost:5173'
const out = resolve('.qa/workspace')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, acceptDownloads: true })
const page = await context.newPage()
// Fixture/inspection helpers only. App and Worker assets still come from dist.
if (process.env.WORKSPACE_QA_HELPER_ORIGIN) await context.route(/\/(src|tests|node_modules|@vite|@id|@fs)\//, async route => {
  const u = new URL(route.request().url())
  const response = await route.fetch({ url: process.env.WORKSPACE_QA_HELPER_ORIGIN + u.pathname + u.search })
  await route.fulfill({ response })
})
page.setDefaultTimeout(10000)
const report = { checks: [], performance: {}, viewports: [], errors: [] }
page.on('pageerror', error => report.errors.push(error.message))
const check = (name, detail = true) => { report.checks.push({ name, detail }); console.log('PASS', name, typeof detail === 'object' ? JSON.stringify(detail) : detail) }
async function allRecords() {
  return page.evaluate(async () => {
    const { createStorage } = await import('/src/storage/storageService.ts')
    return (await createStorage()).exportData()
  })
}
async function exportFile() {
  await page.getByRole('button', { name: 'Export ▾', exact: true }).click()
  const start = performance.now()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export formula workspace', exact: true }).click()
  const download = await pending
  await download.saveAs(resolve(out, download.suggestedFilename()))
  report.performance.exportUiMs = Math.round(performance.now() - start)
  return { path: resolve(out, download.suggestedFilename()), name: download.suggestedFilename(), text: await readFile(await download.path(), 'utf8') }
}
async function input(text, name = 'qa.accordbook') {
  await page.locator('input[type=file][accept=".accordbook"]').nth(1).setInputFiles({ name, mimeType: 'application/vnd.accordbook', buffer: Buffer.from(text) })
}
try {
  await page.goto(base)
  await page.locator('main.main').waitFor()
  await page.evaluate(async () => {
    const { browserFixture } = await import('/tests/workspaceBrowserFixture.ts')
    const { createStorage } = await import('/src/storage/storageService.ts')
    const { source } = await browserFixture()
    const s = await createStorage()
    await s.workspaces.appendWorkspaceAtomic(source)
    localStorage.setItem('accordbook.activeFormulaId', source.formula.id)
    localStorage.setItem('accordbook.locale', 'en')
  })
  await page.reload()
  await page.locator('.intro-splash').waitFor({ state: 'hidden' }).catch(() => {})
  if (await page.locator('.first-start-close').isVisible()) await page.locator('.first-start-close').click()
  await page.getByRole('button', { name: /ACC-2610-001 QA Cedar/ }).click()
  const before = await allRecords()
  const source = before.formulas.find(f => f.id === 'formula-source')
  const downloaded = await exportFile()
  const file = JSON.parse(downloaded.text)
  assert.equal(file.type, 'accordbook-workspace'); assert.equal(file.formatVersion, 1)
  assert.equal(file.versions.length, 4); assert.equal(file.experiments.length, 2)
  assert.ok(file.formula.provenance); assert.ok(file.formula.releasedVersionId)
  assert.ok(file.formula.rows.every(r => !('id' in r)))
  for (const secret of ['sellerToken','buyerName','phoneSuffix','licenseRegistry','visitorId','sessionId','activeFormula','settings','"meta"','directoryHandle']) assert.ok(!downloaded.text.includes(secret), secret)
  assert.deepEqual(Object.keys(file).sort(), ['type','formatVersion','exportedAt','formula','versions','experiments'].sort())
  check('export and raw privacy inspection', { bytes: Buffer.byteLength(downloaded.text), versions: file.versions.length, experiments: file.experiments.length, variants: file.experiments.reduce((n,e)=>n+e.variants.length,0), branches:file.experiments.flatMap(e=>e.variants).filter(v=>v.parentVariantId!==null).length,evaluations:file.experiments.flatMap(e=>e.variants).reduce((n,v)=>n+(v.evaluations?.length||0),0),filename:downloaded.name })
  const start = performance.now(); await input(downloaded.text)
  await page.getByRole('status').filter({ hasText: 'Workspace imported.' }).waitFor()
  report.performance.importUiMs = Math.round(performance.now() - start)
  const after = await allRecords()
  const imported = after.formulas.find(f => !before.formulas.some(x => x.id === f.id))
  assert.ok(imported); assert.notEqual(imported.formulaId, source.formulaId)
  assert.deepEqual(after.formulas.find(f=>f.id===source.id),source)
  for(const experiment of file.experiments) {
    const restored=after.experiments.find(e=>e.parentFormulaId===imported.id&&e.name===experiment.name)
    assert.deepEqual(restored.baseSnapshot,experiment.baseSnapshot)
    assert.deepEqual(restored.variants.map(v=>v.snapshot),experiment.variants.map(v=>v.snapshot))
  }
  assert.equal(await page.locator('.formula-name').inputValue(), imported.name)
  assert.equal(await page.evaluate(()=>localStorage.getItem('accordbook.activeFormulaId')),imported.id)
  check('import activates independent Formula; source unchanged')
  await page.locator('.tm-page-action').click()
  await page.locator('.tm-item').first().waitFor()
  assert.equal(await page.locator('.tm-item.manual').count(),3)
  assert.equal(await page.locator('.tm-item.restore-point').count(),1)
  await page.screenshot({ path: resolve(out,'time-machine.png'),fullPage:true })
  check('Time Machine opens')
  await page.locator('.tm-item').filter({hasText:'Citrus revision'}).click()
  await page.getByRole('tab',{name:'COMPARE',exact:true}).click()
  const compare = await page.locator('.tm-compare').innerText()
  for(const text of ['ADDED','REMOVED','+100','-100']) assert.ok(compare.includes(text),text)
  check('Compare added/removed/increased/decreased')
  await page.getByRole('tab',{name:'VERSION',exact:true}).click()
  await page.getByRole('button',{name:'COMPOSITION',exact:true}).click()
  assert.ok((await page.locator('.tm-composition-workspace').innerText()).includes('Benzyl acetate'))
  await page.locator('.tm-composition-workspace .tm-batch-back').click()
  await page.getByRole('button',{name:'MAKE BATCH',exact:true}).click()
  await page.getByLabel('Batch amount',{exact:true}).fill('100')
  assert.ok((await page.locator('.tm-batch-table').innerText()).includes('40.00 g'))
  assert.ok((await page.locator('.tm-batch-table').innerText()).includes('20.00 g'))
  assert.deepEqual((await allRecords()).versions,after.versions)
  check('Make Batch 100 g scales 400 parts to 40 g; Versions unchanged')
  await page.locator('.tm-close').click()
  await page.locator('.tm-page-action').click()
  await page.getByRole('checkbox',{name:'Select Version 2 for Multi-Version Sheet',exact:true}).check()
  await page.getByRole('button',{name:'VIEW AS SHEET',exact:true}).click()
  await page.locator('.multi-version-sheet table').waitFor()
  const sheet = await page.locator('.multi-version-sheet table').innerText()
  for(const text of ['CURRENT','Linalool','DPG','Benzyl acetate']) assert.ok(sheet.includes(text),text)
  await page.getByRole('button',{name:'Close Multi-Version Sheet',exact:true}).click()
  check('Composition and View as Sheet render imported snapshots')
  if(await page.locator('.tm-close').isVisible()) await page.locator('.tm-close').click()
  await page.getByRole('button',{name:'Experiments',exact:true}).click()
  await page.locator('.experiment-list-item').filter({hasText:'QA Version Study'}).click()
  await page.locator('.experiment-detail').waitFor()
  assert.ok((await page.locator('.wide-workspace__context').innerText()).includes('BASE: V1'))
  await page.screenshot({path:resolve(out,'experiments.png'),fullPage:true})
  check('Experiments opens on imported Version BASE')
  await page.getByRole('button',{name:/^A1, Branch of A,/}).click()
  const branchText = await page.locator('.experiment-detail').innerText()
  for(const text of ['Fresh','Reduce','More space','Child observation']) assert.ok(branchText.includes(text),text)
  await page.getByText('View composition at evaluation',{exact:true}).click()
  const evaluationSnapshot=await page.locator('.evaluation-snapshot:visible').innerText()
  for(const text of ['Hedione','500','Linalool','DPG']) assert.ok(evaluationSnapshot.includes(text),text)
  check('Branch origin, intent, hypothesis and evaluation preserved')
  await page.getByRole('button',{name:'A, 1 Branch',exact:true}).click()
  await page.getByRole('button',{name:'Record an evaluation',exact:true}).click()
  await page.getByLabel('What did you notice?',{exact:true}).fill('QA unfinished observation')
  let downloads = 0; const countDownload = () => downloads++; page.on('download',countDownload)
  await page.getByRole('button',{name:'Export formula workspace',exact:true}).click()
  await page.locator('.experiment-detail').getByRole('alert').filter({hasText:'Save or cancel the open evaluation'}).waitFor()
  assert.equal(await page.getByLabel('What did you notice?',{exact:true}).inputValue(),'QA unfinished observation')
  assert.equal(downloads,0)
  await page.getByRole('button',{name:'Save evaluation',exact:true}).click()
  const savedDownload = page.waitForEvent('download')
  await page.getByRole('button',{name:'Export formula workspace',exact:true}).click()
  const savedFile = JSON.parse(await readFile(await (await savedDownload).path(),'utf8'))
  assert.ok(savedFile.experiments.flatMap(e=>e.variants).flatMap(v=>v.evaluations||[]).some(e=>e.observation==='QA unfinished observation'))
  page.off('download',countDownload)
  check('Evaluation draft blocks without loss; saved evaluation exports')
  await page.getByRole('button',{name:'Create next Branch from this composition',exact:true}).click()
  await page.getByPlaceholder('For example: Increase Indole slightly',{exact:true}).fill('QA branch draft')
  await page.getByRole('button',{name:'Export formula workspace',exact:true}).click()
  await page.locator('.experiment-detail').getByRole('alert').filter({hasText:'Finish or cancel the open branch draft'}).waitFor()
  assert.equal(await page.getByPlaceholder('For example: Increase Indole slightly',{exact:true}).inputValue(),'QA branch draft')
  await page.locator('.branch-intent-form').getByRole('button',{name:'Cancel',exact:true}).click()
  const branchRetry=page.waitForEvent('download')
  await page.getByRole('button',{name:'Export formula workspace',exact:true}).click()
  await branchRetry
  check('Branch draft blocks and remains editable')
  await page.getByRole('button',{name:'Back to Experiments',exact:true}).click()
  await page.locator('.experiment-list-item').filter({hasText:'QA Current Study'}).click()
  assert.ok((await page.locator('.wide-workspace__context').innerText()).includes('CURRENT'))
  await page.getByRole('button',{name:'Back to Experiments',exact:true}).click()
  await page.getByRole('button',{name:'Close Experiments',exact:true}).click()
  check('Current BASE resolves')
  const firstImport = await allRecords()
  await input(downloaded.text)
  await page.getByRole('status').filter({hasText:'Workspace imported.'}).waitFor()
  const secondImport = await allRecords()
  assert.equal(secondImport.formulas.length,firstImport.formulas.length+1)
  for(const f of firstImport.formulas) assert.deepEqual(secondImport.formulas.find(x=>x.id===f.id),f)
  check('Duplicate import creates new independent workspace')
  const broken = [
    ['malformed','{','damaged or incomplete'],
    ['wrong type',JSON.stringify({type:'other'}),'not a supported'],
    ['unsupported',JSON.stringify({...file,formatVersion:99}),'version is not supported'],
  ]
  const addFailure=(name,mutate,expected)=>{const f=structuredClone(file);mutate(f);broken.push([name,JSON.stringify(f),expected])}
  addFailure('missing BASE',f=>f.experiments.find(e=>e.baseSource.kind==='version').baseSource.sourceVersionId='missing','development history')
  addFailure('missing release',f=>f.formula.releasedVersionId='missing','development history')
  addFailure('missing parent',f=>f.experiments.find(e=>e.baseSource.kind==='version').variants[1].parentVariantId='missing','development history')
  addFailure('cycle',f=>f.experiments.find(e=>e.baseSource.kind==='version').variants[0].parentVariantId=f.experiments.find(e=>e.baseSource.kind==='version').variants[1].variantId,'development history')
  addFailure('missing evaluation',f=>f.experiments.find(e=>e.baseSource.kind==='version').variants[1].sourceEvaluationId='missing','development history')
  addFailure('tampered provenance',f=>f.formula.rows[0].parts++,'could not be verified')
  addFailure('excessive string',f=>f.formula.notes='x'.repeat(1000001),'too large')
  for(const [name,text,message] of broken){
    const prior=await allRecords();const active=await page.locator('.formula-name').inputValue()
    await input(text)
    await page.getByRole('alert').filter({hasText:message}).waitFor()
    assert.deepEqual(await allRecords(),prior,name)
    assert.equal(await page.locator('.formula-name').inputValue(),active)
    check('failure leaves all stores unchanged: '+name)
  }
  const beforeOversize=await allRecords()
  const oversizedPath=resolve(out,'oversize.accordbook')
  await writeFile(oversizedPath,Buffer.alloc(64*1024*1024+1,32))
  await page.locator('input[type=file][accept=".accordbook"]').nth(1).setInputFiles(oversizedPath)
  await page.getByRole('alert').filter({hasText:'too large'}).waitFor()
  assert.deepEqual(await allRecords(),beforeOversize)
  check('64 MiB file boundary rejects before reading; no writes')
  // Test-only, isolated-profile abort after Formula add and at the first Version add.
  const beforeAbort=await allRecords()
  await page.evaluate(()=>{
    window.qaOriginalAdd=IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add=function(...args){
      if(this.name==='versions'){this.transaction.abort();throw new DOMException('QA abort','AbortError')}
      return window.qaOriginalAdd.apply(this,args)
    }
  })
  await input(downloaded.text)
  await page.getByRole('alert').filter({hasText:'Unable to save or read'}).waitFor()
  assert.deepEqual(await allRecords(),beforeAbort)
  await page.evaluate(()=>{IDBObjectStore.prototype.add=window.qaOriginalAdd;delete window.qaOriginalAdd})
  check('Real IndexedDB abort rolls back Formula/Versions/Experiments/meta')
  const releases=await page.evaluate(async()=>{
    const {createStorage}=await import('/src/storage/storageService.ts')
    const {getReleasedVersion}=await import('/src/services/formulaRelease.ts')
    const data=await (await createStorage()).exportData()
    return data.formulas.filter(f=>f.workspaceImport).map(f=>getReleasedVersion(f,data.versions)?.versionNumber)
  })
  assert.deepEqual(releases,[3,3]);check('Both imports resolve released Version 3')
  // A real Backup download and restore through its separate input, in this isolated profile.
  await page.getByRole('button',{name:'Export ▾',exact:true}).click()
  const backupDownload=page.waitForEvent('download')
  await page.getByRole('button',{name:'Backup notebook',exact:true}).click()
  const backupText=await readFile(await (await backupDownload).path(),'utf8')
  const backup=JSON.parse(backupText)
  await input(JSON.stringify({type:'accordbook-formula',formatVersion:1,formula:{name:'Temporary before Backup restore',notes:'QA',rows:[]}}))
  await page.waitForFunction(()=>document.querySelector('.formula-name')?.value==='Temporary before Backup restore')
  page.once('dialog',dialog=>dialog.accept())
  await page.locator('input[type=file][accept=".accordbook"]').nth(0).setInputFiles({name:'backup.accordbook',mimeType:'application/vnd.accordbook',buffer:Buffer.from(backupText)})
  await page.waitForFunction(()=>document.querySelector('.formula-name')?.value!=='Temporary before Backup restore')
  const restored=await allRecords()
  for(const f of backup.data.formulas.filter(f=>f.workspaceImport)) assert.deepEqual(restored.formulas.find(x=>x.id===f.id).workspaceImport,f.workspaceImport)
  assert.equal(restored.versions.length,backup.data.versions.length)
  assert.deepEqual(restored.experiments,backup.data.experiments)
  check('Backup UI round-trip preserves metadata, experiments and Versions')
  for(const version of [1,2]){
    const prior=await allRecords()
    await input(JSON.stringify({type:'accordbook-formula',formatVersion:version,formula:{name:`Legacy ${version}`,notes:'QA legacy',rows:[{material:'Hedione',parts:1000}]},...(version===2?{provenance:{}}:{})}))
    await page.waitForFunction(name=>document.querySelector('.formula-name')?.value===name,`Legacy ${version}`)
    const next=await allRecords()
    assert.equal(next.formulas.length,prior.formulas.length+1)
    assert.deepEqual(next.versions,prior.versions);assert.deepEqual(next.experiments,prior.experiments)
    check(`Legacy FormulaFile v${version} adds only one Formula`)
  }
  // Registry is deliberately unavailable: verify routing without any authentication bypass.
  await context.route('https://script.google.com/**',route=>route.abort())
  const paid=await page.evaluate(async()=>{
    const {createPaidFormulaPackageFromContent,toPaidFormulaContent}=await import('/src/services/paidFormulaPackage.ts')
    const {browserFixture}=await import('/tests/workspaceBrowserFixture.ts')
    const {source}=await browserFixture()
    return createPaidFormulaPackageFromContent(toPaidFormulaContent(source.formula),{name:'QA buyer',phoneLast4:'1234',pin:'123456'})
  })
  const beforePaid=await allRecords()
  await input(JSON.stringify(paid))
  await page.getByRole('dialog',{name:'Import licensed formula'}).waitFor()
  assert.deepEqual(await allRecords(),beforePaid)
  await page.getByRole('dialog',{name:'Import licensed formula'}).getByRole('button',{name:/Close|Cancel/}).click()
  check('Paid package routes to protected dialog; no import without authentication')
  await page.locator('.formula-name').fill('QA '+ 'long Formula name '.repeat(12))
  await page.getByRole('button',{name:'Export ▾',exact:true}).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  assert.ok((await page.evaluate(()=>document.activeElement?.textContent)).includes('Export formula workspace'))
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('button',{name:'Export ▾',exact:true}).evaluate(e=>e===document.activeElement),true)
  check('Export keyboard Enter/Tab/Escape and focus restoration')
  for(const [width,height] of [[1440,900],[1920,1080],[1180,820],[1024,768],[820,1180],[768,1024],[430,932],[390,844],[375,812],[360,800],[1199,900],[1200,900],[767,900],[768,900]]){
    await page.setViewportSize({width,height})
    const menu=page.getByRole('button',{name:'Export ▾',exact:true})
    if(width<1200 && !await page.evaluate(()=>document.documentElement.classList.contains('responsive-drawer-open'))) {
      await page.locator('.notebook-toggle').click()
    }
    await menu.click()
    const action=page.getByRole('button',{name:'Export formula workspace',exact:true})
    await action.scrollIntoViewIfNeeded()
    const bounds=await page.locator('.export-menu.open').boundingBox()
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)
    const issue=overflow||!bounds||bounds.x<0||bounds.x+bounds.width>width+1||bounds.y<0||bounds.y+bounds.height>height+1
    report.viewports.push({width,height,result:issue?'FAIL':'PASS',overflow,bounds})
    await page.screenshot({path:resolve(out,`viewport-${width}x${height}.png`),fullPage:true})
    await page.keyboard.press('Escape')
    await page.getByRole('button',{name:'Import ▾',exact:true}).click()
    const fileChooser=page.waitForEvent('filechooser')
    await page.getByRole('button',{name:'Import .accordbook',exact:true}).click()
    await (await fileChooser).setFiles({name:'bad.accordbook',mimeType:'application/vnd.accordbook',buffer:Buffer.from('{')})
    await page.getByRole('alert').filter({hasText:'damaged or incomplete'}).waitFor()
    await page.keyboard.press('Escape')
  }
  check('Responsive export/import and file chooser matrix',report.viewports)
  assert.ok(report.viewports.every(v=>v.result==='PASS'))
  await page.setViewportSize({width:1440,height:900})
  await page.locator('.language-toggle button').nth(1).click()
  await page.getByRole('button',{name:'가져오기 ▾',exact:true}).click()
  await page.getByRole('button',{name:'.accordbook 가져오기',exact:true}).waitFor()
  await input(JSON.stringify({...file,formatVersion:99}))
  await page.getByRole('alert').filter({hasText:'지원하지 않는 작업공간 버전'}).waitFor()
  await page.screenshot({path:resolve(out,'korean-error.png'),fullPage:true})
  await page.keyboard.press('Escape')
  check('Korean menu, import hint and unsupported-version copy')
  await page.locator('.language-toggle button').nth(0).click()
  report.performance.engine=await page.evaluate(async()=>{
    const {createStorage}=await import('/src/storage/storageService.ts')
    const {WorkspaceExportCoordinator}=await import('/src/services/workspaceExportCoordinator.ts')
    const {serializeWorkspaceFile,toWorkspaceFile}=await import('/src/services/workspaceExport.ts')
    const s=await createStorage(), c=new WorkspaceExportCoordinator()
    c.register({formulaId:'formula-source',role:'formula',blockedReason:()=>undefined,flush:async()=>{}})
    const start=performance.now();const prepared=await c.prepare(s,'formula-source');const prepareMs=performance.now()-start
    if(!prepared.ready)throw Error(prepared.reason)
    const serializeStart=performance.now();const text=serializeWorkspaceFile(toWorkspaceFile(prepared.workspace));
    return {prepareMs,serializeMs:performance.now()-serializeStart,bytes:new TextEncoder().encode(text).byteLength,note:'quiescent editor; includes coherent read and validation'}
  })
  // Verify old Backup versions without metadata still normalize and restore in the browser.
  const legacyBackup=structuredClone(backup);legacyBackup.formatVersion=2
  for(const f of legacyBackup.data.formulas)delete f.workspaceImport
  delete legacyBackup.data.experiments
  page.once('dialog',dialog=>dialog.accept())
  await page.locator('input[type=file][accept=".accordbook"]').nth(0).setInputFiles({name:'legacy-backup.accordbook',mimeType:'application/vnd.accordbook',buffer:Buffer.from(JSON.stringify(legacyBackup))})
  await page.waitForFunction(()=>!document.querySelector('.formula-name')?.value.startsWith('QA long'))
  assert.ok((await allRecords()).formulas.every(f=>!f.workspaceImport))
  check('Legacy Backup v2 without workspaceImport restores')
  // Mock only the remote Drop response, exercising the production page, handoff and FormulaFile parser.
  const endpoint=await page.evaluate(async()=> (await import('/src/services/formulaDropEndpoint.ts')).getFormulaDropApiEndpoint())
  if(!endpoint) throw Error('Drop endpoint not configured for browser QA')
  const dropText=JSON.stringify({type:'accordbook-formula',formatVersion:1,formula:{name:'QA Drop handoff',notes:'Synthetic public package',rows:[{material:'Hedione',parts:1000}]}})
  await context.route(endpoint,async route=>{
    const body=route.request().postDataJSON();let result={ok:true,accepted:true}
    if(body.action==='get-drop')result={ok:true,drop:{dropId:'DROP-2026-001',slug:'2026-001',year:2026,sequence:1,title:'QA Drop',subtitle:'QA',description:'Synthetic QA',status:'ACTIVE',startAt:null,expiresAt:'2099-01-01T00:00:00.000Z'}}
    if(body.action==='create-drop-handoff')result={ok:true,handoff:{token:'a'.repeat(64),expiresAt:Date.now()+60000}}
    if(body.action==='resolve-drop-handoff')result={ok:true,dropId:'DROP-2026-001',expiresAt:Date.now()+60000}
    if(body.action==='resolve-drop-package')result={ok:true,package:{dropId:'DROP-2026-001',packageType:'accordbook-formula',fileName:'qa.accordbook',title:'QA Drop handoff',packageText:dropText}}
    await route.fulfill({json:result})
  })
  await page.goto(base+'/drop/2026-001')
  await page.locator('.formula-drop-cover-download-button').click()
  await page.getByRole('button',{name:/^IMPORT FORMULA$|^포뮬러 가져오기$/}).waitFor({timeout:20000})
  await page.getByRole('button',{name:/^IMPORT FORMULA$|^포뮬러 가져오기$/}).click()
  await page.waitForFunction(()=>document.querySelector('.formula-name')?.value==='QA Drop handoff')
  check('Drop page → OPEN IN ACCORDBOOK → FormulaFile import (mocked remote API)')
  assert.deepEqual(report.errors,[])
} catch (error) {
  report.failure = error.stack
  console.error(error)
  await page.screenshot({ path: resolve(out,'failure.png'),fullPage:true }).catch(()=>{})
  console.log('UI', (await page.locator('body').innerText()).slice(-8000))
  process.exitCode = 1
} finally {
  await writeFile(resolve(out,'report.json'), JSON.stringify(report,null,2))
  await browser.close()
}
