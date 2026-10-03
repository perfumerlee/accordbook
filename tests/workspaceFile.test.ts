import { describe, expect, it } from 'vitest'
import { toWorkspaceFile, serializeWorkspaceFile } from '../src/services/workspaceExport'
import { parseWorkspaceFile } from '../src/services/workspaceImport'
import { validateWorkspaceIntegrity } from '../src/services/workspaceValidation'
import { createExperimentFromCurrent } from '../src/services/experimentLifecycle'
import { workspaceFixture, stamp } from './workspaceFixtures'

describe('Workspace DTO boundary', () => {
  it('supports Formula alone without provenance or logical row IDs', async () => {
    const { formula } = await workspaceFixture()
    delete formula.releasedVersionId; delete formula.provenance; delete formula.rows[0].rowId
    const file = toWorkspaceFile({ formula, versions: [], experiments: [] }, stamp)
    expect(file).toMatchObject({ type: 'accordbook-workspace', formatVersion: 1, exportedAt: stamp, versions: [], experiments: [] })
    expect(file.formula.rows[0]).not.toHaveProperty('id')
    expect(file.formula.rows[0]).not.toHaveProperty('rowId')
    expect(parseWorkspaceFile(serializeWorkspaceFile(file))).toEqual(file)
  })
  it('round-trips all persisted history, IDs, source markers and array order independently', async () => {
    const source = await workspaceFixture()
    source.experiments.push(createExperimentFromCurrent(source.formula))
    const before = structuredClone(source)
    const file = toWorkspaceFile(source, stamp)
    expect(file.versions).toEqual(source.versions)
    expect(file.experiments).toEqual(source.experiments)
    expect(file.formula.provenance).toEqual(source.formula.provenance)
    expect(file.formula.rows[0]).toEqual({ rowId: 'logical-row', material: 'Rose', parts: 100, cas: '123', marked: true, memo: 'row memo', dilution: { enabled: true, percent: 10, solvent: 'DPG' } })
    expect(parseWorkspaceFile(serializeWorkspaceFile(file))).toEqual(file)
    file.experiments[0].variants[0].snapshot.rows[0].material = 'Changed'
    expect(source).toEqual(before)
  })
  it('allowlists every nested object and excludes credentials, editor IDs, archive and global fields', async () => {
    const source = await workspaceFixture()
    const contaminate = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(contaminate)
      else if (value && typeof value === 'object') {
        Object.values(value).forEach(contaminate)
        Object.assign(value, { sellerToken: 'DO_NOT_EXPORT', pin: 'DO_NOT_EXPORT', settings: { language: 'DO_NOT_EXPORT' } })
      }
    }
    contaminate(source)
    source.formula.archivedAt = stamp
    const file = toWorkspaceFile(source, stamp)
    const text = serializeWorkspaceFile(file)
    expect(text).not.toContain('DO_NOT_EXPORT')
    expect(text).not.toContain('editor-only')
    expect(file.formula).not.toHaveProperty('archivedAt')
    expect(Object.keys(file)).toEqual(['type', 'formatVersion', 'exportedAt', 'formula', 'versions', 'experiments'])
  })
  it('preserves historical Branch origin after the source Evaluation changes', async () => {
    const source = await workspaceFixture()
    source.experiments[0].variants[0].evaluations![0].observation = 'New observation'
    expect(toWorkspaceFile(source).experiments[0].variants[1].origin?.observation).toBe('Fresh')
  })
  it('offers an explicit async provenance verification hook without rewriting IDs', async () => {
    const file = toWorkspaceFile(await workspaceFixture())
    await expect(validateWorkspaceIntegrity(file, async p => p.recordId === file.formula.provenance!.recordId)).resolves.toBeUndefined()
    await expect(validateWorkspaceIntegrity(file, async () => false)).rejects.toThrow('integrity')
  })
})
