import { afterEach, expect, it, vi } from 'vitest'
import { performGuideDraftRequest, requestGuideDraft, draftConnectionMessage, safeDraftErrorMessage } from '../src/services/guideDrafts'
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
it('reports upstream 404 accurately without repeating the request', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":false,"code":"UPSTREAM_ERROR","upstreamStatus":404,"stage":"exec"}', {status:502,headers:{'X-Guide-Proxy':'local'}}))
  const result = await performGuideDraftRequest('/api/guide-drafts','getDraft',{},'fixture')
  expect(draftConnectionMessage(result)).toContain('Code: UPSTREAM_ERROR. Stage: exec. Upstream: 404')
  expect(fetcher).toHaveBeenCalledOnce()
})
it('shows safe upstream diagnostics without exposing unknown response text', async () => {
  expect(draftConnectionMessage({ ok: false, code: 'INVALID_RESPONSE', message: 'Apps Script returned HTTP 500 (exec). The local proxy is reachable.', diagnosticCode: 'UPSTREAM_ERROR', upstreamStatus: 500, stage: 'exec' } as never)).toContain('Code: UPSTREAM_ERROR. Stage: exec. Upstream: 500')
  expect(draftConnectionMessage({ ok: false, code: 'INVALID_DRAFT', reason: 'UNSAFE\nDETAIL' } as never)).not.toContain('UNSAFE')
})
it('formats only allowlisted diagnostics for the editor catch path', () => {
  expect(safeDraftErrorMessage({ code: 'INVALID_DRAFT', reason: 'INVALID_DOCUMENT' })).toContain('Code: INVALID_DRAFT · Reason: INVALID_DOCUMENT')
  expect(safeDraftErrorMessage({ diagnosticCode: 'UPSTREAM_ERROR', stage: 'exec', upstreamStatus: 500 })).toContain('Code: UPSTREAM_ERROR · Stage: exec · Upstream: 500')
  expect(safeDraftErrorMessage({ code: 'INVALID_DRAFT', reason: 'RAW SECRET DETAILS' })).not.toContain('RAW SECRET')
})
it('recovers a transient authentication transport failure once', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Offline')).mockResolvedValueOnce(new Response('{"ok":true}'))
  expect(await performGuideDraftRequest('https://example.test/exec', 'checkAuth', {}, 'fixture')).toEqual({ ok: true })
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it.each(['saveDraft', 'deleteDraft'])('never retries %s after an uncertain write', async action => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Offline'))
  expect(await performGuideDraftRequest('https://example.test/exec', action, {}, 'fixture')).toEqual({ ok: false, code: 'NETWORK_ERROR' })
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('does not retry a rejected key', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":false,"code":"AUTH_FAILED"}'))
  expect(await performGuideDraftRequest('https://example.test/exec', 'checkAuth', {}, 'fixture')).toEqual({ ok: false, code: 'AUTH_FAILED' })
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('preserves the endpoint and reports a real authentication rejection', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: false, code: 'AUTH_FAILED' })))
  const result = await requestGuideDraft('https://example.test/exec', 'checkAuth', {}, 'test-only')
  expect(fetcher.mock.calls[0][0]).toBe('https://example.test/exec')
  expect(result).toEqual({ ok: false, code: 'AUTH_FAILED' })
  expect(draftConnectionMessage(result)).toContain('Operator Key was not accepted')
})
it('does not mislabel an HTML response as authentication failure', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Unavailable</html>'))
  const result = await requestGuideDraft('https://example.test/exec', 'checkAuth', {}, 'test-only')
  expect(result).toEqual({ ok: false, code: 'INVALID_RESPONSE' })
})
it('distinguishes network failure from key rejection', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
  const result = await requestGuideDraft('https://example.test/exec', 'checkAuth', {}, 'test-only')
  expect(result).toEqual({ ok: false, code: 'NETWORK_ERROR' })
  expect(draftConnectionMessage(result)).toContain('Authentication could not be checked')
})
it('allows slow responses beyond 15 seconds and aborts at 60 seconds', async () => {
  vi.useFakeTimers()
  vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('Aborted')))))
  const pending = requestGuideDraft('https://example.test/exec', 'checkAuth', {}, 'test-only')
  await vi.advanceTimersByTimeAsync(15000)
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
  expect(signal?.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(45000)
  expect(await pending).toEqual({ ok: false, code: 'TIMEOUT' })
})
