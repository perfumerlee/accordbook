import { describe, expect, it } from 'vitest'
import type { Experiment } from '../src/models/experiment'
import { buildExperimentRail, deriveActiveRailFamily, getRailComparisonCandidateIds } from '../src/services/experimentRail'
import { experimentComparisonStates } from '../src/services/experimentComparison'
import { removeVariant } from '../src/services/experimentLifecycle'
import {
  type ExperimentCompareSession, canOpenExperimentSheet, cancelCompareMode, closeExperimentSheetSession,
  commitCompareDraft, enterCompareMode, reconcileComparisonIds, reconcileCompareSession,
  resetExperimentCompareSession, toggleComparisonDraft,
} from '../src/services/experimentWorkspaceState'

function fixture(nodes: Array<[string, string | null, string?]>): Experiment {
  return {
    experimentId: 'experiment', parentFormulaId: 'formula', name: 'Rail', createdAt: '', updatedAt: '',
    baseSource: { kind: 'current', sourceCurrentUpdatedAt: '' },
    baseSnapshot: { name: 'Rail', date: '', notes: '', formulaId: 'ACC', rows: [] }, nextVariantOrdinal: 30,
    variants: nodes.map(([variantId, parentVariantId, label]) => ({ variantId, parentVariantId, label: label ?? variantId,
      createdAt: '', updatedAt: '', note: '', snapshot: { rows: [] } })),
  }
}
const mixed = () => fixture([['a',null],['b',null],['a1','a'],['c',null],['b1','b'],['a2','a']])
const selection = (ids: string[]): ExperimentCompareSession => ({ mode: 'navigation', committedIds: ids, draftIds: null })

describe('Rail families and compatibility', () => {
  it('keeps BASE separate and simple parents in established array order, not label order', () => {
    const model=buildExperimentRail(fixture([['id-z',null,'A'],['id-a',null,'Z'],['id-b',null,'B']]))
    expect(model.baseIncluded).toBe(true)
    expect(model.families.map(f=>[f.parent.variantId,f.children.length])).toEqual([['id-z',0],['id-a',0],['id-b',0]])
    expect(model.additionalLegacyCandidates).toEqual([])
  })
  it('groups mixed creation order with the same model for either mode', () => {
    const value=mixed(), before=JSON.stringify(value)
    const model=buildExperimentRail(value)
    expect(model.families.map(f=>[f.parent.variantId,f.children.map(v=>v.variantId)])).toEqual([
      ['a',['a1','a2']],['b',['b1']],['c',[]],
    ])
    expect(getRailComparisonCandidateIds(model)).toEqual(['a','a1','a2','b','b1','c'])
    enterCompareMode(value,selection(['b']))
    expect(buildExperimentRail(value)).toEqual(model)
    expect(JSON.stringify(value)).toBe(before)
  })
  it('uses existing chronological child ordering, with array order as tie breaker', () => {
    const value=mixed()
    value.variants[2].createdAt='2026-02-01'
    value.variants[5].createdAt='2026-01-01'
    expect(buildExperimentRail(value).families[0].children.map(v=>v.variantId)).toEqual(['a2','a1'])
  })
  it('groups legacy D by parent ID', () => {
    const model=buildExperimentRail(fixture([['a',null,'A'],['legacy','a','D']]))
    expect(model.families).toHaveLength(1)
    expect(model.families[0].children[0].label).toBe('D')
  })
  it.each([['base',null],['a','a'],['a1','a'],['a2','a'],['b1','b'],['missing',null]])('finds the active family for %s', (id,parent) => {
    expect(deriveActiveRailFamily(mixed(),id)?.variantId??null).toBe(parent)
  })
  it('preserves deep, orphan and cyclic candidates without promoting them into families', () => {
    const value=fixture([['a',null],['a1','a'],['deep','a1'],['orphan','missing'],['x','y'],['y','x']])
    const model=buildExperimentRail(value)
    expect(model.families[0].children.map(v=>v.variantId)).toEqual(['a1'])
    expect(model.additionalLegacyCandidates.map(v=>v.variantId)).toEqual(['deep','orphan','x','y'])
    expect(deriveActiveRailFamily(value,'deep')?.variantId).toBe('a')
    expect(deriveActiveRailFamily(value,'orphan')).toBeNull()
    expect(deriveActiveRailFamily(value,'x')).toBeNull()
    expect(getRailComparisonCandidateIds(model)).toHaveLength(6)
    expect(experimentComparisonStates(value,['deep']).map(v=>v.id)).toEqual(['base','deep'])
  })
  it('retains every A–U stress candidate', () => {
    const parents=Array.from({length:21},(_,i)=>String.fromCharCode(65+i))
    const value=fixture([...parents.map(id=>[id,null] as [string,null]),['A1','A'],['A2','A'],['A3','A'],['B1','B'],['D1','D'],['J1','J'],['J2','J']])
    const model=buildExperimentRail(value)
    expect(model.families.map(f=>f.parent.variantId)).toEqual(parents)
    expect(model.families[0].children).toHaveLength(3)
    expect(model.families[9].children).toHaveLength(2)
    expect(new Set(getRailComparisonCandidateIds(model)).size).toBe(28)
  })
  it('supports 12 children without applying comparison limits to genealogy', () => {
    const value=fixture([['a',null],...Array.from({length:12},(_,i)=>[`child-${i}`,'a'] as [string,string])])
    expect(buildExperimentRail(value).families[0].children).toHaveLength(12)
    expect(getRailComparisonCandidateIds(buildExperimentRail(value))).toHaveLength(13)
  })
})

describe('Rail compare session contract (pure, not wired to current UI)', () => {
  it('clones committed IDs on entry and never touches editing selection or content', () => {
    const value=mixed(), before=JSON.stringify(value), committed=['a','b']
    const editing={variantId:'a1'}
    const session=enterCompareMode(value,selection(committed))
    expect(session).toEqual({mode:'compare',committedIds:['a','b'],draftIds:['a','b']})
    expect(session.draftIds).not.toBe(committed)
    expect(editing).toEqual({variantId:'a1'})
    expect(JSON.stringify(value)).toBe(before)
  })
  it('cancels drafts and initializes the next draft from committed membership', () => {
    const value=mixed(), original=selection(['a','b'])
    let session=enterCompareMode(value,original)
    for (const id of ['a','b','a1','c']) session=toggleComparisonDraft(value,session,id)
    expect(session.draftIds).toEqual(['a1','c'])
    const canceled=cancelCompareMode(value,session)
    expect(canceled).toEqual(original)
    expect(enterCompareMode(value,canceled).draftIds).toEqual(['a','b'])
    expect(original.committedIds).toEqual(['a','b'])
  })
  it('commits validated draft and closes Sheet to navigation with committed IDs preserved', () => {
    const value=mixed(), session:ExperimentCompareSession={mode:'compare',committedIds:['a','b'],draftIds:['a1','c']}
    const committed=commitCompareDraft(value,session)!
    expect(committed).toEqual({mode:'navigation',committedIds:['a1','c'],draftIds:null})
    expect(closeExperimentSheetSession(value,committed)).toEqual(committed)
    expect(session.committedIds).toEqual(['a','b'])
  })
  it('rejects a fifth candidate without eviction, while allowing uncheck and replacement', () => {
    const value=fixture(['a','b','c','d','e'].map(id=>[id,null]))
    let session=enterCompareMode(value,selection(['a','b','c','d']))
    expect(toggleComparisonDraft(value,session,'e').draftIds).toEqual(['a','b','c','d'])
    session=toggleComparisonDraft(value,session,'b')
    expect(toggleComparisonDraft(value,session,'e').draftIds).toEqual(['a','c','d','e'])
    expect(commitCompareDraft(value,{mode:'compare',committedIds:[],draftIds:['a','b','c','d','e']})).toBeNull()
  })
  it('removes stale IDs and duplicates without filling gaps or reordering valid IDs', () => {
    expect(reconcileComparisonIds(mixed(),['a1','b','missing','a1','base'])).toEqual(['a1','b'])
  })
  it('prunes a deleted checked child from committed, active draft and Sheet payload', () => {
    const value=removeVariant(mixed(),'a1')
    const session=reconcileCompareSession(value,{mode:'compare',committedIds:['a1','b'],draftIds:['a1','c']})
    expect(session.committedIds).toEqual(['b'])
    expect(session.draftIds).toEqual(['c'])
    expect(enterCompareMode(value,cancelCompareMode(value,session)).draftIds).toEqual(['b'])
    expect(experimentComparisonStates(value,[...session.committedIds]).map(s=>s.id)).toEqual(['base','b'])
  })
  it('deleting an unchecked candidate keeps selected membership intact', () => {
    expect(reconcileComparisonIds(removeVariant(mixed(),'c'),['a','b'])).toEqual(['a','b'])
  })
  it('resets a new Experiment/Formula session to navigation and the existing first-four default', () => {
    const value=fixture(['y1','y2','y3','y4','y5'].map(id=>[id,null]))
    expect(resetExperimentCompareSession(value)).toEqual({mode:'navigation',committedIds:['y1','y2','y3','y4'],draftIds:null})
    expect(reconcileComparisonIds(value,['a','a1'])).toEqual([])
    expect(resetExperimentCompareSession(fixture([]))).toEqual({mode:'navigation',committedIds:[],draftIds:null})
  })
  it('rejects BASE and unknown toggles and ignores toggles outside compare mode', () => {
    const value=mixed(), state=enterCompareMode(value,selection(['a']))
    expect(toggleComparisonDraft(value,state,'base')).toEqual(state)
    expect(toggleComparisonDraft(value,state,'missing')).toEqual(state)
    expect(toggleComparisonDraft(value,selection(['a']),'b')).toEqual(selection(['a']))
  })
  it('preserves UI minimum of BASE plus one trial while calculation supports BASE alone', () => {
    const value=mixed()
    expect(canOpenExperimentSheet(value,[])).toBe(false)
    expect(canOpenExperimentSheet(value,['missing'])).toBe(false)
    expect(canOpenExperimentSheet(value,['a'])).toBe(true)
    expect(commitCompareDraft(value,enterCompareMode(value,selection([])))).toBeNull()
    expect(experimentComparisonStates(value,[]).map(s=>s.id)).toEqual(['base'])
  })
  it('preserves Sheet array ordering independently from Rail order and click order', () => {
    const value=fixture([['a',null],['d',null],['j',null],['j2','j'],['d1','d']])
    const ids=['d1','a','j2']
    expect(reconcileComparisonIds(value,ids)).toEqual(ids)
    expect(getRailComparisonCandidateIds(buildExperimentRail(value))).toEqual(['a','d','d1','j','j2'])
    expect(experimentComparisonStates(value,ids).map(s=>s.id)).toEqual(['base','a','j2','d1'])
  })
})
