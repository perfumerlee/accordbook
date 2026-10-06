import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
const store = () => {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
}
it('persists only version and ISO acceptance metadata', async () => {
  const local = store(); vi.stubGlobal('localStorage', local)
  const m = await import('../src/services/aiDisclosure')
  expect(m.hasAiDisclosure()).toBe(false)
  m.acceptAiDisclosure()
  const metadata = JSON.parse(local.values.get(m.AI_DISCLOSURE_KEY)!)
  expect(Object.keys(metadata).sort()).toEqual(['acceptedAt', 'disclosureVersion'])
  expect(metadata.disclosureVersion).toBe(2)
  expect(new Date(metadata.acceptedAt).toISOString()).toBe(metadata.acceptedAt)
  expect(m.hasAiDisclosure()).toBe(true)
})
it('does not reuse a previous v1 consent record', async () => {
  const local = store(); vi.stubGlobal('localStorage', local)
  local.values.set('accordbook.ai.disclosure.v1', '{"disclosureVersion":1,"acceptedAt":"2026-10-05T00:00:00.000Z"}')
  const m = await import('../src/services/aiDisclosure')
  expect(m.hasAiDisclosure()).toBe(false)
  expect(local.values.has('accordbook.ai.disclosure.v1')).toBe(true)
})
it.each([
  '{"disclosureVersion":1,"acceptedAt":"2026-10-05T00:00:00.000Z"}', '{bad',
  '{"disclosureVersion":2,"acceptedAt":"invalid"}',
  '{"disclosureVersion":2,"acceptedAt":"2026-10-05T00:00:00.000Z","name":"private"}',
])('reconfirms a changed or corrupt disclosure %#', async raw => {
  const local = store(); vi.stubGlobal('localStorage', local)
  const m = await import('../src/services/aiDisclosure')
  m.acceptAiDisclosure(); local.values.set(m.AI_DISCLOSURE_KEY, raw)
  expect(m.hasAiDisclosure()).toBe(false)
})
it('uses memory only when storage operations fail', async () => {
  vi.stubGlobal('localStorage', { getItem() { throw Error('unavailable') }, setItem() { throw Error('unavailable') } })
  const m = await import('../src/services/aiDisclosure')
  expect(m.hasAiDisclosure()).toBe(false); m.acceptAiDisclosure(); expect(m.hasAiDisclosure()).toBe(true)
})
