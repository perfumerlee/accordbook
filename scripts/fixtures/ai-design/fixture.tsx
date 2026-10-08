import React, {useState} from 'react'
import {createRoot} from 'react-dom/client'
import Formula from '/src/components/AiFormulaReview'
import Compare from '/src/components/ExperimentComparePanel'
import NextRound from '/src/components/ExperimentNextRoundPanel'
import History from '/src/components/ExperimentCompareReviewHistory'
import '/src/rev30-preview/rev30.css'
import '/src/components/productionLayout.css'
import '/src/components/responsive-foundation.css'
import '/src/components/wideWorkspaceShell.css'
import '/src/components/variantEvaluations.css'
import '/src/components/aiNotebookDesign.css'
const params=new URLSearchParams(location.search), language=params.get('lang')==='en'?'en':'ko', kind=params.get('kind')||'formula'
document.documentElement.lang=language
const date='2026-10-08T09:00:00.000Z'
const text=language==='ko'?'관찰 사실: Hedione과 Cedarwood Virginia EO의 균형을 비교했습니다. 확산감과 잔향에 대한 가설이며 실제 시향을 통해 확인해야 합니다.':'The balance between Hedione and Cedarwood Virginia EO suggests a softer drydown. This is a hypothesis to check through a controlled smelling comparison.'
const formula={id:'f',formulaId:'ACC-2610-004',date:'2026-10-08',name:'Woody Musk Study',notes:'',createdAt:date,updatedAt:date,rows:[{id:'r',rowId:'r',material:'Hedione — a long material label for responsive layout',parts:1000,cas:'24851-98-7'}]}
const evaluation={evaluationId:'ev',createdAt:date,updatedAt:date,snapshot:{rows:[{rowId:'r',material:'Hedione',parts:1000}]},observation:text,verdict:'continue',nextAction:'Compare drydown'}
const variant={variantId:'v',parentVariantId:null,label:'A',createdAt:date,updatedAt:date,note:'',snapshot:evaluation.snapshot,evaluations:[evaluation]}
const experiment={experimentId:'e',parentFormulaId:'f',name:'Woody Musk Study',createdAt:date,updatedAt:date,nextVariantOrdinal:2,baseSource:{kind:'current',sourceCurrentUpdatedAt:date},baseSnapshot:{...formula,rows:evaluation.snapshot.rows},variants:[variant]}
const fr={reviewId:'fr',reviewType:'formula',sourceFormulaId:'f',sourceFormulaDisplayId:formula.formulaId,createdAt:date,locale:language,schemaVersion:1,response:{summary:text.repeat(3),observations:[{detail:text},{detail:text}],nextChecks:[{detail:text}]}}
const cr={reviewId:'cr',reviewType:'experiment',operation:'compare',experimentId:'e',experimentDisplayName:experiment.name,selectedVariantIds:['v'],selectedVariantLabels:['A'],variantIdsByLabel:{V1:'v'},createdAt:date,locale:language,response:{summary:text.repeat(3),variants:[{variantLabel:'V1',hypothesis:text,uncertainties:[text],smellingChecks:[text]}],overallUncertainties:[text],overallSmellingChecks:[text]},deterministicDelta:[]}
const nr={reviewId:'nr',reviewType:'experiment',operation:'next_round',experimentId:'e',experimentDisplayName:experiment.name,variantId:'v',variantLabel:'A',evaluationId:'ev',createdAt:date,locale:language,submittedContext:{evaluation},response:{findings:text.repeat(3),uncertainties:[text],nextChecks:[text],adjustmentDirections:[text]}}
window.__qaResults={formula:fr.response,compare:cr.response,next:{...nr.response,advisoryOnly:true}}
const empty=params.has('empty'), fail=params.has('fail')
const read=async value=>{if(fail)throw Error('test storage failure');return empty?[]:value}
const reviews={listAll:()=>read([fr]),listByFormula:()=>read([fr]),listAllExperiments:()=>read([cr]),listByExperiment:()=>read([cr]),listAllExperimentReviews:()=>read([cr,nr])}
const getExperiment=async()=>experiment
function App(){const [target,setTarget]=useState(null);return <div className="app" style={{display:'block',padding:'20px 12px'}}><main className="main" style={{padding:0,maxWidth:1120,margin:'auto'}}><div style={{background:'var(--paper)',padding:'clamp(12px,2vw,28px)'}}><h1 style={{font:'24px Georgia',margin:'0 0 8px'}}>ACC-2610-004 · Woody Musk Study</h1><p style={{font:'12px system-ui',color:'#726757'}}>Local component QA · synthetic records · no provider requests</p>{kind==='formula'?<><div className="editor-actions"><div className="editor-actions-left"><span className="ai-review-action-slot" ref={setTarget}/><button className="btn">Duplicate as new page</button><button className="btn">Move to Archive</button><button className="btn">Pin</button></div><div className="editor-actions-right"><button className="btn">Reset materials</button><button className="btn primary">+ Add material</button></div></div><Formula formula={formula} language={language} connection={{enabled:true,endpoint:'http://127.0.0.1:5187/v1/ai/formula-review'}} triggerTarget={target} reviews={reviews} storageMode="indexeddb" knownFormulaIds={['f']}/></>:<div className="experiments-layer"><div className="wide-workspace" style={{minHeight:0,padding:0}}>{kind==='compare'?<Compare experiment={experiment} variantIds={['v']} language={language} reviews={reviews} getExperiment={getExperiment} requestLimitBytes={16384} requestLimitVerified={true}/>:kind==='next'?<div className="variant-evaluations" style={{margin:0,padding:0,border:0}}><NextRound experiment={experiment} variant={variant} evaluation={evaluation} language={language} reviews={reviews} requestLimitBytes={16384} requestLimitVerified={true}/></div>:<History reviews={reviews} language={language} getExperiment={getExperiment} onBack={()=>{}}/>}</div></div>}</div></main></div>}
createRoot(document.getElementById('root')).render(<App/>);
