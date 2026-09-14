import { expect, it, vi } from 'vitest'
// @ts-expect-error Node-only local proxy helper.
import { forwardGuideDraft } from '../scripts/guide-draft-proxy.mjs'

it.each(['checkAuth', 'getDraft', 'publishGuide'])('forwards %s without changing the request or retrying', async action => {
  const body = JSON.stringify({ action, operatorKey: 'fixture' })
  const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}'))
  expect(await forwardGuideDraft('https://example.test/exec', body, fetcher)).toEqual({ status: 200, body: '{"ok":true}' })
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('https://example.test/exec', expect.objectContaining({ method: 'POST', body }))
  expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
})
it('identifies upstream 404 without exposing the Google response or retrying publication', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('<html>private upstream detail</html>', { status: 404 }))
  const result = await forwardGuideDraft('https://example.test/exec', '{"action":"publishGuide"}', fetcher)
  expect(result).toEqual({ status: 502, body: '{"ok":false,"code":"UPSTREAM_ERROR","upstreamStatus":404,"stage":"exec"}' })
  expect(fetcher).toHaveBeenCalledOnce()
})
it('rejects successful HTML responses safely', async () => {
  const result = await forwardGuideDraft('https://example.test/exec', '{}', vi.fn().mockResolvedValue(new Response('<html>login</html>')))
  expect(JSON.parse(result.body)).toEqual({ ok: false, code: 'INVALID_RESPONSE' })
})
it('reads the Google response redirect with GET without forwarding credentials', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(null, {status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?fixture=1'}}))
    .mockResolvedValueOnce(new Response('{"ok":true}'))
  expect((await forwardGuideDraft('https://script.google.com/macros/s/fixture/exec', '{"operatorKey":"fixture"}', fetcher)).status).toBe(200)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls[1][1]).toEqual(expect.objectContaining({method:'GET',redirect:'manual'}))
  expect(fetcher.mock.calls[1][1]).not.toHaveProperty('body')
  expect(fetcher.mock.calls[1][1]).not.toHaveProperty('headers')
})
it('does not follow a redirect outside the Google response hosts', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'https://example.test/collect'}}))
  expect((await forwardGuideDraft('https://script.google.com/macros/s/fixture/exec','{}',fetcher)).status).toBe(502)
  expect(fetcher).toHaveBeenCalledOnce()
})
