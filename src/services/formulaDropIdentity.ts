const VISITOR_KEY = 'accordbook.drop.visitor-id'
const SESSION_KEY = 'accordbook.drop.session-id'
const SOURCE_KEY = 'accordbook.drop.source-context.v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SOURCE = /^[a-z0-9_-]{1,64}$/
const HOST = /^[a-z0-9.-]{1,253}$/i
let memoryVisitor: string | undefined
let memorySession: string | undefined

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
function valid(value: unknown, prefix: string): value is string { return typeof value === 'string' && value.startsWith(prefix) && value.length <= 40 && UUID.test(value.slice(2)) }
function storage(kind: 'local' | 'session'): Storage | undefined { try { return kind === 'local' ? window.localStorage : window.sessionStorage } catch { return undefined } }
function id(kind: 'visitor' | 'session'): string {
  const prefix = kind === 'visitor' ? 'v_' : 's_'; const key = kind === 'visitor' ? VISITOR_KEY : SESSION_KEY
  const current = kind === 'visitor' ? memoryVisitor : memorySession
  if (current) return current
  const store = storage(kind === 'visitor' ? 'local' : 'session')
  try { const saved = store?.getItem(key); if (valid(saved, prefix)) { if (kind === 'visitor') memoryVisitor = saved; else memorySession = saved; return saved } } catch { /* best effort */ }
  const created = prefix + uuid(); try { store?.setItem(key, created) } catch { /* temporary in-memory identity */ }
  if (kind === 'visitor') memoryVisitor = created; else memorySession = created
  return created
}
export function getOrCreateFormulaDropVisitorId(): string { return id('visitor') }
export function getOrCreateFormulaDropSessionId(): string { return id('session') }
export function createFormulaDropEventId(): string { return `evt_${uuid()}` }

type Attribution = { source: string; referrerHost: string }
function cleanSource(value: string | undefined): string { const normalized = value?.trim().toLowerCase() ?? ''; return SOURCE.test(normalized) ? normalized : 'direct' }
function cleanHost(value: string | undefined): string { if (!value) return ''; try { const host = new URL(value).hostname.toLowerCase(); return HOST.test(host) ? host : '' } catch { const host = value.toLowerCase().trim(); return HOST.test(host) ? host : '' } }
function readContexts(): Record<string, Attribution> { try { const parsed = JSON.parse(storage('session')?.getItem(SOURCE_KEY) ?? '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {} } catch { return {} } }
export function getFormulaDropAttribution(dropId: string, sourceParam?: string, referrer?: string): Attribution {
  const contexts = readContexts(); const provided = sourceParam !== undefined; const explicit = provided && SOURCE.test(sourceParam.trim().toLowerCase())
  const current = contexts[dropId]
  const value = { source: provided ? cleanSource(sourceParam) : current?.source ?? 'direct', referrerHost: provided ? cleanHost(referrer) : current?.referrerHost ?? cleanHost(referrer) }
  contexts[dropId] = value
  try { storage('session')?.setItem(SOURCE_KEY, JSON.stringify(contexts)) } catch { /* best effort */ }
  return value
}
export function resetFormulaDropIdentityForTests(): void { memoryVisitor = undefined; memorySession = undefined }
