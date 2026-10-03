import { describe, expect, it } from 'vitest'
import { toFormulaFile } from '../src/models/formulaFile'
import { parseFormulaFile } from '../src/services/formulaFile'
import { createPaidFormulaPackageFromContent, decryptPaidFormulaPackage, toPaidFormulaContent } from '../src/services/paidFormulaPackage'
import { parseFreeFormulaDropPackage } from '../src/services/formulaDropPackage'
import { parseWorkspaceFile } from '../src/services/workspaceImport'
import { toWorkspaceFile } from '../src/services/workspaceExport'
import { createBackup } from '../src/services/exportJson'
import { parseBackup } from '../src/services/importJson'
import { createStorage } from '../src/storage/storageService'
import { workspaceFixture } from './workspaceFixtures'

describe('Workspace / existing file contracts isolation', () => {
  it('does not expand FormulaFile or raw decrypted Licensed plaintext even with attached history', async () => {
    const source = await workspaceFixture()
    Object.assign(source.formula, { versions: source.versions, experiments: source.experiments })
    const legacy = toFormulaFile(source.formula)
    expect(legacy.type).toBe('accordbook-formula'); expect(legacy.formatVersion).toBe(2)
    expect(Object.keys(legacy.formula)).toEqual(['name', 'notes', 'rows'])
    const content = toPaidFormulaContent(source.formula, source.formula.provenance)
    expect(Object.keys(content).sort()).toEqual(['type', 'formatVersion', 'formula', 'provenance'].sort())
    const buyer = { name: 'Buyer', phoneLast4: '0123', pin: '000123' }
    const paid = await createPaidFormulaPackageFromContent(content, buyer)
    // Inspect raw plaintext as well: the legacy parser strips unknown fields and could mask a leak.
    const bytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
    const enc = new TextEncoder()
    const material = await crypto.subtle.importKey('raw', enc.encode(JSON.stringify([buyer.name, buyer.phoneLast4, buyer.pin])), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', iterations: paid.kdf.iterations, salt: bytes(paid.kdf.salt) }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
    const { ciphertext, ...header } = paid
    const raw = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(paid.encryption.iv), tagLength: 128, additionalData: enc.encode(JSON.stringify(header)) }, key, bytes(ciphertext))))
    expect(Object.keys(raw).sort()).toEqual(['type', 'formatVersion', 'formula', 'provenance', 'exportedAt'].sort())
    expect(raw.formula).toEqual(legacy.formula)
    for (const key of ['versions', 'experiments', 'variants', 'evaluations', 'branches', 'releasedVersionId']) expect(raw).not.toHaveProperty(key)
    expect((await decryptPaidFormulaPackage(paid, buyer)).type).toBe('accordbook-formula')
  })
  it.each([1, 2])('keeps FormulaFile/Drop v%s and rejects Workspace at both legacy boundaries', async version => {
    const source = await workspaceFixture()
    const raw = { ...toFormulaFile(source.formula), formatVersion: version, provenance: source.formula.provenance }
    const text = JSON.stringify(raw)
    expect(parseFormulaFile(text).formula.name).toBe(source.formula.name)
    expect(parseFreeFormulaDropPackage('DROP-2026-001', text, 'drop.accordbook', source.formula.name).packageText).toBe(text)
    const workspace = JSON.stringify(toWorkspaceFile(source))
    expect(() => parseFormulaFile(workspace)).toThrow()
    expect(() => parseFreeFormulaDropPackage('DROP-2026-001', workspace, 'drop.accordbook', source.formula.name)).toThrow()
    expect(() => parseWorkspaceFile(text)).toThrow()
  })
  it('keeps Backup v3 replacement contract separate from append', async () => {
    const storage = await createStorage()
    const source = await workspaceFixture()
    await storage.workspaces.appendWorkspaceAtomic(source)
    const backup = await createBackup(storage)
    expect(backup.app).toBe('Accordbook'); expect(backup.formatVersion).toBe(3)
    expect(backup.data.formulas).toEqual([source.formula])
    expect(backup.data.experiments).toEqual(source.experiments)
    expect(parseBackup(JSON.stringify(backup)).data.experiments).toEqual(source.experiments)
    expect(() => parseWorkspaceFile(JSON.stringify(backup))).toThrow()
    expect(() => parseBackup(JSON.stringify(toWorkspaceFile(source)))).toThrow()
  })
})
