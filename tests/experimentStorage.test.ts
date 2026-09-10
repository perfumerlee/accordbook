import { describe, expect, it } from 'vitest'
import { createBackup } from '../src/services/exportJson'
import { importBackup, parseBackup } from '../src/services/importJson'
import { createExperimentFromCurrent, addVariantFromBase } from '../src/services/experimentLifecycle'
import { createStorage } from '../src/storage/storageService'
import type { Formula } from '../src/models/formula'

const formula = (id = 'formula-1'): Formula => ({ id, formulaId: `ACC-${id}`, date: '2026-09-10', name: 'Study', notes: '', rows: [{ id: 'editor', rowId: 'stable-row-1', material: 'Hedione', parts: 100, dilution: { enabled: true, percent: 10, solvent: 'DPG' } }], createdAt: '2026-09-10T00:00:00Z', updatedAt: '2026-09-10T01:00:00Z' })

describe('Experiment persistence and backup', () => {
  it('saves experiments with clone-safe repository boundaries', async () => {
    const storage = await createStorage(); const experiment = addVariantFromBase(createExperimentFromCurrent(formula())); await storage.formulas.save(formula()); await storage.experiments.save(experiment); experiment.baseSnapshot.rows[0].material = 'Changed'; const loaded = await storage.experiments.get(experiment.experimentId); expect(loaded?.baseSnapshot.rows[0].material).toBe('Hedione'); loaded!.variants[0].snapshot.rows[0].material = 'Changed again'; expect((await storage.experiments.get(experiment.experimentId))?.variants[0].snapshot.rows[0].material).toBe('Hedione')
  })
  it('round-trips v3 experiments and Formula rowId', async () => {
    const storage = await createStorage(); const source = formula(); const experiment = addVariantFromBase(createExperimentFromCurrent(source)); await storage.importData({ settings: { formulaIdPrefix: 'ACC', language: 'en' }, formulas: [source], archive: [], versions: [], experiments: [experiment], meta: {} }); const backup = await createBackup(storage); expect(backup.formatVersion).toBe(3); const parsed = parseBackup(JSON.stringify(backup)); await importBackup(storage, parsed); expect((await storage.experiments.get(experiment.experimentId))?.variants[0].snapshot.rows[0].rowId).toBe('stable-row-1'); expect((await storage.formulas.get(source.id))?.rows[0].rowId).toBe('stable-row-1')
  })
  it('clears experiments during legacy replacement', async () => {
    const storage = await createStorage(); const source = formula(); const experiment = createExperimentFromCurrent(source); await storage.importData({ settings: { formulaIdPrefix: 'ACC', language: 'en' }, formulas: [source], archive: [], versions: [], experiments: [experiment], meta: {} }); const legacy = parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 2, data: { settings: {}, formulas: [source], archive: [], versions: [], meta: {} } })); await importBackup(storage, legacy); expect(await storage.experiments.list()).toEqual([])
  })
})
