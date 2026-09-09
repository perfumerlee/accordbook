import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFormulaDropEventId, getFormulaDropAttribution, getOrCreateFormulaDropSessionId, getOrCreateFormulaDropVisitorId, resetFormulaDropIdentityForTests } from '../src/services/formulaDropIdentity'
import { createFormulaDropEvent, sendFormulaDropEvent } from '../src/services/formulaDropEvents'

const makeStorage = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) }, clear: () => values.clear() } }
const local = makeStorage(); const session = makeStorage()
vi.stubGlobal('window', { localStorage: local, sessionStorage: session })
afterEach(() => { vi.restoreAllMocks(); resetFormulaDropIdentityForTests(); local.clear(); session.clear() })
describe('Formula Drop anonymous identity', () => {
  it('creates and reuses separate visitor and session IDs', () => { const v = getOrCreateFormulaDropVisitorId(); const s = getOrCreateFormulaDropSessionId(); expect(v).toMatch(/^v_[0-9a-f-]{36}$/); expect(s).toMatch(/^s_[0-9a-f-]{36}$/); expect(v).not.toBe(s); expect(getOrCreateFormulaDropVisitorId()).toBe(v); expect(getOrCreateFormulaDropSessionId()).toBe(s) })
  it('replaces malformed stored values', () => { local.setItem('accordbook.drop.visitor-id', 'email@example.com'); expect(getOrCreateFormulaDropVisitorId()).toMatch(/^v_[0-9a-f-]{36}$/) })
  it('scopes attribution by drop and keeps hostname only', () => { expect(getFormulaDropAttribution('DROP-2026-001', 'Threads', 'https://cafe.naver.com/path?q=private')).toEqual({ source: 'threads', referrerHost: 'cafe.naver.com' }); expect(getFormulaDropAttribution('DROP-2026-001')).toEqual({ source: 'threads', referrerHost: 'cafe.naver.com' }); expect(getFormulaDropAttribution('DROP-2026-002')).toEqual({ source: 'direct', referrerHost: '' }); expect(getFormulaDropAttribution('DROP-2026-001', 'bad source', 'not-a-url').source).toBe('direct') })
  it('creates event IDs and payloads without timestamp or personal fields', () => { expect(createFormulaDropEventId()).toMatch(/^evt_[0-9a-f-]{36}$/); const payload = createFormulaDropEvent('DROP-2026-001', 'view'); expect(payload).not.toHaveProperty('timestamp'); expect(payload).not.toHaveProperty('buyerName'); expect(payload).toHaveProperty('eventId') })
  it('fails safely when endpoint is missing or transport fails', async () => { await expect(sendFormulaDropEvent(createFormulaDropEvent('DROP-2026-001', 'view'))).resolves.toEqual({ ok: false, error: 'endpoint_unconfigured' }) })
})
