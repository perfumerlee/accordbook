import { describe, expect, it } from 'vitest'
import type { Formula, FormulaVersion } from '../src/models/formula'
import { createExperimentFromCurrent, createExperimentFromVersion } from '../src/services/experimentLifecycle'
import { baseLabel, displayDate, sourceOrder, stateLabel } from '../src/components/experimentPresentation'

const formula: Formula = { id: 'f', formulaId: 'ACC-001', name: 'Study', date: '2026-09-10', rows: [], notes: '', createdAt: '2026-09-10T00:00:00Z', updatedAt: '2026-09-10T00:00:00Z' }
const version = (n: number): FormulaVersion => ({ versionId: `v${n}`, parentFormulaId: 'f', versionNumber: n, kind: 'manual', note: '', createdAt: `2026-09-10T0${n}:00:00Z`, sourceCurrentUpdatedAt: formula.updatedAt, snapshot: { formulaId: formula.formulaId, name: formula.name, date: formula.date, rows: [], notes: '' } })

describe('Experiment presentation', () => {
  it('shows newest-first Time Machine source order without changing repository input', () => {
    const versions = [version(1), version(2), version(3)]
    expect(sourceOrder(versions).map(v => stateLabel(v, 'en'))).toEqual(['V3', 'V2', 'V1'])
    expect(versions.map(v => v.versionNumber)).toEqual([1, 2, 3])
  })
  it('reverses equal-date entries like Time Machine', () => {
    const versions = [version(1), { ...version(2), createdAt: version(1).createdAt }]
    expect(sourceOrder(versions).map(v => v.versionId)).toEqual(['v2', 'v1'])
  })
  it('resolves the actual source ID, not its position in the array', () => {
    const experiment = createExperimentFromVersion(formula, version(3))
    expect(baseLabel(experiment, [version(3), version(1)], 'en')).toBe('V3')
  })
  it('keeps CURRENT explicit and safely labels a removed source', () => {
    expect(baseLabel(createExperimentFromCurrent(formula), [], 'en')).toBe('CURRENT')
    expect(baseLabel(createExperimentFromVersion(formula, version(3)), [], 'ko')).toBe('저장된 버전')
  })
  it('does not pretend a restore point is a numbered manual version', () => {
    expect(stateLabel({ ...version(2), kind: 'restore-point' }, 'en')).toBe('Restore point')
  })
  it('formats dates for the UI and handles invalid dates', () => {
    expect(displayDate(formula.createdAt, 'en')).not.toContain('T00:00:00Z')
    expect(displayDate(formula.createdAt, 'ko')).toContain('9월')
    expect(displayDate('invalid', 'en')).toBe('—')
  })
})
