import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Formula, FormulaVersion, FormulaSnapshotRow } from '../models/formula'
import type { Experiment } from '../models/experiment'
import { addVariantFromBase, addVariantRow, createExperimentFromCurrent, createExperimentFromVersion, removeVariant, removeVariantRow, updateVariantNote, updateVariantRow } from '../services/experimentLifecycle'
import { calculateFormulaTotals } from '../services/formulaCalculator'
import type { AccordbookStorage } from '../storage/storageService'
import ExperimentComparisonSheet from './ExperimentComparisonSheet'
import { classifyExperimentViewport, type ExperimentViewportMode } from '../services/experimentViewport'
import { selectionForListReentry } from '../services/experimentWorkspaceState'
import ExperimentModalShell from './ExperimentModalShell'
import './experiments.css'
import WideWorkspaceShell from './WideWorkspaceShell'
import { baseLabel, stateLabel, sourceOrder, displayDate } from './experimentPresentation'
import { experimentMessages } from '../i18n/messages'
import { formatDilutionSuffix } from '../services/dilutionDisplay'

type Props={formula:Formula;storage:AccordbookStorage;language:'en'|'ko';onClose:()=>void;onBeforeCreateCurrent:()=>Promise<Formula>}
export default function ExperimentsWorkspace({formula,storage,language,onClose,onBeforeCreateCurrent}:Props){
 const t=experimentMessages[language]
 const [createMode,setCreateMode]=useState(false)
 const experimentLoadGeneration=useRef(0)
 const entryBusy=useRef(false)
 useEffect(()=>()=>{experimentLoadGeneration.current++},[])
 const [viewport,setViewport]=useState<ExperimentViewportMode>(()=>typeof window==='undefined'?'full':classifyExperimentViewport(window.innerWidth,window.innerHeight));useEffect(()=>{const update=()=>setViewport(classifyExperimentViewport(window.innerWidth,window.innerHeight));window.addEventListener('resize',update);window.addEventListener('orientationchange',update);return()=>{window.removeEventListener('resize',update);window.removeEventListener('orientationchange',update)}},[])
 const [list,setList]=useState<Experiment[]>([]);const [versions,setVersions]=useState<FormulaVersion[]>([]);const [experiment,setExperiment]=useState<Experiment | undefined>(undefined);const [state,setState]=useState('base');const [sheet,setSheet]=useState(false);const [selectedVariantIds,setSelectedVariantIds]=useState<string[]>([]);const [creating,setCreating]=useState(false);const [createError,setCreateError]=useState('');const [loadingExperiment,setLoadingExperiment]=useState(false);const [source,setSource]=useState('current');const [name,setName]=useState('Experiment');const [saving,setSaving]=useState('SAVED');const localRevision=useRef(0);const persistedRevision=useRef(0);const pending=useRef<{value:Experiment;revision:number} | undefined>(undefined);const timer=useRef<number | undefined>(undefined);const chain=useRef(Promise.resolve());const load=async()=>{setList(await storage.experiments.listByParentFormulaId(formula.id));setVersions(await storage.versions.listByParentFormulaId(formula.id))};useEffect(()=>{void load().catch(error=>setCreateError(String(error)))},[formula.id]);useEffect(()=>{setSelectedVariantIds(experiment&&experiment.variants.length>4?experiment.variants.slice(0,4).map(v=>v.variantId):experiment?.variants.map(v=>v.variantId)??[])},[experiment?.experimentId,experiment?.variants.length]);
 const queue=(next:Experiment)=>{const revision=++localRevision.current;pending.current={value:next,revision};setExperiment(next);setSaving('SAVING…');if(timer.current)clearTimeout(timer.current);timer.current=window.setTimeout(()=>{const queued=pending.current?.revision===revision?pending.current:undefined;chain.current=chain.current.catch(()=>undefined).then(()=>storage.experiments.save(next)).then(()=>{persistedRevision.current=Math.max(persistedRevision.current,revision);if(pending.current?.revision===revision&&localRevision.current===revision){pending.current=undefined;setSaving('SAVED')}else setSaving('SAVING…')}).catch(()=>setSaving('SAVE FAILED'))},250)};
 const flush=async()=>{if(timer.current){clearTimeout(timer.current);timer.current=undefined}const target=localRevision.current;const queued=pending.current;if(queued){await(chain.current=chain.current.catch(()=>undefined).then(()=>storage.experiments.save(queued.value)));persistedRevision.current=Math.max(persistedRevision.current,queued.revision);if(pending.current?.revision===queued.revision)pending.current=undefined}await chain.current.catch(()=>undefined);if(persistedRevision.current<target)throw new Error('Latest Experiment revision was not persisted.');setSaving(persistedRevision.current===localRevision.current?'SAVED':'SAVING…')};
 const openSheet=async()=>{try{await flush();setSheet(true)}catch{setSaving('SAVE FAILED')}};const openExperiment=async(experimentId:string)=>{if(entryBusy.current)return;entryBusy.current=true;const generation=++experimentLoadGeneration.current;setLoadingExperiment(true);setCreateError('');try{const loaded=await storage.experiments.get(experimentId);if(generation!==experimentLoadGeneration.current)return;if(!loaded||loaded.parentFormulaId!==formula.id)throw new Error('Experiment is unavailable for this Formula.');setExperiment(loaded);setState('base');setSheet(false);setSaving('SAVED')}catch(error){setCreateError(error instanceof Error?error.message:'Unable to open Experiment.')}finally{entryBusy.current=false;setLoadingExperiment(false)}};const leaveDetail=async()=>{try{await flush();await load();setExperiment(undefined);setState('base');setCreateMode(false)}catch{setSaving('SAVE FAILED')}};const toggleVariant=(id:string)=>setSelectedVariantIds(current=>current.includes(id)?current.filter(item=>item!==id):current.length>=4?current:[...current,id]);
 const create=async()=>{if(entryBusy.current)return;entryBusy.current=true;setCreating(true);setCreateError('');try{const formulaState=source==='current'?await onBeforeCreateCurrent():formula;const selectedVersion=source==='current'?undefined:versions.find(v=>v.versionId===source);if(source!=='current'&&!selectedVersion)throw new Error('Selected saved Version is no longer available.');const base=source==='current'?createExperimentFromCurrent(formulaState):createExperimentFromVersion(formula,selectedVersion!);const next={...base,name:name.trim()||'Experiment'};await storage.experiments.save(next);setList(current=>[...current,next]);setExperiment(next);setState('base');setSheet(false);setCreateMode(false)}catch(error){console.error('Experiment creation failed',error);setCreateError(error instanceof Error?error.message:'Unable to create Experiment.')}finally{entryBusy.current=false;setCreating(false)}};
 const [deleteOpen,setDeleteOpen]=useState(false);const [deleting,setDeleting]=useState(false);const [deleteError,setDeleteError]=useState('');const [editOpen,setEditOpen]=useState(false);const [editName,setEditName]=useState('');
 const deleteCurrentExperiment=async()=>{if(!experiment||deleting)return;setDeleting(true);setDeleteError('');try{await flush();await storage.experiments.delete(experiment.experimentId);await load();setDeleteOpen(false);setExperiment(undefined);setState('base');setCreateMode(false)}catch(error){setDeleteError(error instanceof Error?error.message:'Unable to delete Experiment.')}finally{setDeleting(false)}};
 const selectedVariant=experiment&&state!=='base'?experiment.variants.find(v=>v.variantId===state):undefined
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
   return <WideWorkspaceShell className="experiment-detail" headerActions={<><button className="experiment-name-edit-action" type="button" onClick={()=>{setEditName(experiment.name);setEditOpen(true)}}>EDIT NAME</button><button className="experiment-delete-action" type="button" onClick={()=>{setDeleteError('');setDeleteOpen(true)}}>DELETE EXPERIMENT</button></>} eyebrow={t.detail} formulaId={formula.formulaId} formulaName={formula.name} context={experiment.name + " · BASE: " + baseLabel(experiment,versions,language)} closeLabel={t.backList} onClose={()=>void leaveDetail()}>{saving==='SAVE FAILED'&&<p role="alert">Unable to save Experiment. Please try closing again to retry.</p>}<nav className="experiment-navigation"><div className="experiment-tabs"><button type="button" aria-pressed={state==='base'} className={state==='base'?'active':''} onClick={()=>setState('base')}>BASE</button>{experiment.variants.map(v=><button type="button" key={v.variantId} aria-pressed={state===v.variantId} className={state===v.variantId?'active':''} onClick={()=>setState(v.variantId)}>{v.label}</button>)}</div><div className="experiment-navigation-actions"><button type="button" onClick={()=>{const next=addVariantFromBase(experiment);queue(next);setState(next.variants[next.variants.length-1].variantId)}}>{t.addVariant}</button><button type="button" disabled={!experiment.variants.length||(experiment.variants.length>4&&!selectedVariantIds.length)} onClick={()=>void openSheet()}>{t.sheet}</button></div></nav>{experiment.variants.length>4&&<section className="experiment-state-selector"><div className="experiment-selector-caption"><strong>{t.compare} · {selectedVariantIds.length} / 4</strong><span>{t.compareHint}</span></div>{experiment.variants.map(v=><label key={v.variantId}><input type="checkbox" checked={selectedVariantIds.includes(v.variantId)} disabled={!selectedVariantIds.includes(v.variantId)&&selectedVariantIds.length>=4} onChange={()=>toggleVariant(v.variantId)}/> {v.label}</label>)}</section>}{state==='base'?<BaseNotebook experiment={experiment} sourceLabel={baseLabel(experiment,versions,language)}/>:selectedVariant?<VariantEditor experiment={experiment} variant={selectedVariant} onChange={queue} onDelete={()=>{if(confirm('Delete this Variant?')){try{const next=removeVariant(experiment,state);queue(next);setState('base')}catch{setSaving('SAVE FAILED')}}}} saving={saving}/>:<BaseNotebook experiment={experiment} sourceLabel={baseLabel(experiment,versions,language)}/>}</WideWorkspaceShell>
 }
 const renderSheet=()=>{
   if(!experiment)return null
   return viewport==='unsupported'?<ExperimentViewportGate mode={viewport} onClose={()=>setSheet(false)}/>:<ExperimentComparisonSheet experiment={experiment} formula={formula} language={language} variantIds={experiment.variants.length>4?selectedVariantIds:undefined} onClose={()=>setSheet(false)}/>
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
 return createPortal(<div className="experiments-layer" ref={layerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={language==='ko'?'실험':'Experiments'} onKeyDown={event=>{
   if(event.key==='Escape'&&!editOpen&&!deleteOpen){
     event.preventDefault();event.stopPropagation()
     if(sheet)setSheet(false);else if(experiment)void leaveDetail();else closeEntry()
   }
   if(event.key==='Tab'&&!editOpen&&!deleteOpen&&experiment){
     const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])')).filter(item=>item.getClientRects().length)
     const first=items[0],last=items[items.length-1]
     if(!first){event.preventDefault();return}
     if(event.shiftKey&&(document.activeElement===first||document.activeElement===event.currentTarget)){event.preventDefault();last.focus()}
     else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===event.currentTarget)){event.preventDefault();first.focus()}
   }
 }}><div inert={editOpen||deleteOpen}>{experiment?(sheet?renderSheet():renderDetail()):renderEntryModal()}</div>{renderDeleteModal()}{renderEditModal()}</div>,document.body)
}
function NotebookHead(){return <thead><tr><th>PARTS</th><th>MATERIAL NAME</th><th>DILUTION</th><th>MEMO</th><th>DELETE</th></tr></thead>}
function NotebookSummary({rows,note,onNote}:{rows:FormulaSnapshotRow[];note:string;onNote?:(value:string)=>void}){
 const total=calculateFormulaTotals(rows.map(row=>({...row,id:row.rowId}))).totalParts
 return <div className="experiment-summary"><div><label className="experiment-summary-title" htmlFor={onNote?'variant-note':undefined}>Notes</label>{onNote?<textarea id="variant-note" aria-label="Variant note" value={note} onChange={e=>onNote(e.target.value)}/>:<p className="experiment-fixed-note">{note||'—'}</p>}</div><div className="experiment-metrics"><div className="experiment-summary-title">Total</div><div className="experiment-total-panel"><span>PARTS</span><strong>{total.toLocaleString()} <small>/ 1,000</small></strong></div></div></div>
}
function BaseNotebook({experiment,sourceLabel}:{experiment:Experiment;sourceLabel:string}){
 return <section className="experiment-notebook"><div className="experiment-variant-heading"><span>BASE · {sourceLabel}</span><span className="experiment-read-only-badge">READ ONLY</span></div><table className="experiment-material-table"><NotebookHead/><tbody>{experiment.baseSnapshot.rows.map(row=><tr key={row.rowId}><td className="experiment-parts">{row.parts}</td><td className="experiment-material"><span>{row.material}</span></td><td className="experiment-dilution">{row.dilution?.enabled?<><button className="experiment-dilution-badge--active" type="button" aria-label="DIL" disabled>DIL</button><span className="experiment-dilution-value">@{row.dilution.percent}% in {row.dilution.solvent}</span></>:'—'}</td><td className="experiment-row-memo">{row.memo||'—'}</td><td className="experiment-delete-cell">—</td></tr>)}</tbody></table><NotebookSummary rows={experiment.baseSnapshot.rows} note={experiment.baseSnapshot.notes}/></section>
}
function VariantEditor({experiment,variant,onChange,onDelete,saving}:{experiment:Experiment;variant:import('../models/experiment').ExperimentVariant;onChange:(e:Experiment)=>void;onDelete:()=>void;saving:string}){
 const baseRowIds=new Set(experiment.baseSnapshot.rows.map(row=>row.rowId))
 const baseRowsById=new Map(experiment.baseSnapshot.rows.map(row=>[row.rowId,row]))
 const isChangedFromBase=(row:FormulaSnapshotRow)=>{const base=baseRowsById.get(row.rowId);return !base||row.parts!==base.parts}
 const update=(rowId:string,changes:Partial<FormulaSnapshotRow>)=>onChange(updateVariantRow(experiment,variant.variantId,rowId,changes))
 return <section className="experiment-notebook">
  <div className="experiment-variant-heading"><span>VARIANT {variant.label}</span><div className="experiment-variant-heading__actions"><span className="experiment-save-status" data-state={saving.startsWith('SAVING')?'saving':saving==='SAVE FAILED'?'failed':'saved'} role="status" aria-live="polite">{saving}</span><button className="experiment-delete-variant" type="button" onClick={onDelete}>DELETE VARIANT</button></div></div>
  <table className="experiment-material-table"><NotebookHead/><tbody>{variant.snapshot.rows.map(row=><tr className={isChangedFromBase(row)?'experiment-row--marked':''} key={row.rowId}>
   <td className="experiment-parts"><input aria-label="Parts" type="number" value={row.parts} onChange={e=>update(row.rowId,{parts:e.target.value===''?'':Number(e.target.value)})}/></td>
   <td className="experiment-material"><input aria-label="Material name" disabled={baseRowIds.has(row.rowId)} value={row.material} onChange={e=>update(row.rowId,{material:e.target.value})}/></td>
   <td><div className="experiment-dilution"><button type="button" aria-label="Dilution" disabled={baseRowIds.has(row.rowId)} aria-pressed={row.dilution?.enabled??false} onClick={()=>update(row.rowId,{dilution:{enabled:!row.dilution?.enabled,percent:row.dilution?.percent??1,solvent:row.dilution?.solvent??'ALC'}})}>DIL</button>{row.dilution?.enabled&&baseRowIds.has(row.rowId)&&<span className="experiment-dilution-value">@{row.dilution.percent}% in {row.dilution.solvent}</span>}{row.dilution?.enabled&&!baseRowIds.has(row.rowId)&&<div className="experiment-dilution-fields"><span>@</span><input aria-label="Dilution percent" type="number" value={row.dilution.percent} onChange={e=>update(row.rowId,{dilution:{...row.dilution!,percent:Number(e.target.value)}})}/><span>% in</span><input aria-label="Dilution solvent" value={row.dilution.solvent} onChange={e=>update(row.rowId,{dilution:{...row.dilution!,solvent:e.target.value}})}/></div>}</div></td>
   <td className="experiment-row-memo"><input aria-label={`Memo for ${row.material||'material'}`} placeholder="MEMO" value={row.memo??''} onChange={e=>update(row.rowId,{memo:e.target.value})}/></td>
   <td><button className="experiment-remove" type="button" aria-label="Remove material" onClick={()=>onChange(removeVariantRow(experiment,variant.variantId,row.rowId))}>×</button></td>
  </tr>)}</tbody></table>
  <div className="experiment-editor-actions"><button type="button" onClick={()=>onChange(addVariantRow(experiment,variant.variantId,{material:'',cas:'',parts:''}))}>+ ADD MATERIAL</button></div>
  <NotebookSummary rows={variant.snapshot.rows} note={variant.note} onNote={value=>onChange(updateVariantNote(experiment,variant.variantId,value))}/>
 </section>
}

function ExperimentViewportGate({mode,onClose}:{mode:ExperimentViewportMode;onClose:()=>void}){const unsupported=mode==='unsupported';return <main className="experiments-workspace experiments-viewport-gate"><button className="experiments-close" type="button" aria-label="Close Experiments" onClick={onClose}>×</button><div role="status"><div className="experiments-eyebrow">EXPERIMENTS WORKSPACE</div><h1>{unsupported?'WORKSPACE UNAVAILABLE':'ROTATE YOUR DEVICE'}</h1><p>{unsupported?'This workspace is available on desktop and landscape tablets.':'Experiments works best in landscape orientation.'}</p></div></main>}
