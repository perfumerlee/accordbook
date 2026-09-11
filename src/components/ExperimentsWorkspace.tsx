import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Formula, FormulaVersion, FormulaSnapshotRow } from '../models/formula'
import type { Experiment } from '../models/experiment'
import { addVariantFromBase, addVariantFromVariant, addVariantRow, createExperimentFromCurrent, createExperimentFromVersion, removeVariant, removeVariantRow, updateVariantNote, updateVariantRow } from '../services/experimentLifecycle'
import { calculateFormulaTotals } from '../services/formulaCalculator'
import type { AccordbookStorage } from '../storage/storageService'
import ExperimentComparisonSheet from './ExperimentComparisonSheet'
import ExperimentGenealogyRail from './ExperimentGenealogyRail'
import { buildExperimentRail, deriveActiveRailFamily } from '../services/experimentRail'
import { classifyExperimentViewport, type ExperimentViewportMode } from '../services/experimentViewport'
import { reconcileExperimentSelection, resolveSelectionAfterVariantDelete, type ExperimentCompareSession, resetExperimentCompareSession, reconcileCompareSession, enterCompareMode, cancelCompareMode, toggleComparisonDraft, commitCompareDraft, canOpenExperimentSheet } from '../services/experimentWorkspaceState'
import ExperimentModalShell from './ExperimentModalShell'
import './experiments.css'
import WideWorkspaceShell from './WideWorkspaceShell'
import { baseLabel, stateLabel, sourceOrder, displayDate } from './experimentPresentation'
import { branchMessages, experimentMessages, railCompareMessages } from '../i18n/messages'
import { formatDilutionSuffix } from '../services/dilutionDisplay'
import { canCreateBranchFrom, getVariantChildren, getVariantParent } from '../services/experimentGenealogy'

type Props={formula:Formula;storage:AccordbookStorage;language:'en'|'ko';onClose:()=>void;onBeforeCreateCurrent:()=>Promise<Formula>}
export default function ExperimentsWorkspace(props:Props){
 return <ExperimentWorkspaceSession key={props.formula.id} {...props}/>
}
function ExperimentWorkspaceSession({formula,storage,language,onClose,onBeforeCreateCurrent}:Props){
 const t=experimentMessages[language]
 const [createMode,setCreateMode]=useState(false)
 const experimentLoadGeneration=useRef(0)
 const entryBusy=useRef(false)
 const [compareSession,setCompareSession]=useState<ExperimentCompareSession>({mode:'navigation',committedIds:[],draftIds:null})
 const [openingSheet,setOpeningSheet]=useState(false)
 const sheetBusy=useRef(false)
 const compareIdentity=useRef<string | undefined>(undefined)
 const compareActionRef=useRef<HTMLButtonElement>(null)
 const comparing=compareSession.mode==='compare'
 const draftIds=compareSession.draftIds??[]
 const selectedVariantIds=[...compareSession.committedIds]
 useEffect(()=>{compareActionRef.current?.focus({preventScroll:true})},[comparing])
 useEffect(()=>()=>{experimentLoadGeneration.current++},[])
 const [viewport,setViewport]=useState<ExperimentViewportMode>(()=>typeof window==='undefined'?'full':classifyExperimentViewport(window.innerWidth,window.innerHeight));useEffect(()=>{const update=()=>setViewport(classifyExperimentViewport(window.innerWidth,window.innerHeight));window.addEventListener('resize',update);window.addEventListener('orientationchange',update);return()=>{window.removeEventListener('resize',update);window.removeEventListener('orientationchange',update)}},[])
 const [isSmartphone,setIsSmartphone]=useState(()=>typeof window!=='undefined'&&window.innerWidth<768);useEffect(()=>{const update=()=>setIsSmartphone(window.innerWidth<768);window.addEventListener('resize',update);window.addEventListener('orientationchange',update);return()=>{window.removeEventListener('resize',update);window.removeEventListener('orientationchange',update)}},[])
 const [list,setList]=useState<Experiment[]>([]);const [versions,setVersions]=useState<FormulaVersion[]>([]);const [experiment,setExperiment]=useState<Experiment | undefined>(undefined);const [state,setState]=useState('base');const [sheet,setSheet]=useState(false);const [creating,setCreating]=useState(false);const [createError,setCreateError]=useState('');const [loadingExperiment,setLoadingExperiment]=useState(false);const [source,setSource]=useState('current');const [name,setName]=useState('Experiment');const [saving,setSaving]=useState('SAVED');const localRevision=useRef(0);const persistedRevision=useRef(0);const pending=useRef<{value:Experiment;revision:number} | undefined>(undefined);const timer=useRef<number | undefined>(undefined);const chain=useRef(Promise.resolve());const observedExperiment=useRef<{id:string;count:number} | undefined>(undefined);const load=async()=>{setList(await storage.experiments.listByParentFormulaId(formula.id));setVersions(await storage.versions.listByParentFormulaId(formula.id))};useEffect(()=>{void load().catch(error=>setCreateError(String(error)))},[formula.id]);useEffect(()=>{if(!experiment)return;const previous=observedExperiment.current;if(!previous||previous.id!==experiment.experimentId){observedExperiment.current={id:experiment.experimentId,count:experiment.variants.length};return}if(experiment.variants.length>previous.count){const created=experiment.variants[experiment.variants.length-1];if(created.parentVariantId)setState(created.variantId)}observedExperiment.current={id:experiment.experimentId,count:experiment.variants.length}},[experiment?.experimentId,experiment?.variants.length]);
 const queue=(next:Experiment)=>{const revision=++localRevision.current;pending.current={value:next,revision};setExperiment(next);setSaving('SAVING…');if(timer.current)clearTimeout(timer.current);timer.current=window.setTimeout(()=>{const queued=pending.current?.revision===revision?pending.current:undefined;chain.current=chain.current.catch(()=>undefined).then(()=>storage.experiments.save(next)).then(()=>{persistedRevision.current=Math.max(persistedRevision.current,revision);if(pending.current?.revision===revision&&localRevision.current===revision){pending.current=undefined;setSaving('SAVED')}else setSaving('SAVING…')}).catch(()=>setSaving('SAVE FAILED'))},250)};
 const flush=async()=>{if(timer.current){clearTimeout(timer.current);timer.current=undefined}const target=localRevision.current;const queued=pending.current;if(queued){await(chain.current=chain.current.catch(()=>undefined).then(()=>storage.experiments.save(queued.value)));persistedRevision.current=Math.max(persistedRevision.current,queued.revision);if(pending.current?.revision===queued.revision)pending.current=undefined}await chain.current.catch(()=>undefined);if(persistedRevision.current<target)throw new Error('Latest Experiment revision was not persisted.');setSaving(persistedRevision.current===localRevision.current?'SAVED':'SAVING…')};
const openExperiment=async(experimentId:string)=>{if(entryBusy.current)return;entryBusy.current=true;const generation=++experimentLoadGeneration.current;setLoadingExperiment(true);setCreateError('');try{const loaded=await storage.experiments.get(experimentId);if(generation!==experimentLoadGeneration.current)return;if(!loaded||loaded.parentFormulaId!==formula.id)throw new Error('Experiment is unavailable for this Formula.');setExperiment(loaded);setState('base');setSheet(false);setSaving('SAVED')}catch(error){setCreateError(error instanceof Error?error.message:'Unable to open Experiment.')}finally{entryBusy.current=false;setLoadingExperiment(false)}};const leaveDetail=async()=>{if(sheetBusy.current)return;try{await flush();await load();setExperiment(undefined);setState('base');setCreateMode(false)}catch{setSaving('SAVE FAILED')}};
 const create=async()=>{if(entryBusy.current)return;entryBusy.current=true;setCreating(true);setCreateError('');try{const formulaState=source==='current'?await onBeforeCreateCurrent():formula;const selectedVersion=source==='current'?undefined:versions.find(v=>v.versionId===source);if(source!=='current'&&!selectedVersion)throw new Error('Selected saved Version is no longer available.');const base=source==='current'?createExperimentFromCurrent(formulaState):createExperimentFromVersion(formula,selectedVersion!);const next={...base,name:name.trim()||'Experiment'};await storage.experiments.save(next);setList(current=>[...current,next]);setExperiment(next);setState('base');setSheet(false);setCreateMode(false)}catch(error){console.error('Experiment creation failed',error);setCreateError(error instanceof Error?error.message:'Unable to create Experiment.')}finally{entryBusy.current=false;setCreating(false)}};
 const [deleteOpen,setDeleteOpen]=useState(false);const [deleting,setDeleting]=useState(false);const [deleteError,setDeleteError]=useState('');const [editOpen,setEditOpen]=useState(false);const [editName,setEditName]=useState('');
 const deleteCurrentExperiment=async()=>{if(!experiment||deleting)return;setDeleting(true);setDeleteError('');try{await flush();await storage.experiments.delete(experiment.experimentId);await load();setDeleteOpen(false);setExperiment(undefined);setState('base');setCreateMode(false)}catch(error){setDeleteError(error instanceof Error?error.message:'Unable to delete Experiment.')}finally{setDeleting(false)}};
 const selectedVariant=experiment&&state!=='base'?experiment.variants.find(v=>v.variantId===state):undefined
 useEffect(()=>{
   if(!experiment){compareIdentity.current=undefined;setCompareSession({mode:'navigation',committedIds:[],draftIds:null});return}
   const fresh=compareIdentity.current!==experiment.experimentId
   compareIdentity.current=experiment.experimentId
   setCompareSession(current=>fresh?resetExperimentCompareSession(experiment):reconcileCompareSession(experiment,current))
 },[experiment])
 const openSheet=async()=>{
   if(!experiment||sheetBusy.current)return
   const committed=commitCompareDraft(experiment,compareSession)
   if(!committed)return
   const generation=experimentLoadGeneration.current
   sheetBusy.current=true;setOpeningSheet(true)
   try{
     await flush()
     if(generation!==experimentLoadGeneration.current)return
     setCompareSession(committed);setSheet(true)
   }catch{setSaving('SAVE FAILED')}
   finally{sheetBusy.current=false;setOpeningSheet(false)}
 }
 const closeEntry=()=>{if(!entryBusy.current){experimentLoadGeneration.current++;onClose()}}
 const renderList=()=>(
   <>
     <div className="experiment-list-toolbar">
       <span>{t.index(list.length)}</span>
       <button className="experiment-action experiment-action--primary" type="button" disabled={loadingExperiment}
         onClick={()=>{setCreateError('');setSource('current');setCreateMode(true)}}>{t.createTitle}</button>
     </div>
     <div className="experiment-index">
       {!list.length&&<div className="experiment-empty"><p>{t.empty}</p><span>{t.emptyHint}</span></div>}
       {list.map(item=><button className="experiment-list-item" type="button" disabled={loadingExperiment} key={item.experimentId}
         onClick={()=>void openExperiment(item.experimentId)}>
         <span className="experiment-list-item__name">{item.name||t.untitled}</span>
         <span className="experiment-list-item__meta">
           <time dateTime={item.createdAt}>{displayDate(item.createdAt,language)}</time>
           <span>BASE · {baseLabel(item,versions,language)}</span>
           <span>{t.count(item.variants.length)}</span>
         </span>
         <span className="experiment-list-item__arrow" aria-hidden="true">↗</span>
       </button>)}
     </div>
     {createError&&<p className="create-error" role="alert">{createError}</p>}
   </>
 )
 const renderCreate=()=>(
   <section className="experiment-create" aria-label={t.createTitle}>
     <label className="experiment-name-field" htmlFor="experiment-name">
       <span>{t.name}</span>
       <input id="experiment-name" autoFocus disabled={creating} value={name} onChange={e=>setName(e.target.value)}/>
     </label>
     <fieldset className="experiment-sources" disabled={creating}>
       <legend>{t.source}</legend>
       <div className="experiment-source-list">
         <label className="experiment-source-option">
           <input type="radio" name="experiment-source" checked={source==='current'} onChange={()=>setSource('current')}/>
           <span><strong>CURRENT</strong><small>{t.currentHint}</small></span>
           <time>{displayDate(formula.updatedAt,language)}</time>
         </label>
         {sourceOrder(versions).map(v=><label className="experiment-source-option" key={v.versionId}>
           <input type="radio" name="experiment-source" checked={source===v.versionId} onChange={()=>setSource(v.versionId)}/>
           <span><strong>{stateLabel(v,language)}</strong><small>{v.kind==='restore-point'?stateLabel(v,language):t.saved}</small></span>
           <time dateTime={v.createdAt}>{displayDate(v.createdAt,language)}</time>
         </label>)}
       </div>
     </fieldset>
     {createError&&<p className="create-error" role="alert">{createError}</p>}
     <div className="experiment-create-actions">
       <button className="experiment-action experiment-action--back" type="button" disabled={creating} onClick={()=>{if(!entryBusy.current)setCreateMode(false)}}>← {t.back}</button>
       <button className="experiment-action experiment-action--primary" type="button" disabled={creating} onClick={()=>void create()}>{creating?t.creating:t.create}</button>
     </div>
   </section>
 )
 const renderDeleteModal=()=>deleteOpen?<ExperimentModalShell title={t.deleteExperiment} formulaId={formula.formulaId} formulaName={formula.name} closeLabel={t.cancel} closeDisabled={deleting} onClose={()=>setDeleteOpen(false)}><section className="experiment-delete-confirm" aria-label={t.deleteExperimentTitle}><h2>{t.deleteExperimentTitle}</h2><p>{t.deleteExperimentMessage}</p><p className="experiment-delete-confirm__warning">{t.deleteExperimentWarning}</p>{deleteError&&<p className="create-error" role="alert">{deleteError}</p>}<div className="experiment-create-actions"><button className="experiment-action experiment-action--back" type="button" disabled={deleting} onClick={()=>setDeleteOpen(false)}>{t.cancel}</button><button className="experiment-action experiment-action--primary experiment-action--danger" type="button" disabled={deleting} onClick={()=>void deleteCurrentExperiment()}>{deleting?t.deleting:t.confirmDelete}</button></div></section></ExperimentModalShell>:null
 const renderEditModal=()=>editOpen&&experiment?<ExperimentModalShell title="EDIT EXPERIMENT" formulaId={formula.formulaId} formulaName={formula.name} closeLabel={t.cancel} onClose={()=>setEditOpen(false)}><section className="experiment-name-edit-modal"><label htmlFor="edit-experiment-name">{t.name}<input id="edit-experiment-name" autoFocus value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){const value=editName.trim();if(value){queue({...experiment,name:value,updatedAt:new Date().toISOString()});setEditOpen(false)}}}}/></label><div className="experiment-create-actions"><button className="experiment-action experiment-action--back" type="button" onClick={()=>setEditOpen(false)}>{t.cancel}</button><button className="experiment-action experiment-action--primary" type="button" disabled={!editName.trim()} onClick={()=>{queue({...experiment,name:editName.trim(),updatedAt:new Date().toISOString()});setEditOpen(false)}}>OK</button></div></section></ExperimentModalShell>:null
 const renderEntryModal=()=>(
   <ExperimentModalShell
     title={language==='ko'?'실험':'EXPERIMENTS'}
     formulaId={formula.formulaId}
     formulaName={formula.name}
     closeLabel={language==='ko'?'실험 닫기':'Close Experiments'}
     closeDisabled={creating||loadingExperiment}
     onClose={closeEntry}
   >
     <div className="experiment-entry-content">
       {createMode?renderCreate():renderList()}
     </div>
   </ExperimentModalShell>
 )
 const renderDetail=()=>{
  if(!experiment)return null
  if(viewport==='unsupported')return <ExperimentViewportGate mode={viewport} onClose={leaveDetail}/>
   const railModel=buildExperimentRail(experiment)
   return <WideWorkspaceShell className="experiment-detail" headerActions={<><button className="experiment-name-edit-action" type="button" onClick={()=>{setEditName(experiment.name);setEditOpen(true)}}>EDIT NAME</button><button className="experiment-delete-action" type="button" disabled={comparing||openingSheet} onClick={()=>{setDeleteError('');setDeleteOpen(true)}}>DELETE EXPERIMENT</button></>} eyebrow={t.detail} formulaId={formula.formulaId} formulaName={formula.name} context={experiment.name + " · BASE: " + baseLabel(experiment,versions,language)} closeLabel={t.backList} onClose={()=>void leaveDetail()}>{saving==='SAVE FAILED'&&<p role="alert">Unable to save Experiment. Please try closing again to retry.</p>}{comparing&&<div className="experiment-compare-context" role="status"><span>{t.compare} · {draftIds.length} / 4</span><span>{t.compareHint}</span></div>}<nav className="experiment-navigation"><ExperimentGenealogyRail model={railModel} mode={compareSession.mode} compareDraftIds={draftIds} compareBusy={openingSheet} onToggleCompare={id=>{if(!openingSheet)setCompareSession(current=>toggleComparisonDraft(experiment,current,id))}} editingState={state} activeFamilyId={deriveActiveRailFamily(experiment,state)?.variantId??null} language={language} onSelectBase={()=>setState('base')} onSelectVariant={setState}/><div className="experiment-navigation-actions">{comparing?<><button ref={compareActionRef} type="button" disabled={openingSheet} onClick={()=>setCompareSession(current=>cancelCompareMode(experiment,current))}>{t.cancel}</button><button type="button" disabled={openingSheet||!canOpenExperimentSheet(experiment,draftIds)} onClick={()=>void openSheet()}>{railCompareMessages[language].openSheet}</button></>:<><button type="button" onClick={()=>{const next=addVariantFromBase(experiment);queue(next);setState(next.variants[next.variants.length-1].variantId)}}>{t.addVariant}</button><button ref={compareActionRef} type="button" disabled={!experiment.variants.length} onClick={()=>setCompareSession(current=>enterCompareMode(experiment,current))}>{t.sheet}</button></>}</div></nav>{state==='base'?<BaseNotebook experiment={experiment} sourceLabel={baseLabel(experiment,versions,language)}/>:selectedVariant?<VariantEditor experiment={experiment} variant={selectedVariant} language={language} structuralDisabled={comparing||openingSheet} onChange={queue} onDelete={()=>{if(confirm('Delete this Variant?')){try{const fallback=resolveSelectionAfterVariantDelete(experiment,state);const next=removeVariant(experiment,state);queue(next);const resolved=reconcileExperimentSelection(next,fallback);setState(resolved==='base'?'base':resolved.variantId)}catch{setSaving('SAVE FAILED')}}}} saving={saving}/>:<BaseNotebook experiment={experiment} sourceLabel={baseLabel(experiment,versions,language)}/>}</WideWorkspaceShell>
 }
 const renderSheet=()=>{
   if(!experiment)return null
   return viewport==='unsupported'?<ExperimentViewportGate mode={viewport} onClose={()=>setSheet(false)}/>:<ExperimentComparisonSheet experiment={experiment} formula={formula} language={language} variantIds={selectedVariantIds} onClose={()=>setSheet(false)}/>
 }
 const layerRef=useRef<HTMLDivElement>(null)
 useEffect(()=>{
   const opener=document.activeElement as HTMLElement|null
   const previousOverflow=document.body.style.overflow
   document.body.style.overflow='hidden'
   return ()=>{
     document.body.style.overflow=previousOverflow
     requestAnimationFrame(()=>{if(opener?.isConnected&&!opener.closest('[inert]'))opener.focus({preventScroll:true})})
   }
 },[])
 useEffect(()=>{
   if(experiment&&!editOpen&&!deleteOpen)layerRef.current?.focus({preventScroll:true})
 },[experiment?.experimentId,sheet,editOpen,deleteOpen,viewport])
 useEffect(()=>{
   const root=layerRef.current
   if(!root)return
   const ko=language==='ko'
   root.querySelectorAll<HTMLElement>('.experiment-name-edit-action').forEach(el=>{el.textContent=ko?'제목 수정':'EDIT NAME'})
   root.querySelectorAll<HTMLElement>('.experiment-delete-action').forEach(el=>{el.textContent=ko?'실험 삭제':'DELETE EXPERIMENT'})
   root.querySelectorAll<HTMLElement>('.experiment-read-only-badge').forEach(el=>{el.textContent=ko?'읽기 전용':'READ ONLY'})
   root.querySelectorAll<HTMLInputElement>('.experiment-row-memo input').forEach(el=>{el.placeholder=ko?'메모':'MEMO'})
 },[language,experiment?.experimentId,state])
 const mobileUnavailable=isSmartphone||viewport==='unsupported'
 return createPortal(<div className="experiments-layer" ref={layerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={language==='ko'?'실험':'Experiments'} onKeyDown={event=>{
   if(event.key==='Escape'&&!editOpen&&!deleteOpen){
     event.preventDefault();event.stopPropagation()
     if(openingSheet)return
     if(sheet)setSheet(false);else if(comparing&&experiment)setCompareSession(current=>cancelCompareMode(experiment,current));else if(experiment)void leaveDetail();else closeEntry()
   }
   if(event.key==='Tab'&&!editOpen&&!deleteOpen&&experiment){
     const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])')).filter(item=>item.getClientRects().length)
     const first=items[0],last=items[items.length-1]
     if(!first){event.preventDefault();return}
     if(event.shiftKey&&(document.activeElement===first||document.activeElement===event.currentTarget)){event.preventDefault();last.focus()}
     else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===event.currentTarget)){event.preventDefault();first.focus()}
   }
 }}><div inert={editOpen||deleteOpen}>{mobileUnavailable?<ExperimentViewportGate mode="unsupported" onClose={closeEntry}/>:experiment?(sheet?renderSheet():renderDetail()):renderEntryModal()}</div>{renderDeleteModal()}{renderEditModal()}</div>,document.body)
}
function NotebookHead({labels}:{labels?:{parts:string;materialName:string;dilution:string;memo:string;deleteLabel:string}}){const resolved=labels??(typeof document!=='undefined'&&document.documentElement.lang==='ko'?{parts:'배합량',materialName:'원료명',dilution:'희석',memo:'메모',deleteLabel:'삭제'}:{parts:'PARTS',materialName:'MATERIAL NAME',dilution:'DILUTION',memo:'MEMO',deleteLabel:'DELETE'});return <thead><tr><th>{resolved.parts}</th><th>{resolved.materialName}</th><th>{resolved.dilution}</th><th>{resolved.memo}</th><th>{resolved.deleteLabel}</th></tr></thead>}
function NotebookSummary({rows,note,onNote}:{rows:FormulaSnapshotRow[];note:string;onNote?:(value:string)=>void}){
 const ko=typeof document!=='undefined'&&document.documentElement.lang==='ko'
 const total=calculateFormulaTotals(rows.map(row=>({...row,id:row.rowId}))).totalParts
 return <div className="experiment-summary"><div className="experiment-metrics"><div className="experiment-summary-title">{ko?'합계':'Total'}</div><div className="experiment-total-panel"><span>{ko?'배합량':'PARTS'}</span><strong>{total.toLocaleString()} <small>/ 1,000</small></strong></div></div><div><label className="experiment-summary-title" htmlFor={onNote?'variant-note':undefined}>{ko?'노트':'Notes'}</label>{onNote?<textarea id="variant-note" aria-label={ko?'시안 노트':'Variant note'} value={note} onChange={e=>onNote(e.target.value)}/>:<p className="experiment-fixed-note">{note||'—'}</p>}</div></div>
}
function BaseNotebook({experiment,sourceLabel}:{experiment:Experiment;sourceLabel:string}){
 return <section className="experiment-notebook"><div className="experiment-variant-heading"><span>BASE · {sourceLabel}</span><span className="experiment-read-only-badge">READ ONLY</span></div><table className="experiment-material-table"><NotebookHead/><tbody>{experiment.baseSnapshot.rows.map(row=><tr key={row.rowId}><td className="experiment-parts">{row.parts}</td><td className="experiment-material"><span>{row.material}</span></td><td className="experiment-dilution">{row.dilution?.enabled?<><button className="experiment-dilution-badge--active" type="button" aria-label="DIL" disabled>DIL</button><span className="experiment-dilution-value">@{row.dilution.percent}% in {row.dilution.solvent}</span></>:'—'}</td><td className="experiment-row-memo">{row.memo||'—'}</td><td className="experiment-delete-cell">—</td></tr>)}</tbody></table><NotebookSummary rows={experiment.baseSnapshot.rows} note={experiment.baseSnapshot.notes}/></section>
}
function VariantEditor({experiment,variant,onChange,onDelete,saving,language,structuralDisabled}:{experiment:Experiment;variant:import('../models/experiment').ExperimentVariant;onChange:(e:Experiment)=>void;onDelete:()=>void;saving:string;language:'en'|'ko';structuralDisabled:boolean}){
 const uiLanguage=language
 const deleteBlocked=getVariantChildren(experiment,variant.variantId).length>0
 const addMaterialLabel=uiLanguage==='ko'?'+ 원료 추가':'+ ADD MATERIAL'
 const branchBusy=useRef(false)
 const canBranch=canCreateBranchFrom(experiment,variant.variantId)
 const createBranch=()=>{if(structuralDisabled||branchBusy.current||!canBranch)return;branchBusy.current=true;try{onChange(addVariantFromVariant(experiment,variant.variantId))}catch{branchBusy.current=false}}
 useEffect(()=>{branchBusy.current=false},[experiment.variants.length])
 const baseRowIds=new Set(experiment.baseSnapshot.rows.map(row=>row.rowId))
 const baseRowsById=new Map(experiment.baseSnapshot.rows.map(row=>[row.rowId,row]))
 const isChangedFromBase=(row:FormulaSnapshotRow)=>{const base=baseRowsById.get(row.rowId);return !base||row.parts!==base.parts}
 const update=(rowId:string,changes:Partial<FormulaSnapshotRow>)=>onChange(updateVariantRow(experiment,variant.variantId,rowId,changes))
 return <section className="experiment-notebook">
  <div className="experiment-variant-heading"><div className="experiment-variant-title-group"><span>VARIANT {variant.label}</span><span className="experiment-save-status" data-state={saving.startsWith('SAVING')?'saving':saving==='SAVE FAILED'?'failed':'saved'} role="status" aria-live="polite">{saving}</span></div><div className="experiment-variant-heading__actions"><>{canBranch&&!structuralDisabled&&<button className="experiment-create-branch" type="button" aria-label={branchMessages[uiLanguage].createBranchFrom(variant.label)} onClick={createBranch}>{branchMessages[uiLanguage].addBranch}</button>}<div className="experiment-delete-group"><button className="experiment-delete-variant" type="button" disabled={deleteBlocked||structuralDisabled} aria-describedby={deleteBlocked?'experiment-delete-blocked':undefined} onClick={onDelete}>{variant.parentVariantId? (uiLanguage==='ko'?'Branch 삭제':'DELETE BRANCH') : (uiLanguage==='ko'?'시안 삭제':'DELETE VARIANT')}</button>{deleteBlocked&&<p id="experiment-delete-blocked" className="experiment-delete-blocked">{branchMessages[language].deleteBlocked}</p>}</div></></div></div>
  <table className="experiment-material-table"><NotebookHead/><tbody>{variant.snapshot.rows.map(row=><tr className={isChangedFromBase(row)?'experiment-row--marked':''} key={row.rowId}>
   <td className="experiment-parts"><input aria-label="Parts" type="number" value={row.parts} onChange={e=>update(row.rowId,{parts:e.target.value===''?'':Number(e.target.value)})}/></td>
   <td className="experiment-material"><input aria-label="Material name" disabled={baseRowIds.has(row.rowId)} value={row.material} onChange={e=>update(row.rowId,{material:e.target.value})}/></td>
   <td><div className="experiment-dilution"><button type="button" aria-label="Dilution" disabled={baseRowIds.has(row.rowId)} aria-pressed={row.dilution?.enabled??false} onClick={()=>update(row.rowId,{dilution:{enabled:!row.dilution?.enabled,percent:row.dilution?.percent??1,solvent:row.dilution?.solvent??'ALC'}})}>DIL</button>{row.dilution?.enabled&&baseRowIds.has(row.rowId)&&<span className="experiment-dilution-value">@{row.dilution.percent}% in {row.dilution.solvent}</span>}{row.dilution?.enabled&&!baseRowIds.has(row.rowId)&&<div className="experiment-dilution-fields"><span>@</span><input aria-label="Dilution percent" type="number" value={row.dilution.percent} onChange={e=>update(row.rowId,{dilution:{...row.dilution!,percent:Number(e.target.value)}})}/><span>% in</span><input aria-label="Dilution solvent" value={row.dilution.solvent} onChange={e=>update(row.rowId,{dilution:{...row.dilution!,solvent:e.target.value}})}/></div>}</div></td>
   <td className="experiment-row-memo"><input aria-label={`Memo for ${row.material||'material'}`} placeholder="MEMO" value={row.memo??''} onChange={e=>update(row.rowId,{memo:e.target.value})}/></td>
   <td><button className="experiment-remove" type="button" aria-label="Remove material" onClick={()=>onChange(removeVariantRow(experiment,variant.variantId,row.rowId))}>×</button></td>
  </tr>)}</tbody></table>
  <div className="experiment-editor-actions"><button type="button" onClick={()=>onChange(addVariantRow(experiment,variant.variantId,{material:'',cas:'',parts:''}))}>{addMaterialLabel}</button></div>
  <NotebookSummary rows={variant.snapshot.rows} note={variant.note} onNote={value=>onChange(updateVariantNote(experiment,variant.variantId,value))}/>
 </section>
}

function ExperimentViewportGate({mode,onClose}:{mode:ExperimentViewportMode;onClose:()=>void}){const unsupported=mode==='unsupported';return <main className="experiments-workspace experiments-viewport-gate"><button className="experiments-close" type="button" aria-label="Close Experiments" onClick={onClose}>×</button><div role="status"><div className="experiments-eyebrow">EXPERIMENTS WORKSPACE</div><h1>{unsupported?'WORKSPACE UNAVAILABLE':'ROTATE YOUR DEVICE'}</h1><p>{unsupported?'This workspace is available on desktop and landscape tablets.':'Experiments works best in landscape orientation.'}</p></div></main>}
