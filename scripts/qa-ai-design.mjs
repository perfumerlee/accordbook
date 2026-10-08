import assert from 'node:assert/strict'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'

// No production data or credentials. All provider POSTs are fulfilled locally.
const out=process.env.AI_DESIGN_QA_OUTPUT || join(tmpdir(),'accordbook-ai-design-qa')
await mkdir(out,{recursive:true})
const server=await createServer({configFile:false,envDir:false,plugins:[react()],server:{host:'127.0.0.1',port:5187,strictPort:true},define:{'import.meta.env.VITE_AI_ENABLED':'"true"','import.meta.env.VITE_AI_ENDPOINT':'"http://127.0.0.1:5187/v1/ai/formula-review"'}})
await server.listen()
const browser=await chromium.launch({headless:true})
const page=await browser.newPage()
const report=[],errors=[]
let mockRequests=0
page.on('pageerror',e=>errors.push(e.message))
await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url())
  if(url.hostname!=='127.0.0.1')return route.abort()
  if(request.method()==='POST'){
    mockRequests++
    const results=await page.evaluate(()=>window.__qaResults)
    const result=url.pathname.includes('next-round')?results.next:url.pathname.includes('compare')?results.compare:results.formula
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({requestId:'537aab0e-a538-4eca-8601-6989f851a97b',result})})
  }
  return route.continue()
})
try{
  for(const width of [360,390,768,1440])for(const lang of ['ko','en'])for(const kind of ['formula','compare','next','history']){
    await page.setViewportSize({width,height:900})
    await page.goto(`http://127.0.0.1:5187/scripts/fixtures/ai-design/index.html?kind=${kind}&lang=${lang}`)
    await page.waitForSelector('.ai-notebook',{state:'attached'})
    if(kind!=='history')await page.locator(kind==='formula'?'.ai-review-trigger':kind==='compare'?'.experiment-ai-compare__trigger':'.experiment-next-round__trigger').click()
    const capture=async state=>{
      await page.waitForTimeout(100)
      const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,buttons:[...document.querySelectorAll('.ai-notebook button')].filter(b=>b.getBoundingClientRect().height>0).map(b=>({text:b.textContent?.trim(),height:b.getBoundingClientRect().height,font:getComputedStyle(b).fontSize,family:getComputedStyle(b).fontFamily}))}))
      assert.equal(metrics.overflow,false,`${width}/${lang}/${kind}/${state} overflows`)
      for(const button of metrics.buttons)assert.ok(button.height>=(width<768?44:40)-1,`${kind}/${state}: undersized ${button.text}`)
      report.push({width,lang,kind,state,...metrics})
      if(lang==='ko'&&(width===390||width===1440))await page.screenshot({path:join(out,`${kind}-${state}-${width}.png`),fullPage:true})
    }
    await capture('setup')
    if(kind!=='history'&&width===1440&&lang==='en'){
      const scope=page.locator('.ai-notebook')
      const accept=scope.getByRole('button',{name:'I understand the transmission scope',exact:true})
      if(await accept.isVisible())await accept.click()
      await scope.locator('input[type=password]').fill('A'.repeat(43))
      await scope.getByRole('button',{name:'Use token',exact:true}).click()
      const consent=scope.locator('.experiment-ai-compare__consent input, .experiment-next-round__consent input')
      if(await consent.count())await consent.check()
      await capture('ready')
      const run=scope.locator('.ai-review-execute, .experiment-ai-compare__actions > button:first-child, .experiment-next-round__run')
      assert.equal(await run.isEnabled(),true)
      await run.click()
      await scope.locator('.ai-review-result, .experiment-ai-compare__result, .experiment-next-round__result').waitFor()
      await capture('result')
    }
    if(kind!=='history'){
      await page.locator(kind==='formula'?'.ai-review-view-switch button':kind==='compare'?'.experiment-ai-compare__view-switch button':'.experiment-next-round__view-switch button').nth(1).click()
      await capture('history')
    }
    await page.locator(kind==='formula'?'.ai-review-history-entry':kind==='compare'?'.experiment-ai-compare__history-list button':kind==='next'?'.experiment-next-round__history-actions button':'.experiment-review-history__actions button').first().click()
    await capture('detail')
  }
  // Empty and failed history must still fit and keep navigation available.
  for(const state of ['empty','fail'])for(const kind of ['formula','compare','next','history']){
    await page.setViewportSize({width:390,height:844})
    await page.goto('http://127.0.0.1:5187/scripts/fixtures/ai-design/index.html?kind='+kind+'&lang=ko&'+state)
    await page.waitForSelector('.ai-notebook',{state:'attached'})
    if(kind!=='history'){
      await page.locator(kind==='formula'?'.ai-review-trigger':kind==='compare'?'.experiment-ai-compare__trigger':'.experiment-next-round__trigger').click()
      await page.locator(kind==='formula'?'.ai-review-view-switch button':kind==='compare'?'.experiment-ai-compare__view-switch button':'.experiment-next-round__view-switch button').nth(1).click()
    }
    await page.waitForTimeout(150)
    if(state==='fail')assert.ok(await page.locator('[role=alert]').count())
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
    await page.screenshot({path:join(out,kind+'-'+state+'-390.png'),fullPage:true})
    report.push({width:390,lang:'ko',kind,state,overflow:false})
  }
  assert.deepEqual(errors,[])
  assert.equal(mockRequests,3)
  await writeFile(join(out,'report.json'),JSON.stringify({mockRequests,realAiRequests:0,errors,report},null,2))
  console.log(JSON.stringify({states:report.length,mockRequests,realAiRequests:0,errors,output:out}))
}finally{await browser.close();await server.close()}
