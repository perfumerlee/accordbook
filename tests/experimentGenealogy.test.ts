import { describe, expect, it } from 'vitest'
import type { Formula } from '../src/models/formula'
import { addVariantFromBase, addVariantFromVariant, createExperimentFromCurrent, removeVariant } from '../src/services/experimentLifecycle'
import { buildVariantTree, canCreateBranchFrom, getVariantAncestors, getVariantChildren, getVariantDepth, getVariantSiblings } from '../src/services/experimentGenealogy'

const formula = (): Formula => ({ id: 'f', formulaId: 'ACC-1', date: '2026-01-01', name: 'Study', notes: '', rows: [{ id: 'r', rowId: 'r', material: 'A', parts: 1 }], createdAt: '', updatedAt: '' })

describe('Experiment genealogy helpers and policy', () => {
  it('derives children, ancestors, siblings, depth, and tree from ids', () => {
    let experiment = createExperimentFromCurrent(formula())
    experiment = addVariantFromBase(experiment)
    const a = experiment.variants[0]
    experiment = addVariantFromVariant(experiment, a.variantId)
    const a1 = experiment.variants[1]
    experiment = addVariantFromVariant(experiment, a.variantId)
    const a2 = experiment.variants[2]
    expect(a1.label).toBe('A1'); expect(a2.label).toBe('A2')
    expect(getVariantChildren(experiment, a.variantId).map(v => v.variantId)).toEqual([a1.variantId, a2.variantId])
    expect(getVariantAncestors(experiment, a2.variantId).map(v => v.variantId)).toEqual([a.variantId])
    expect(getVariantSiblings(experiment, a2.variantId).map(v => v.variantId)).toEqual([a1.variantId])
    expect(getVariantDepth(experiment, a2.variantId)).toBe(2)
    expect(buildVariantTree(experiment)[0].children).toHaveLength(2)
  })
  it('does not reuse deleted child labels and blocks deeper creation', () => {
    let experiment = createExperimentFromCurrent(formula())
    experiment = addVariantFromBase(experiment)
    const parent = experiment.variants[0]
    experiment = addVariantFromVariant(experiment, parent.variantId)
    const child = experiment.variants[1]
    experiment = removeVariant(experiment, child.variantId)
    experiment = addVariantFromVariant(experiment, parent.variantId)
    expect(experiment.variants[1].label).toBe('A2')
    expect(canCreateBranchFrom(experiment, parent.variantId)).toBe(true)
    expect(canCreateBranchFrom(experiment, experiment.variants[1].variantId)).toBe(false)
    expect(() => addVariantFromVariant(experiment, experiment.variants[1].variantId)).toThrow('one level')
  })
})
