import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
const browser=await chromium.launch({headless:true}),page=await browser.newPage({ignoreHTTPSErrors:true})
try{
 await page.goto('https://localhost:5173')
 const text=await readFile('.qa/workspace/large.accordbook','utf8')
 const report=await page.evaluate(async text=>{
  const {createWorkspaceProcessor}=await import('/src/services/workspacePipeline.ts'),p=createWorkspaceProcessor(),times={}
  let t=performance.now();await p({kind:'load',input:text});times.load=performance.now()-t
  t=performance.now();const records=await p({kind:'remap',displayId:'QA-2610-999',importedAt:new Date().toISOString()});times.remap=performance.now()-t
  t=performance.now();await p({kind:'export',source:records});times.export=performance.now()-t
  t=performance.now();structuredClone(records);times.clone=performance.now()-t
  const url=URL.createObjectURL(new Blob(['onmessage=e=>postMessage(e.data)'],{type:'text/javascript'})),worker=new Worker(url)
  t=performance.now();const reply=new Promise((resolve,reject)=>{worker.onmessage=resolve;worker.onerror=reject});worker.postMessage(records);times.postMessageSend=performance.now()-t;await reply;times.workerRoundTrip=performance.now()-t;worker.terminate();URL.revokeObjectURL(url)
  return times
 },text)
 console.log(report);await writeFile('.qa/workspace/worker-feasibility.json',JSON.stringify(report,null,2))
}finally{await browser.close()}
