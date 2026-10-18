import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { Formula } from '../src/models/formula'
import { ArchiveRepository } from '../src/storage/archiveRepository'
import { createMemoryStorage, openDatabase, type StorageDatabase } from '../src/storage/database'
import { FormulaRepository } from '../src/storage/formulaRepository'
import { MetaRepository } from '../src/storage/metaRepository'
import { SettingsRepository } from '../src/storage/settingsRepository'
import { WorkspaceRepository, WorkspaceAppendConflict } from '../src/storage/workspaceRepository'
import type { AccordbookStorage } from '../src/storage/storageService'
import { createFormulaFromPaste, FormulaPasteCreationError } from '../src/services/formulaPasteCreation'
import { detectFormulaPasteColumns, parseFormulaPaste } from '../src/services/formulaPasteImport'
import { ExperimentRepository } from '../src/storage/experimentRepository'
import { VersionRepository } from '../src/storage/versionRepository'
import { calculateDilution } from '../src/services/dilutionCalculator'
import { calculateFormulaTotals } from '../src/services/formulaCalculator'
import { createFormulaVersion, createVersionSnapshot } from '../src/services/formulaVersionLifecycle'
import { createFormulaFromVersion, duplicateFormula } from '../src/services/formulaLifecycle'
import { toWorkspaceFile, serializeWorkspaceFile } from '../src/services/workspaceExport'
import { parseWorkspaceFile } from '../src/services/workspaceImport'
import { importWorkspace } from '../src/services/workspaceImporter'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function makeStorage(mode: 'memory' | 'indexeddb') {
  const db: StorageDatabase = mode === 'memory' ? createMemoryStorage() : await openDatabase()
  const storage = {
    mode: db.mode,
    settings: new SettingsRepository(db), meta: new MetaRepository(db),
    formulas: new FormulaRepository(db), archive: new ArchiveRepository(db),
    versions: new VersionRepository(db), experiments: new ExperimentRepository(db),
    workspaces: new WorkspaceRepository(db),
  } as unknown as AccordbookStorage
  return { db, storage }
}

const parsed = parseFormulaPaste('Material\tParts\nHedione\t400\nHedione\t200\nUnknown oil\t100')
const mapping = detectFormulaPasteColumns(parsed).mapping!
const input = { name: 'Imported study', parsed, mapping, edits: {}, now: new Date('2026-10-19T04:00:00.000Z') }
const pasteInput = (source: string, dilutionReviews?: Record<number, { mode: 'keep_original' } | { mode: 'apply'; material: string; percentInput: string; solventInput: string }>) => {
  const sourceParsed = parseFormulaPaste(source)
  return { ...input, parsed: sourceParsed, mapping: detectFormulaPasteColumns(sourceParsed).mapping!, edits: {}, dilutionReviews }
}

describe.each(['memory', 'indexeddb'] as const)('Formula paste creation: %s', mode => {
  beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()) })

  it('atomically creates one new Formula and keeps its rows, names, duplicate rows, and provenance', async () => {
    const { db, storage } = await makeStorage(mode)
    const blank: Formula = { id: 'existing-blank', formulaId: 'ACC-2610-001', date: '2026-10-19', name: '', notes: '', rows: [{ id: 'blank-row', rowId: 'blank-row-id', material: '', parts: '' }], createdAt: input.now.toISOString(), updatedAt: input.now.toISOString() }
    await storage.formulas.save(blank)
    await storage.meta.setSequence('ACC-2610', 1)
    const existing = await storage.formulas.list()
    const result = await createFormulaFromPaste(storage, input)

    expect(result).toMatchObject({ formulaId: 'ACC-2610-002', name: 'Imported study', notes: '', date: '2026-10-19' })
    expect(result.rows.map(row => [row.material, row.parts])).toEqual([['Hedione', 400], ['Hedione', 200], ['Unknown oil', 100]])
    expect(result.rows.every(row => row.id && row.rowId && row.id !== row.rowId)).toBe(true)
    expect(new Set(result.rows.map(row => row.id)).size).toBe(3)
    expect(result.rows.every(row => row.cas === undefined && row.dilution === undefined)).toBe(true)
    expect(result.provenance).toMatchObject({ claimedSource: { originType: 'imported' }, revisions: [{ eventType: 'imported' }] })
    expect(await storage.formulas.get(blank.id)).toEqual(existing[0])
    expect(await storage.formulas.list()).toHaveLength(2)
    expect(await storage.meta.getSequence('ACC-2610')).toBe(2)
    expect(await db.getAll('versions')).toEqual([])
    expect(await db.getAll('experiments')).toEqual([])
    expect((await storage.workspaces.readWorkspace(result.id))?.formula).toEqual(result)
  })

  it('does not persist a dilution proposal before a later review UI explicitly approves it', async () => {
    const { storage } = await makeStorage(mode)
    const proposalInput = {
      ...input,
      parsed: parseFormulaPaste('Material\tParts\nAmbroxan 10%\t1000'),
      mapping: detectFormulaPasteColumns(parseFormulaPaste('Material\tParts\nAmbroxan 10%\t1000')).mapping!,
    }
    const row = (await createFormulaFromPaste(storage, proposalInput)).rows[0]
    expect(row).toMatchObject({ material: 'Ambroxan 10%', parts: 1000 })
    expect(row.dilution).toBeUndefined()
  })

  it.each([
    ['Coumarin @10% in ALC', 'Coumarin', '10', 'ALC'],
    ['Coumarin @1% in DPG', 'Coumarin', '1', 'DPG'],
    ['Coumarin @0.1% in ALC', 'Coumarin', '0.1', 'ALC'],
    ['Ambroxan 10% in DPG', 'Ambroxan', '10', 'DPG'],
    ['Ethyl Maltol 1%', 'Ethyl Maltol', '1', 'ALC'],
    ['Ambroxan 0.1%', 'Ambroxan', '0.1', 'DPG'],
    ['Ambroxan 100%', 'Ambroxan', '100', 'DPG'],
    ['Ambroxan 0%', 'Ambroxan', '0', 'DPG'],
  ])('persists only explicitly approved values for %s while preserving Parts', async (sourceName, material, percentInput, solventInput) => {
    const { storage } = await makeStorage(mode)
    const reviewed = pasteInput(`Material\tParts\n${sourceName}\t100`, { 2: { mode: 'apply', material, percentInput, solventInput } })
    const result = await createFormulaFromPaste(storage, reviewed)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ material, parts: 100, dilution: { enabled: true, percent: Number(percentInput), solvent: solventInput } })
    expect(calculateFormulaTotals(result.rows).totalParts).toBe(100)
    expect(calculateDilution(result.rows[0])).toMatchObject({ activeParts: 100 * Number(percentInput) / 100, solventParts: 100 * (1 - Number(percentInput) / 100) })
    expect((await storage.formulas.get(result.id))?.rows[0]).toEqual(result.rows[0])
  })

  it('applies @ notation to the existing DIL field after approval and preserves 3 Parts on reload', async () => {
    const { storage } = await makeStorage(mode)
    const approved = pasteInput('Material\tParts\nCoumarin @10% in ALC\t3', {
      2: { mode: 'apply', material: 'Coumarin', percentInput: '10', solventInput: 'ALC' },
    })
    const result = await createFormulaFromPaste(storage, approved)
    expect(result.rows[0]).toEqual(expect.objectContaining({
      material: 'Coumarin', parts: 3, dilution: { enabled: true, percent: 10, solvent: 'ALC' },
    }))
    expect((await storage.formulas.get(result.id))?.rows[0]).toEqual(result.rows[0])
  })

  it('rejects invalid, missing-solvent, stale, or unrelated Apply decisions before persistence', async () => {
    const { storage } = await makeStorage(mode)
    const recognized = (decision: { mode: 'apply'; material: string; percentInput: string; solventInput: string }, edit?: string) => {
      const reviewed = pasteInput('Material\tParts\nAmbroxan 10%\t1000', { 2: decision })
      return { ...reviewed, edits: edit ? { 2: { material: edit } } : {} }
    }
    for (const reviewed of [
      recognized({ mode: 'apply', material: 'Ambroxan', percentInput: '10', solventInput: '' }),
      recognized({ mode: 'apply', material: 'Ambroxan', percentInput: '101', solventInput: 'DPG' }),
      recognized({ mode: 'apply', material: ' ', percentInput: '10', solventInput: 'DPG' }),
      recognized({ mode: 'apply', material: 'Ambroxan', percentInput: '10', solventInput: 'DPG' }, 'Hedione'),
      { ...pasteInput('Material\tParts\nHedione\t1000'), dilutionReviews: { 2: { mode: 'apply' as const, material: 'Hedione', percentInput: '10', solventInput: 'DPG' } } },
      { ...pasteInput('Material\tParts\nAmbroxan 10%\t1000'), dilutionReviews: { 999: { mode: 'apply' as const, material: 'Ambroxan', percentInput: '10', solventInput: 'DPG' } } },
    ]) {
      await expect(createFormulaFromPaste(storage, reviewed)).rejects.toMatchObject({ code: 'invalid-review' })
    }
    expect(await storage.formulas.list()).toEqual([])
  })

  it('keeps rejected and pending rows unchanged and validates duplicate rows independently', async () => {
    const { storage } = await makeStorage(mode)
    const pending = await createFormulaFromPaste(storage, pasteInput('Material\tParts\nAmbroxan 10%\t1000'))
    expect(pending.rows[0]).toMatchObject({ material: 'Ambroxan 10%', parts: 1000 })
    expect(pending.rows[0].dilution).toBeUndefined()

    const twoRows = pasteInput('Material\tParts\nAmbroxan 10%\t400\nAmbroxan 20%\t600', {
      2: { mode: 'apply', material: 'Ambroxan', percentInput: '10', solventInput: 'DPG' },
      3: { mode: 'keep_original' },
    })
    const result = await createFormulaFromPaste(storage, twoRows)
    expect(result.rows.map(row => [row.material, row.parts, row.dilution])).toEqual([
      ['Ambroxan', 400, { enabled: true, percent: 10, solvent: 'DPG' }], ['Ambroxan 20%', 600, undefined],
    ])
    expect(result.rows[0].id).not.toBe(result.rows[1].id)
    expect(calculateFormulaTotals(result.rows).totalParts).toBe(1000)
  })

  it('keeps the complete @ notation when the user chooses Keep Original', async () => {
    const { storage } = await makeStorage(mode)
    const original = 'Coumarin @10% in ALC'
    const result = await createFormulaFromPaste(storage, pasteInput(`Material\tParts\n${original}\t3`, {
      2: { mode: 'keep_original' },
    }))
    expect(result.rows[0]).toMatchObject({ material: original, parts: 3 })
    expect(result.rows[0].dilution).toBeUndefined()
  })

  it('round-trips approved dilution through IndexedDB, Time Machine, duplication, and workspace export/import', async () => {
    const { storage } = await makeStorage(mode)
    const source = pasteInput('Material\tParts\nAmbroxan 10% in DPG\t100\nHedione\t900', {
      2: { mode: 'apply', material: 'Ambroxan', percentInput: '10', solventInput: 'DPG' },
    })
    const formula = await createFormulaFromPaste(storage, source)
    expect((await storage.formulas.get(formula.id))?.rows[0].dilution).toEqual({ enabled: true, percent: 10, solvent: 'DPG' })

    const version = await createFormulaVersion(storage, formula, 'DIL-3 round trip')
    expect(version.snapshot.rows[0].dilution).toEqual(formula.rows[0].dilution)
    expect(createVersionSnapshot(formula).rows[0].dilution).toEqual(formula.rows[0].dilution)
    const restored = await createFormulaFromVersion(storage, version)
    expect(restored.rows[0].dilution).toEqual(formula.rows[0].dilution)
    const duplicated = await duplicateFormula(storage, formula)
    expect(duplicated.rows[0].dilution).toEqual(formula.rows[0].dilution)

    const workspace = toWorkspaceFile({ formula, versions: [version], experiments: [] })
    const parsedWorkspace = parseWorkspaceFile(serializeWorkspaceFile(workspace))
    expect(parsedWorkspace.formula.rows[0].dilution).toEqual(formula.rows[0].dilution)
    const imported = await importWorkspace(storage, parsedWorkspace, { now: new Date('2026-10-20T04:00:00.000Z') })
    expect(imported.ok).toBe(true)
    if (imported.ok) expect((await storage.formulas.get(imported.formulaId))?.rows[0].dilution).toEqual(formula.rows[0].dilution)
  })

  it('rejects invalid rows and blank names before persistence but allows incomplete totals', async () => {
    const { storage } = await makeStorage(mode)
    await expect(createFormulaFromPaste(storage, { ...input, edits: { 2: { partsText: '1.5' } } })).rejects.toMatchObject({ code: 'invalid-review' })
    await expect(createFormulaFromPaste(storage, { ...input, edits: { 2: { material: '' } } })).rejects.toMatchObject({ code: 'invalid-review' })
    await expect(createFormulaFromPaste(storage, { ...input, name: '  ' })).rejects.toMatchObject({ code: 'invalid-name' })
    const incomplete = await createFormulaFromPaste(storage, { ...input, name: 'Incomplete' })
    expect(incomplete.rows.map(row => row.parts)).toEqual([400, 200, 100])
    expect(await storage.meta.getSequence('ACC-2610')).toBe(1)
    const aboveTarget = await createFormulaFromPaste(storage, { ...input, name: 'Above target', edits: { 2: { partsText: '2000' } } })
    expect(aboveTarget.rows.map(row => row.parts)).toEqual([2000, 200, 100])
    expect(await storage.formulas.list()).toHaveLength(2)
  })

  it('re-proposes display IDs after a concurrent allocation and never overwrites an existing record', async () => {
    const { storage } = await makeStorage(mode)
    const append = vi.spyOn(storage.workspaces, 'appendWorkspaceAtomic')
    append.mockImplementationOnce(async () => {
      await storage.meta.setSequence('ACC-2610', 5)
      throw new WorkspaceAppendConflict('display-id-collision')
    }).mockImplementationOnce(async value => WorkspaceRepository.prototype.appendWorkspaceAtomic.call(storage.workspaces, value))
    const result = await createFormulaFromPaste(storage, input)
    expect(result.formulaId).toBe('ACC-2610-006')
    expect(append).toHaveBeenCalledTimes(2)
    expect(await storage.formulas.list()).toHaveLength(1)
  })

  it('keeps the dialog retryable when atomic persistence fails without partial writes', async () => {
    const { db, storage } = await makeStorage(mode)
    const approvedInput = pasteInput('Material\tParts\nAmbroxan 10%\t1000', { 2: { mode: 'apply', material: 'Ambroxan', percentInput: '10', solventInput: 'DPG' } })
    vi.spyOn(storage.workspaces, 'appendWorkspaceAtomic').mockRejectedValueOnce(new Error('quota'))
    await expect(createFormulaFromPaste(storage, approvedInput)).rejects.toBeInstanceOf(FormulaPasteCreationError)
    expect(await storage.formulas.list()).toEqual([])
    expect(await storage.meta.getSequence('ACC-2610')).toBeUndefined()
    vi.restoreAllMocks()
    const result = await createFormulaFromPaste(storage, approvedInput)
    expect(await storage.formulas.list()).toHaveLength(1)
    expect(result.rows[0].dilution).toEqual({ enabled: true, percent: 10, solvent: 'DPG' })
    expect(await db.getAll('versions')).toEqual([])
  })
})
