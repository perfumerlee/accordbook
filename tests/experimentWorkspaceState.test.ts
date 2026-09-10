import { describe, expect, it } from 'vitest'
import type { Experiment } from '../src/models/experiment'
import { isLatestExperimentRevisionPersisted, reconcileExperimentSelection, selectionForListReentry } from '../src/services/experimentWorkspaceState'

const experiment = (ids: string[]): Experiment => ({ experimentId: 'e', parentFormulaId: 'f', name: 'Study', createdAt: '', updatedAt: '', baseSource: { kind: 'current', sourceCurrentUpdatedAt: '' }, baseSnapshot: { name: 'Study', date: '', notes: '', formulaId: 'ACC-1', rows: [] }, nextVariantOrdinal: ids.length, variants: ids.map((variantId, index) => ({ variantId, parentVariantId: null, label: String.fromCharCode(65 + index), createdAt: '', updatedAt: '', note: '', snapshot: { rows: [] } })) })

describe('experiment workspace selection', () => {
  it('falls back to BASE for a variant from another Experiment', () => {
    expect(reconcileExperimentSelection(experiment(['e2-a']), { variantId: 'e1-a' })).toBe('base')
  })
  it('preserves only a valid Variant selection', () => {
    expect(reconcileExperimentSelection(experiment(['e2-a']), { variantId: 'e2-a' })).toEqual({ variantId: 'e2-a' })
    expect(selectionForListReentry()).toBe('base')
  })
  it('does not treat an older save as SAVED for a newer local revision', () => {
    expect(isLatestExperimentRevisionPersisted(2, 1)).toBe(false)
    expect(isLatestExperimentRevisionPersisted(2, 2)).toBe(true)
  })
})
