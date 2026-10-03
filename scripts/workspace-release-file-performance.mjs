import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// File-path input avoids counting Playwright's large inline-buffer protocol transfer.
const browser=await chromium.launch({headless:true}),c=await browser.newContext({ignoreHTTPSErrors:true,acceptDownloads:true,viewport:{width:1440,height:900}}),p=await c.newPage(),report={imports:[],exports:[],errors:[]}
const fallback=process.env.WORKSPACE_WORKER_MODE==='unavailable',inline=process.env.WORKSPACE_INPUT_PROFILE==='inline',runs=fallback||inline?1:5
if(fallback)await c.addInitScript(()=>window.Worker=undefined)
p.setDefaultTimeout(60000);p.on('pageerror',e=>report.errors.push(e.message))
await c.addInitScript(()=>{window.qa={tasks:[],workers:0,live:0,frames:0};new PerformanceObserver(l=>window.qa.tasks.push(...l.getEntries().map(e=>({start:e.startTime,ms:e.duration})))).observe({type:'longtask'});const frame=()=>{window.qa.frames++;requestAnimationFrame(frame)};requestAnimationFrame(frame);if(typeof Worker!=='undefined'){const Native=Worker;window.Worker=class extends Native{constructor(...args){super(...args);window.qa.workers++;window.qa.live++}terminate(){window.qa.live--;super.terminate()}}}})
const summary=a=>{const v=a.map(r=>r.ms).sort((a,b)=>a-b);return {min:v[0],median:v[Math.floor(v.length/2)],max:v.at(-1),longTask:Math.max(...a.map(r=>r.longTask))}}
async function start(){await p.waitForTimeout(100);return p.evaluate(()=>({t:performance.now(),workers:window.qa.workers,frames:window.qa.frames}))}
async function end(s,ms){await p.waitForTimeout(100);return p.evaluate(({s,ms})=>({ms,longTask:Math.max(0,...window.qa.tasks.filter(e=>e.start>=s.t).map(e=>e.ms)),workers:window.qa.workers-s.workers,frames:window.qa.frames-s.frames,live:window.qa.live}),{s,ms})}
try {
 await p.goto('https://localhost:4173');await p.locator('.first-start-close').click()
 const client=inline?await c.newCDPSession(p):undefined
 if(client)await client.send('Profiler.enable')
 for(let i=0;i<runs;i++){
  const old=await p.evaluate(()=>localStorage.getItem('accordbook.activeFormulaId')),s=await start(),t=performance.now()
  if(client)await client.send('Profiler.start')
  await p.locator('input[type=file][accept=".accordbook"]').nth(1).setInputFiles(inline?{name:'large.accordbook',mimeType:'application/vnd.accordbook',buffer:await readFile('.qa/workspace/large.accordbook')}:resolve('.qa/workspace/large.accordbook'))
  await p.waitForFunction(id=>localStorage.getItem('accordbook.activeFormulaId')!==id,old);await p.getByRole('status').filter({hasText:'Workspace imported.'}).waitFor()
  const r=await end(s,performance.now()-t);assert.equal(r.workers,fallback?0:1);assert.equal(r.live,0);assert.ok(r.frames>0);report.imports.push(r)
  if(client){const {profile}=await client.send('Profiler.stop');await writeFile('.qa/workspace/inline-input.cpuprofile',JSON.stringify(profile));const cost=new Map();profile.samples.forEach((id,j)=>cost.set(id,(cost.get(id)||0)+profile.timeDeltas[j]/1000));report.profile=profile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber+1,ms:cost.get(n.id)||0})).sort((a,b)=>b.ms-a.ms).slice(0,15)}
 }
 for(let i=0;i<runs;i++){
  await p.getByRole('button',{name:'Export ▾',exact:true}).click();const s=await start(),t=performance.now(),d=p.waitForEvent('download')
  await p.getByRole('button',{name:'Export formula workspace',exact:true}).click();const download=await d,ms=performance.now()-t
  const file=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(file.versions.length,220);assert.equal(file.experiments.length,30)
  const r=await end(s,ms);assert.equal(r.workers,fallback?0:1);assert.equal(r.live,0);report.exports.push(r)
 }
 assert.deepEqual(report.errors,[]);report.summary={import:summary(report.imports),export:summary(report.exports)};report.result='PASS';console.log(JSON.stringify(report,null,2))
}catch(error){report.failure=error.stack;report.result='FAIL';console.error(error);process.exitCode=1}
finally{await writeFile(inline?'.qa/workspace/inline-input-performance.json':fallback?'.qa/workspace/fallback-file-performance.json':'.qa/workspace/release-file-performance.json',JSON.stringify(report,null,2));await browser.close()}
