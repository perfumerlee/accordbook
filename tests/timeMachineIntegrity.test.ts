import { describe, expect, it } from 'vitest'
import { ensureTimeMachineIntegrity } from '../src/services/timeMachineIntegrity'
import { createStorage } from '../src/storage/storageService'

const formula = (id: string, archivedAt?: string) => ({ id, formulaId: `ACC-${id}`, date: '2026-09-03', name: id, notes: '', rows: [], createdAt: '2026-09-03T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z', ...(archivedAt ? { archivedAt } : {}) })
const version = (versionId: string, parentFormulaId: string, kind: 'manual' | 'restore-point' = 'manual') => ({ versionId, parentFormulaId, versionNumber: kind === 'manual' ? 1 : null, kind, createdAt: '2026-09-03T00:00:00.000Z', note: '', sourceCurrentUpdatedAt: '', snapshot: { name: parentFormulaId, date: '2026-09-03', notes: '', formulaId: `ACC-${parentFormulaId}`, rows: [] } })

describe('Time Machine integrity reconciliation', () => {
  it('removes only orphan history and preserves active/archive history', async () => {
    const storage = await createStorage(); await storage.importData({ settings: { formulaIdPrefix: 'ACC', language: 'en' }, formulas: [formula('A')], archive: [formula('B', '2026-09-03T00:00:00.000Z')], versions: [version('a-v1', 'A'), version('b-v1', 'B'), version('b-rp', 'B', 'restore-point'), version('x-v1', 'X')], meta: {} })
    expect(await ensureTimeMachineIntegrity(storage)).toBe(1)
    expect((await storage.versions.listAll()).map((item) => item.versionId).sort()).toEqual(['a-v1', 'b-rp', 'b-v1'])
    expect(await ensureTimeMachineIntegrity(storage)).toBe(0)
  })
})
