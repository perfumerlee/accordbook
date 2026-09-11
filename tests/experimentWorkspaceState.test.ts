import { describe, expect, it } from 'vitest'
import type { Experiment } from '../src/models/experiment'
import { buildComparisonFamilies, deriveExperimentNavigation } from '../src/services/experimentWorkspaceState'
import { experimentComparisonStates } from '../src/services/experimentComparison'
import { removeVariant } from '../src/services/experimentLifecycle'
import { isLatestExperimentRevisionPersisted, reconcileExperimentSelection, resolveSelectionAfterVariantDelete, selectionForListReentry } from '../src/services/experimentWorkspaceState'

const experiment = (ids: string[]): Experiment => ({ experimentId: 'e', parentFormulaId: 'f', name: 'Study', createdAt: '', updatedAt: '', baseSource: { kind: 'current', sourceCurrentUpdatedAt: '' }, baseSnapshot: { name: 'Study', date: '', notes: '', formulaId: 'ACC-1', rows: [] }, nextVariantOrdinal: ids.length, variants: ids.map((variantId, index) => ({ variantId, parentVariantId: null, label: String.fromCharCode(65 + index), createdAt: '', updatedAt: '', note: '', snapshot: { rows: [] } })) })

describe('experiment workspace selection', () => {
  it('keeps every A–U stress candidate in its family without changing comparison state', () => {
    const ids=Array.from({length:21},(_,i)=>String.fromCharCode(65+i))
    const value=experiment([...ids,'A1','A2','A3','B1','D1','J1','J2'])
    const parents:Record<string,string>={A1:'A',A2:'A',A3:'A',B1:'B',D1:'D',J1:'J',J2:'J'}
    value.variants.forEach(v=>{v.label=v.variantId;v.parentVariantId=parents[v.variantId]??null})
    const families=buildComparisonFamilies(value)
    expect(families.map(f=>f.parent.variantId)).toEqual(ids)
    expect(families.flatMap(f=>[f.parent,...f.children])).toHaveLength(28)
    expect(families[0].children.map(v=>v.variantId)).toEqual(['A1','A2','A3'])
    expect(families[9].children.map(v=>v.variantId)).toEqual(['J1','J2'])
    expect(deriveExperimentNavigation(value,'U').topLevel.map(v=>v.variantId)).toEqual(ids)
    expect(deriveExperimentNavigation(value,'A2').children.map(v=>v.variantId)).toEqual(['A1','A2','A3'])
    expect(experimentComparisonStates(value,['U','A2','J1','B1']).map(s=>s.id)).toEqual(['base','U','A2','B1','J1'])
  })
  it('exposes all four top-level comparison candidates without Branches', () => {
    const value=experiment(['a','b','c','d'])
    expect(buildComparisonFamilies(value).map(f=>[f.parent.variantId,f.children.length])).toEqual([['a',0],['b',0],['c',0],['d',0]])
    expect(experimentComparisonStates(value,['b','d']).map(s=>s.id)).toEqual(['base','b','d'])
  })
  it('groups mixed creation order structurally and preserves Sheet ordering and cap', () => {
    const value=experiment(['a','a1','b','c','d','c1','c2'])
    value.variants[1].parentVariantId='a'
    value.variants[5].parentVariantId='c'
    value.variants[6].parentVariantId='c'
    const before=JSON.stringify(value)
    expect(buildComparisonFamilies(value).map(f=>[f.parent.variantId,f.children.map(c=>c.variantId)])).toEqual([
      ['a',['a1']],['b',[]],['c',['c1','c2']],['d',[]]
    ])
    expect(experimentComparisonStates(value,['c2','d','a1','c1','b']).map(s=>s.id)).toEqual(['base','a1','b','d','c1'])
    expect(JSON.stringify(value)).toBe(before)
  })
  it('counts direct children only and groups legacy labels by parent ID', () => {
    const value=experiment(['a','x','y','b','z','c','deep'])
    value.variants[1].parentVariantId='a'
    value.variants[1].label='D'
    value.variants[2].parentVariantId='a'
    value.variants[4].parentVariantId='b'
    value.variants[6].parentVariantId='x'
    const families=buildComparisonFamilies(value)
    expect(families.map(f=>f.children.length)).toEqual([2,1,0])
    expect(families[0].children[0].label).toBe('D')
    expect(families.map(f=>f.parent.variantId)).toEqual(['a','b','c'])
  })
  const familyFixture = () => {
    const value = experiment(['a','a1','a2','b','b1','b2','c'])
    for (const variant of value.variants) {
      variant.label=variant.variantId.toUpperCase()
      if (variant.variantId.length===2) variant.parentVariantId=variant.variantId[0]
    }
    return value
  }
  it.each(['a1','b2'])('resolves %s deletion against the resulting document', id => {
    const value=familyFixture()
    const fallback=resolveSelectionAfterVariantDelete(value,id)
    const next=removeVariant(value,id)
    expect(reconcileExperimentSelection(next,fallback)).toEqual({variantId:id[0]})
    expect(next.variants.some(v=>v.variantId===id)).toBe(false)
  })
  it('returns BASE for top-level, missing and malformed parents', () => {
    const value=familyFixture()
    expect(reconcileExperimentSelection(removeVariant(value,'c'),resolveSelectionAfterVariantDelete(value,'c'))).toBe('base')
    value.variants.find(v=>v.variantId==='a1')!.parentVariantId='missing'
    expect(resolveSelectionAfterVariantDelete(value,'a1')).toBe('base')
    expect(resolveSelectionAfterVariantDelete(value,'unknown')).toBe('base')
  })
  it('keeps the selected parent and children when lifecycle deletion is blocked', () => {
    const value=familyFixture()
    expect(()=>removeVariant(value,'a')).toThrow()
    expect(reconcileExperimentSelection(value,{variantId:'a'})).toEqual({variantId:'a'})
    expect(deriveExperimentNavigation(value,'a').children.map(v=>v.variantId)).toEqual(['a1','a2'])
  })
  it.each([
    ['base',undefined,[]], ['a','a',['a1','a2']], ['a1','a',['a1','a2']],
    ['b','b',['b1','b2']], ['b2','b',['b1','b2']], ['c','c',[]], ['missing',undefined,[]]
  ])('derives only the active family for %s', (id,parent,children) => {
    const navigation=deriveExperimentNavigation(familyFixture(),id as string)
    expect(navigation.topLevel.map(v=>v.variantId)).toEqual(['a','b','c'])
    expect(navigation.activeFamily?.variantId).toBe(parent)
    expect(navigation.children.map(v=>v.variantId)).toEqual(children)
  })
  it('groups a legacy D child by ID without renaming it', () => {
    const value=familyFixture()
    value.variants.find(v=>v.variantId==='a1')!.label='D'
    const navigation=deriveExperimentNavigation(value,'a1')
    expect(navigation.activeFamily?.variantId).toBe('a')
    expect(navigation.children.map(v=>v.label)).toEqual(['D','A2'])
    expect(navigation.topLevel.map(v=>v.label)).toEqual(['A','B','C'])
  })
  it('falls back to BASE for a variant from another Experiment', () => {
    expect(reconcileExperimentSelection(experiment(['e2-a']), { variantId: 'e1-a' })).toBe('base')
  })
  it('preserves only a valid Variant selection', () => {
    expect(reconcileExperimentSelection(experiment(['e2-a']), { variantId: 'e2-a' })).toEqual({ variantId: 'e2-a' })
    expect(selectionForListReentry()).toBe('base')
  })
  it('falls back to a surviving direct parent after child deletion', () => {
    const value = experiment(['a', 'a1'])
    value.variants[0].label = 'A'
    value.variants[1].label = 'D'
    value.variants[1].parentVariantId = 'a'
    expect(resolveSelectionAfterVariantDelete(value, 'a1')).toEqual({ variantId: 'a' })
    expect(resolveSelectionAfterVariantDelete(value, 'a')).toBe('base')
  })
  it('does not treat an older save as SAVED for a newer local revision', () => {
    expect(isLatestExperimentRevisionPersisted(2, 1)).toBe(false)
    expect(isLatestExperimentRevisionPersisted(2, 2)).toBe(true)
  })
})
