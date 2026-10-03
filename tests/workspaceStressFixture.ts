import type { Formula, FormulaVersion } from '../src/models/formula'
import type { Experiment, ExperimentVariant } from '../src/models/experiment'
import type { WorkspaceFile } from '../src/models/workspaceFile'
import { createProvenance, revisionHashV1 } from '../src/services/provenance'
import { toWorkspaceFile, type WorkspaceSource } from '../src/services/workspaceExport'

const stamp = '2026-10-01T00:00:00.000Z'
export async function stressFixture(options: { materials?: number; versions?: number; points?: number; experiments?: number; variants?: number; revisions?: number } = {}): Promise<WorkspaceSource> {
  const count = { materials:75, versions:200, points:20, experiments:30, variants:18, revisions:300, ...options }
  const formula: Formula = { id:'stress-source',formulaId:'QA-2610-001',name:'Large synthetic perfumery study',date:'2026-10-01',notes:'Deterministic QA notes. No customer data.',createdAt:stamp,updatedAt:stamp,
    rows:Array.from({length:count.materials},(_,i)=>({id:`runtime-${i}`,rowId:`row-${i}`,material:i<2?'Synthetic duplicate':`Synthetic material ${i}`,parts:i===count.materials-1?1000-(count.materials-1)*10:10,cas:`QA-${i}`,marked:i%7===0,...(i%5===0?{dilution:{enabled:true,percent:10,solvent:'DPG'}}:{})})) }
  formula.provenance=await createProvenance(formula,'created',{originType:'original',creator:'Synthetic QA',note:'Origin QA'})
  const p=formula.provenance;p.recordId='stress-record';p.rootRecordId=p.recordId;p.revisions=[]
  if(p.checkpoint)p.checkpoint.recordedAt=stamp
  let previous: string|null=null
  for(let i=0;i<count.revisions;i++){
    const payload={recordId:p.recordId,revisionId:`revision-${i}`,sequence:i+1,eventType:i===0?'created' as const:'modified' as const,recordedAt:stamp,contentFingerprint:p.currentFingerprint,previousRevisionHash:previous}
    const hash=await revisionHashV1(payload);const {recordId:_record,...revision}=payload
    p.revisions.push({...revision,revisionHash:hash,revisionHashPayloadVersion:1});previous=hash
  }
  p.currentRevisionHash=previous!
  const rows=formula.rows.map(({id:_id,...row})=>row)
  const versions:FormulaVersion[]=Array.from({length:count.versions+count.points},(_,i)=>{
    const historical=structuredClone(rows)
    if(i%3===0){historical[0].material='Renamed synthetic';historical[1].cas='QA-CAS-change';historical[2].dilution={enabled:true,percent:20,solvent:'ALC'};historical[3]={...historical[3],rowId:`removed-${i}`,material:'Historical removed row'}}
    return {versionId:`version-${i}`,parentFormulaId:formula.id,kind:i<count.versions?'manual':'restore-point',versionNumber:i<count.versions?i+1:null,createdAt:stamp,note:`Version note ${i}`,sourceCurrentUpdatedAt:stamp,sourceRevisionId:p.revisions[i%p.revisions.length].revisionId,
      snapshot:{name:formula.name,date:formula.date,formulaId:formula.formulaId,notes:`Historical notes ${i}`,rows:historical,claimedSource:structuredClone(p.claimedSource)}}
  })
  if(count.versions)formula.releasedVersionId=versions[count.versions-1].versionId
  const experiments:Experiment[]=Array.from({length:count.experiments},(_,n)=>{
    const variants:ExperimentVariant[]=Array.from({length:count.variants},(_,i)=>{
      const parent=i<6?null:i===6?0:i-1
      const evaluationId=`evaluation-${n}-${i}`
      return {variantId:`variant-${n}-${i}`,parentVariantId:parent===null?null:`variant-${n}-${parent}`,label:i<6?String.fromCharCode(65+i):'A1'+'.1'.repeat(i-6),createdAt:stamp,updatedAt:stamp,nextChildOrdinal:2,note:`Variant notes ${n}/${i}`,snapshot:{rows:structuredClone(rows)},
        evaluations:[{evaluationId,createdAt:stamp,updatedAt:stamp,snapshot:{rows:structuredClone(rows)},observation:`Observation ${n}/${i}`,verdict:'continue',nextAction:'Adjust synthetic material',decisionNote:'Keep historical observation'}],
        ...(parent===null?{}:{sourceEvaluationId:`evaluation-${n}-${parent}`,evaluationBranchPurpose:'development' as const,origin:{evaluationId:`evaluation-${n}-${parent}`,observation:`Observation ${n}/${parent}`,verdict:'continue' as const,nextAction:'Adjust synthetic material',decisionNote:'Keep historical observation',branchPurpose:'development' as const},intent:{branchPurpose:'development' as const,changeIntent:'Reduce one part',hypothesis:'More transparent'}})}
    })
    return {experimentId:`experiment-${n}`,parentFormulaId:formula.id,name:`Study ${String(n).padStart(3,'0')}`,createdAt:stamp,updatedAt:stamp,nextVariantOrdinal:Math.min(6,count.variants),baseSource:count.versions&&n%2===0?{kind:'version',sourceVersionId:versions[n%count.versions].versionId}:{kind:'current',sourceCurrentUpdatedAt:stamp},baseSnapshot:{name:formula.name,date:formula.date,formulaId:formula.formulaId,notes:`BASE note ${n}`,rows:structuredClone(rows)},variants}
  })
  return {formula,versions,experiments}
}

/** Normalize regenerated IDs only. Unique fixture notes/names identify standalone records. */
export function normalizeStressImport(records:WorkspaceSource, original:WorkspaceFile):WorkspaceFile {
  const file=toWorkspaceFile(records,original.exportedAt)
  const versionMap=new Map(file.versions.map(v=>[v.versionId,original.versions.find(o=>o.note===v.note)!.versionId]))
  file.formula.id=original.formula.id;file.formula.formulaId=original.formula.formulaId
  if(file.formula.releasedVersionId)file.formula.releasedVersionId=versionMap.get(file.formula.releasedVersionId)!
  const p=file.formula.provenance!;p.revisions.pop();p.currentRevisionHash=p.revisions.at(-1)!.revisionHash
  for(const r of p.revisions)if(r.restoredFromVersionId)r.restoredFromVersionId=versionMap.get(r.restoredFromVersionId)!
  for(const v of file.versions){v.parentFormulaId=original.formula.id;v.versionId=versionMap.get(v.versionId)!}
  file.versions.sort((a,b)=>original.versions.findIndex(v=>v.versionId===a.versionId)-original.versions.findIndex(v=>v.versionId===b.versionId))
  for(const e of file.experiments){
    const old=original.experiments.find(o=>o.name===e.name)!
    const variants=new Map(e.variants.map((v,i)=>[v.variantId,old.variants[i].variantId]))
    const evaluations=new Map(e.variants.map((v,i)=>[v.variantId,new Map((v.evaluations??[]).map((ev,j)=>[ev.evaluationId,old.variants[i].evaluations![j].evaluationId]))]))
    e.experimentId=old.experimentId;e.parentFormulaId=original.formula.id
    if(e.baseSource.kind==='version')e.baseSource.sourceVersionId=versionMap.get(e.baseSource.sourceVersionId)!
    for(const v of e.variants){
      if(v.sourceEvaluationId)v.sourceEvaluationId=evaluations.get(v.parentVariantId!)!.get(v.sourceEvaluationId)!
      if(v.origin)v.origin.evaluationId=v.sourceEvaluationId!
      for(const ev of v.evaluations??[])ev.evaluationId=evaluations.get(v.variantId)!.get(ev.evaluationId)!
      if(v.parentVariantId)v.parentVariantId=variants.get(v.parentVariantId)!
      v.variantId=variants.get(v.variantId)!
    }
  }
  file.experiments.sort((a,b)=>original.experiments.findIndex(e=>e.experimentId===a.experimentId)-original.experiments.findIndex(e=>e.experimentId===b.experimentId))
  return file
}
