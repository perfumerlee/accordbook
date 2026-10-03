import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const browser=await chromium.launch({headless:true}),context=await browser.newContext({ignoreHTTPSErrors:true,acceptDownloads:true})
const page=await context.newPage(),report={},label=process.env.WORKSPACE_PROFILE_LABEL||'current'
try {
  await page.goto('https://localhost:5173');await page.locator('main.main').waitFor()
  if(await page.locator('.first-start-close').isVisible())await page.locator('.first-start-close').click()
  const client=await context.newCDPSession(page);await client.send('Profiler.enable')
  async function profile(name,operation){
    await page.evaluate(async()=>{
      window.qaCosts={};window.qaRestore=[]
      window.qaStages=[];(await import('/src/services/workspaceProfile.ts')).observeWorkspaceProfile((stage,ms)=>window.qaStages.push({stage,ms}))
      for(const [obj,key] of [[JSON,'parse'],[JSON,'stringify'],[window,'structuredClone'],[TextEncoder.prototype,'encode'],[Blob.prototype,'text']]){
        const original=obj[key];obj[key]=function(...args){const t=performance.now();const result=original.apply(this,args);const record=()=>{const r=window.qaCosts[key]??={calls:0,ms:0};r.calls++;r.ms+=performance.now()-t};if(result?.then)return result.finally(record);record();return result};window.qaRestore.push(()=>obj[key]=original)
      }
    })
    await client.send('Profiler.start');const t=performance.now();await operation();const ms=performance.now()-t
    const {profile}=await client.send('Profiler.stop')
    const costs=await page.evaluate(()=>{window.qaRestore.forEach(f=>f());return window.qaCosts})
    const counts=new Map();for(let i=0;i<(profile.samples||[]).length;i++)counts.set(profile.samples[i],(counts.get(profile.samples[i])||0)+profile.timeDeltas[i]/1000)
    const samples=profile.nodes.map(n=>({function:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber+1,selfMs:counts.get(n.id)||0})).filter(n=>n.selfMs).sort((a,b)=>b.selfMs-a.selfMs)
    report[name]={ms,costs,stages:await page.evaluate(()=>window.qaStages),samples};await writeFile(`.qa/workspace/${label}-${name}.cpuprofile`,JSON.stringify(profile))
  }
  await profile('import',async()=>{await page.locator('input[type=file][accept=".accordbook"]').nth(1).setInputFiles(resolve('.qa/workspace/large.accordbook'));await page.getByRole('status').filter({hasText:'Workspace imported.'}).waitFor({timeout:120000})})
  await profile('export',async()=>{await page.getByRole('button',{name:'Export ▾',exact:true}).click();const d=page.waitForEvent('download');await page.getByRole('button',{name:'Export formula workspace',exact:true}).click();await readFile(await (await d).path())})
  await profile('experiments',async()=>{await page.getByRole('button',{name:'Experiments',exact:true}).click();await page.locator('.experiment-list-item').last().waitFor()})
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([k,v])=>[k,{ms:v.ms,costs:v.costs,top:v.samples.slice(0,8)}])),null,2))
}finally{await writeFile(`.qa/workspace/profile-${label}.json`,JSON.stringify(report,null,2));await browser.close()}
