import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

function fixture() {
  const records = new Map<string, string>()
  const context = vm.createContext({
    Utilities: { getUuid: randomUUID },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key: string) => records.get(key),
      setProperty: (key: string, value: string) => records.set(key, value),
      deleteProperty: (key: string) => records.delete(key),
    }) },
  })
  vm.runInContext(readFileSync('scripts/apps-script/formula-drop-public/FormulaDropPublic.gs', 'utf8'), context)
  context.json_ = (value: unknown) => value
  context.spreadsheet_ = () => ({ getSheetByName: () => ({}) })
  context.headers_ = () => {}
  context.findDropRow_ = (_sheet: unknown, id: string) => id === 'DROP-2026-001' ? [id] : null
  context.publicDrop_ = () => ({ status: 'ACTIVE' })
  const post = (input: object) => context.doPost({ postData: { contents: JSON.stringify(input) } })
  return { post, records, context }
}

describe('Apps Script handoff issuance and resolution', () => {
  it('routes a real Drop ID through issuance, storage and authoritative resolution', () => {
    const { post, records } = fixture()
    const issued = post({ action: 'create-drop-handoff', dropId: 'DROP-2026-001' })
    expect(issued.ok).toBe(true)
    expect(issued.handoff.token).toMatch(/^[0-9a-f]{64}$/)
    expect(issued.handoff.expiresAt).toBeGreaterThan(Date.now())
    const stored = JSON.parse([...records.values()][0])
    expect(stored.dropId).toBe('DROP-2026-001')
    expect(post({ action: 'resolve-drop-handoff', token: issued.handoff.token, dropId: 'DROP-2026-999' }))
      .toEqual({ ok: true, dropId: 'DROP-2026-001', expiresAt: stored.expiresAt })
  })
  it.each(['DROP-dddd-ddd', '2026-001', 'INVALID'])('rejects invalid Drop ID %s without storing tokens', dropId => {
    const { post, records } = fixture()
    expect(post({ action: 'create-drop-handoff', dropId })).toEqual({ ok: false, error: 'invalid_request' })
    expect(records.size).toBe(0)
  })
  it('rejects expired and unknown tokens', () => {
    const { post, records } = fixture()
    const token = post({ action: 'create-drop-handoff', dropId: 'DROP-2026-001' }).handoff.token
    records.set('FORMULA_DROP_HANDOFF_' + token, JSON.stringify({ dropId: 'DROP-2026-001', expiresAt: Date.now() - 1 }))
    expect(post({ action: 'resolve-drop-handoff', token })).toEqual({ ok: false, error: 'expired_handoff' })
    expect(records.size).toBe(0)
    expect(post({ action: 'resolve-drop-handoff', token })).toEqual({ ok: false, error: 'invalid_handoff' })
  })
  it('rejects inactive Drops without issuing tokens', () => {
    const { post, records, context } = fixture()
    context.publicDrop_ = () => ({ status: 'EXPIRED' })
    expect(post({ action: 'create-drop-handoff', dropId: 'DROP-2026-001' }).ok).toBe(false)
    expect(records.size).toBe(0)
  })
})
