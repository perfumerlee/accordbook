import { afterEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { createStorage } from '../src/storage/storageService'
import { createPaletteRecord, validatePaletteInput } from '../src/services/materialPalette'
import { calculatePaletteCoverage, formulaMaterialToPalette } from '../src/services/materialPaletteCoverage'
import { normalizeMaterialName } from '../src/services/materialIdentity'
import { filterPaletteMaterialSuggestions } from '../src/services/materialPaletteSuggestions'
import { createBackup } from '../src/services/exportJson'
import { importBackup, parseBackup } from '../src/services/importJson'
import { workspaceFixture } from './workspaceFixtures'
import { toWorkspaceFile } from '../src/services/workspaceExport'
import { createPaidFormulaPackage, decryptPaidFormulaPackage } from '../src/services/paidFormulaPackage'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const rows = (...names: string[]) => names.map((material, i) => ({ id: String(i), material, parts: 10 }))
const record = (materialName: string, alias?: string) => createPaletteRecord({ materialName, alias })

describe('Palette identity and coverage', () => {
  it('normalizes case, spaces and Unicode, preserving punctuation', () => {
    expect(normalizeMaterialName('  Éthyl   ACETATE ')).toBe(normalizeMaterialName('E\u0301thyl acetate'))
    expect(normalizeMaterialName('Iso-E')).not.toBe(normalizeMaterialName('Iso E'))
  })
  it('counts unique named materials, matches aliases and ignores parts/dilution', () => {
    const input = [...rows(' Hedione ', 'HEDIONE', 'White musk', '', '  ', 'Vanillin'), { ...rows('Hedione')[0], dilution: { enabled: true, percent: 10, solvent: 'DPG' } }]
    const original = structuredClone(input), output = calculatePaletteCoverage(input, [record('Hedione'), record('Ethylene Brassylate', 'White musk')])
    expect(output.totalUniqueMaterials).toBe(3); expect(output.matchedMaterials).toBe(2); expect(output.coverageRatio).toBe(2 / 3)
    expect(output.missingMaterials.map(item => item.materialName)).toEqual(['Vanillin']); expect(input).toEqual(original)
  })
  it('does not force CAS matches or merge ambiguous aliases', () => {
    const palette = [createPaletteRecord({ materialName: 'A', cas: '123', alias: 'Musk' }), record('B', 'Musk')]
    expect(calculatePaletteCoverage([{ ...rows('C')[0], cas: '123' }], palette).matchedMaterials).toBe(0)
    const result = calculatePaletteCoverage(rows('Musk'), palette)
    expect(result.missingMaterials[0]).toMatchObject({ match: 'ambiguous', needsReview: true })
    expect(calculatePaletteCoverage(rows('A'), palette).matchedMaterials).toBe(1)
  })
  it('collapses conflicts without arbitrarily selecting metadata', () => {
    const input = [{ ...rows('A')[0], cas: '1' }, { ...rows('a')[0], cas: '2', dilution: { enabled: true, percent: 10, solvent: 'DPG' } }]
    expect(calculatePaletteCoverage(input, []).missingMaterials[0]).toMatchObject({ needsReview: true, sources: [{ cas: '1' }, { cas: '2' }] })
  })
  it('maps only allowed Formula fields', () => {
    const input = { ...rows('A')[0], marked: true, rowId: 'private', cas: '123', dilution: { enabled: true, percent: 10, solvent: 'DPG' } }
    expect(formulaMaterialToPalette(input)).toEqual({ materialName: 'A', cas: '123', dilution: { percent: 10, solvent: 'DPG' } })
  })
  it('defines 0/0 and handles 2,000 records', () => {
    expect(calculatePaletteCoverage([], []).coverageRatio).toBe(0)
    const palette = Array.from({ length: 2000 }, (_, i) => record(`Material ${i}`))
    expect(calculatePaletteCoverage(rows('Material 0', 'Material 1999', 'Missing'), palette).matchedMaterials).toBe(2)
  })
  it.each([100, 500, 1000, 2000])('calculates %i materials with stable results', size => {
    const palette = Array.from({ length: size }, (_, i) => record(`Material ${i}`)), input = rows(...Array.from({ length: 100 }, (_, i) => `Material ${i}`))
    const start = performance.now()
    for (let i = 0; i < 20; i++) expect(calculatePaletteCoverage(input, palette).matchedMaterials).toBe(100)
    console.info(`Palette coverage ${size}: ${((performance.now() - start) / 20).toFixed(3)} ms/call (100 Formula rows)`)
  })
  it('prioritizes Palette, keeps Memory, deduplicates and searches aliases', () => {
    const palette = [record('Ethyl Linalool'), record('Linalyl acetate', 'Citrus')]
    expect(filterPaletteMaterialSuggestions(palette, ['Linalool', 'ethyl   linalool'], 'lin')).toEqual(['Linalyl acetate', 'Ethyl Linalool', 'Linalool'])
    expect(filterPaletteMaterialSuggestions(palette, [], 'citr')).toEqual(['Linalyl acetate'])
  })
  it('validates lengths and dilution', () => {
    for (const input of [{ materialName: '' }, { materialName: 'A', dilution: { percent: 0 } }, { materialName: 'A', dilution: { percent: 101 } }, { materialName: 'A', dilution: { percent: NaN } }, { materialName: 'A'.repeat(201) }]) expect(() => validatePaletteInput(input)).toThrow()
  })
})

describe.each(['memory', 'indexeddb'] as const)('Palette %s storage', mode => {
  const storage = async () => { vi.stubGlobal('indexedDB', mode === 'indexeddb' ? new IDBFactory() : undefined); return createStorage() }
  it('supports CRUD and rejects duplicates with atomic rollback', async () => {
    const s = await storage(), a = await s.palette.add({ materialName: 'A' })
    await s.palette.update(a.materialId, { materialName: 'B', alias: 'Bee' })
    expect((await s.palette.get(a.materialId))?.alias).toBe('Bee')
    await expect(s.palette.addAtomic([{ materialName: 'C' }, { materialName: ' b ' }])).rejects.toThrow()
    expect((await s.palette.list()).map(item => item.materialName)).toEqual(['B'])
    const outcomes = await Promise.allSettled([s.palette.add({ materialName: 'D' }), s.palette.add({ materialName: 'd' })])
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    await s.palette.remove(a.materialId); expect(await s.palette.get(a.materialId)).toBeUndefined()
  })
  it('backs up Palette, preserves legacy, restores v6 including empty Palette', async () => {
    const s = await storage(); await s.palette.add({ materialName: 'A' }); const backup = await createBackup(s)
    expect(backup.formatVersion).toBe(6); expect(backup.data.palette).toHaveLength(1)
    const legacy = { ...backup, formatVersion: 5, data: { ...backup.data, palette: undefined } }
    await importBackup(s, parseBackup(JSON.stringify(legacy))); expect(await s.palette.list()).toHaveLength(1)
    await s.palette.add({ materialName: 'B' }); await importBackup(s, parseBackup(JSON.stringify(backup))); expect(await s.palette.list()).toHaveLength(1)
    await importBackup(s, parseBackup(JSON.stringify({ ...backup, data: { ...backup.data, palette: [] } }))); expect(await s.palette.list()).toEqual([])
    expect(() => parseBackup(JSON.stringify({ ...backup, data: { ...backup.data, palette: undefined } }))).toThrow()
  })
  it('rechecks alias races at Formula batch commit and copies selected fields only', async () => {
    const s = await storage()
    await s.palette.add({ materialName: 'Canonical', alias: 'Alias' })
    await expect(s.palette.addFromFormulaAtomic([{ materialName: 'New' }, { materialName: 'Alias' }])).rejects.toThrow('Already registered')
    expect(await s.palette.list()).toHaveLength(1)
    const candidate = formulaMaterialToPalette({ ...rows('Selected')[0], cas: '123', dilution: { enabled: true, percent: 10, solvent: 'DPG' } })
    await s.palette.addFromFormulaAtomic([candidate]); const selected = (await s.palette.list()).find(item => item.materialName === 'Selected')!
    expect(selected).toMatchObject({ cas: '123', dilution: { percent: 10, solvent: 'DPG' } }); expect(selected).not.toHaveProperty('parts'); expect(selected).not.toHaveProperty('rowId')
  })
})

it('rolls back a failure after the first IndexedDB write', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); const s = await createStorage(); await s.palette.add({ materialName: 'Existing' })
  const put = IDBObjectStore.prototype.put; let calls = 0
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, ...args: Parameters<typeof put>) { if (this.name === 'palette' && ++calls === 2) throw new Error('Injected failure'); return put.apply(this, args) })
  await expect(s.palette.addAtomic([{ materialName: 'A' }, { materialName: 'B' }])).rejects.toThrow('Injected failure')
  expect((await s.palette.list()).map(item => item.materialName)).toEqual(['Existing'])
})
it('upgrades v6 once, preserving existing stores without a Palette index', async () => {
  const factory = new IDBFactory(); vi.stubGlobal('indexedDB', factory)
  await new Promise<void>((resolve, reject) => { const request = factory.open('accordbook', 6); request.onupgradeneeded = () => { for (const name of ['formulas', 'archive', 'versions', 'settings', 'meta', 'experiments', 'reviews']) request.result.createObjectStore(name); request.transaction!.objectStore('meta').put(7, 'counter') }; request.onsuccess = () => { request.result.close(); resolve() }; request.onerror = () => reject(request.error) })
  const s = await createStorage(); expect((await s.exportData()).meta.counter).toBe(7)
  await new Promise<void>((resolve, reject) => { const request = factory.open('accordbook', 7); request.onsuccess = () => { expect(request.result.transaction('palette').objectStore('palette').indexNames.length).toBe(0); request.result.close(); resolve() }; request.onerror = () => reject(request.error) })
})
it('rolls back Palette and notebook together on a synchronous restore write failure', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); const s = await createStorage(); await s.palette.add({ materialName: 'Original' }); const before = await s.exportData()
  const put = IDBObjectStore.prototype.put
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, ...args: Parameters<typeof put>) { if (this.name === 'settings') throw new Error('Injected restore failure'); return put.apply(this, args) })
  await expect(s.importData({ ...before, palette: [record('Replacement')] })).rejects.toThrow('Injected restore failure')
  expect(await s.exportData()).toEqual(before)
})
it('excludes user environment from Workspace and decrypted Licensed Formula', async () => {
  const source = await workspaceFixture(), canary = 'PALETTE_PRIVATE_CANARY', token = 'TOKEN_PRIVATE_CANARY'
  Object.assign(source, { palette: [{ materialName: canary, alias: canary, notes: canary }], token })
  Object.assign(source.formula, { palette: source['palette' as keyof typeof source], token })
  expect(JSON.stringify(toWorkspaceFile(source))).not.toContain(canary); expect(JSON.stringify(toWorkspaceFile(source))).not.toContain(token)
  const buyer = { name: 'Test', phoneLast4: '1234', pin: '123456' }, file = await createPaidFormulaPackage(source.formula, buyer), decoded = await decryptPaidFormulaPackage(file, buyer)
  expect(JSON.stringify(decoded)).not.toContain(canary); expect(JSON.stringify(decoded)).not.toContain(token)
})
