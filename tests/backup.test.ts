import { describe, expect, it } from 'vitest'
import { createBackup } from '../src/services/exportJson'
import { BackupImportError, parseBackup, importBackup } from '../src/services/importJson'
import { createStorage } from '../src/storage/storageService'

const data = { settings: { formulaIdPrefix: 'ACC', language: 'en' as const }, formulas: [], archive: [], meta: { 'ACC-2608': 17 } }

describe('backup and import', () => {
  it('creates a versioned backup with all notebook stores', async () => { const storage = await createStorage(); await storage.importData(data); const backup = await createBackup(storage); expect(backup.app).toBe('Accordbook'); expect(backup.formatVersion).toBe(1); expect(backup.exportedAt).toBeTruthy(); expect(backup.data.meta['ACC-2608']).toBe(17); expect(JSON.stringify(backup)).toBeTruthy() })
  it('validates JSON and normalizes optional formula fields', () => { const parsed = parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 1, data: { settings: {}, formulas: [{ id: 'f', formulaId: 'ACC-2608-001', date: '2026-08-28', rows: [] }], archive: [], meta: {} } })); expect(parsed.data.formulas[0].name).toBe(''); expect(parsed.data.formulas[0].notes).toBe('') })
  it('rejects malformed and unsupported backups', () => { expect(() => parseBackup('{')).toThrow(BackupImportError); expect(() => parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 2, data: {} }))).toThrow(BackupImportError) })
  it('replaces stores and restores meta sequence', async () => { const storage = await createStorage(); await importBackup(storage, parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 1, data })) ); expect((await storage.exportData()).meta['ACC-2608']).toBe(17) })
})
