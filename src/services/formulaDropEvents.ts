import { createFormulaDropEventId, getFormulaDropAttribution, getOrCreateFormulaDropSessionId, getOrCreateFormulaDropVisitorId } from './formulaDropIdentity'
export const FORMULA_DROP_EVENT_TYPES = ['view', 'download', 'import_attempt', 'import_success', 'import_failed'] as const
export type FormulaDropEventType = typeof FORMULA_DROP_EVENT_TYPES[number]
export type FormulaDropEventPayload = { eventId: string; dropId: string; visitorId: string; sessionId: string; eventType: FormulaDropEventType; source: string; referrerHost: string; failureReason?: string }
type Result = { ok: true; accepted: boolean; duplicate: boolean } | { ok: false; error: string }
const endpoint = () => (import.meta.env.VITE_FORMULA_DROP_PUBLIC_API_URL ?? '').trim()
export function createFormulaDropEvent(dropId: string, eventType: FormulaDropEventType, options: { source?: string; referrer?: string; failureReason?: string; eventId?: string } = {}): FormulaDropEventPayload {
  const attribution = getFormulaDropAttribution(dropId, options.source, options.referrer)
  return { eventId: options.eventId ?? createFormulaDropEventId(), dropId, visitorId: getOrCreateFormulaDropVisitorId(), sessionId: getOrCreateFormulaDropSessionId(), eventType, source: attribution.source, referrerHost: attribution.referrerHost, ...(options.failureReason ? { failureReason: options.failureReason } : {}) }
}
export async function sendFormulaDropEvent(payload: FormulaDropEventPayload): Promise<Result> {
  const url = endpoint(); if (!url) return { ok: false, error: 'endpoint_unconfigured' }
  try {
    const response = await fetch(url, { method: 'POST', redirect: 'follow', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ action: 'event', ...payload }), signal: AbortSignal.timeout(10000) })
    if (!response.ok) return { ok: false, error: 'transport_failed' }
    const result = await response.json() as Result
    return result && typeof result === 'object' ? result : { ok: false, error: 'invalid_response' }
  } catch { return { ok: false, error: 'transport_failed' } }
}
