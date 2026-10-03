import { chromium } from 'playwright'
import { readFile,writeFile } from 'node:fs/promises'
const browser=await chromium.launch({headless:true}),context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}}),page=await context.newPage(),report=[]
try{
 await page.goto('https://localhost:5173');await page.locator('main.main').waitFor()
 await page.evaluate(async ({file,extra})=>{
  const s=await (await import('/src/storage/storageService.ts')).createStorage(),{importWorkspace}=await import('/src/services/workspaceImporter.ts')
  for(let i=0;i<10;i++){const r=await importWorkspace(s,file);if(!r.ok)throw Error(r.code);localStorage.setItem('accordbook.activeFormulaId',r.formulaId)}
  if(extra){const {stressFixture}=await import('/tests/workspaceStressFixture.ts'),{toWorkspaceFile}=await import('/src/services/workspaceExport.ts');const small=toWorkspaceFile(await stressFixture({materials:4,versions:3,points:1,experiments:2,variants:8,revisions:2}));for(let i=0;i<extra;i++){const r=await importWorkspace(s,small);if(!r.ok)throw Error(r.code)}}
 },{file:JSON.parse(await readFile('.qa/workspace/large.accordbook','utf8')),extra:Number(process.env.EXTRA_SMALL||0)})
 await page.reload();await page.locator('.formula-name').waitFor();await page.waitForTimeout(1000)
 const client=await context.newCDPSession(page);await client.send('Profiler.enable')
 await page.evaluate(()=>{window.tasks=[];new PerformanceObserver(l=>window.tasks.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask'})})
 for(let i=0;i<3;i++){
  await page.evaluate(()=>window.tasks=[]);await client.send('Profiler.start');const t=performance.now();await page.locator('.tm-page-action').click();const clickMs=performance.now()-t;await page.locator('.tm-item').last().waitFor();const ms=performance.now()-t
  const {profile}=await client.send('Profiler.stop');await writeFile(`.qa/workspace/timeline-${i}.cpuprofile`,JSON.stringify(profile))
  const costs=new Map();for(let j=0;j<profile.samples.length;j++)costs.set(profile.samples[j],(costs.get(profile.samples[j])||0)+profile.timeDeltas[j]/1000)
  report.push({ms,clickMs,longTasks:await page.evaluate(()=>window.tasks),top:profile.nodes.map(n=>({name:n.callFrame.functionName,line:n.callFrame.lineNumber+1,url:n.callFrame.url,ms:costs.get(n.id)||0})).sort((a,b)=>b.ms-a.ms).slice(0,12)})
  await page.locator('.tm-close').click();await page.locator('.tm-item').last().waitFor({state:'hidden'});await page.waitForTimeout(500)
 }
 console.log(JSON.stringify(report,null,2))
}finally{await writeFile(`.qa/workspace/timeline-profile-${process.env.EXTRA_SMALL||0}.json`,JSON.stringify(report,null,2));await browser.close()}
