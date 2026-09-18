import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../scripts/guide-draft-error-snapshot.mjs', () => ({ writeDraftErrorSnapshot: vi.fn() }))
// @ts-expect-error Node-only middleware.
import { forwardGuideDraft } from '../scripts/guide-draft-proxy.mjs'

afterEach(() => vi.restoreAllMocks())
it.each(['text/html', 'application/json'])('logs one sanitized save failure for %s without changing the response', async contentType => {
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const json = contentType === 'application/json'
  const response = new Response(json ? JSON.stringify({ ok: false, code: 'INVALID_DRAFT', reason: 'INVALID_DOCUMENT', secret: 'PRIVATE' }) : '<html>PRIVATE</html>', { status: 500, headers: { 'Content-Type': contentType } })
  const result = await forwardGuideDraft('https://example.test/exec', JSON.stringify({ action: 'saveDraft', operatorKey: 'PRIVATE', document: 'PRIVATE' }), vi.fn().mockResolvedValue(response))
  expect(result.status).toBe(json ? 200 : 502)
  expect(log).toHaveBeenCalledOnce()
  const diagnostic = JSON.parse(String(log.mock.calls[0][1]))
  expect(diagnostic).toMatchObject({ action: 'saveDraft', upstreamReached: true, upstreamStatus: 500, contentType, safeJson: json, redirect: false, stage: 'exec' })
  expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE')
})
it('logs an exception category and rethrows the original exception', async () => {
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const error = new TypeError('PRIVATE')
  await expect(forwardGuideDraft('https://example.test/exec', '{"action":"saveDraft"}', vi.fn().mockRejectedValue(error))).rejects.toBe(error)
  expect(log).toHaveBeenCalledOnce()
  expect(JSON.parse(String(log.mock.calls[0][1]))).toMatchObject({ action: 'saveDraft', upstreamReached: false, exceptionCategory: 'TypeError' })
  expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE')
})
