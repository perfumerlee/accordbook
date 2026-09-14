// Local-only transport. Never forward Google HTML/error pages or log credentials.
export async function forwardGuideDraft(target, body, fetcher = fetch) {
  const signal = AbortSignal.timeout(55000)
  let stage = 'exec'
  let upstream = await fetcher(target, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body,
    signal,
    redirect: 'manual',
  })
  // ContentService returns a one-time Google content URL. Read that response
  // with GET, never forward the credential-bearing POST a second time.
  for (let hop = 0; [301, 302, 303].includes(upstream.status) && hop < 5; hop++) {
    const location = upstream.headers.get('location')
    const next = location && new URL(location, target)
    if (!next || next.protocol !== 'https:' || !['script.google.com', 'script.googleusercontent.com'].includes(next.hostname)) break
    stage = next.hostname === 'script.googleusercontent.com' ? 'content' : 'exec-redirect'
    upstream = await fetcher(next.href, { method: 'GET', redirect: 'manual', signal })
  }
  if (!upstream.ok) {
    return { status: 502, body: JSON.stringify({ ok: false, code: 'UPSTREAM_ERROR', upstreamStatus: upstream.status, stage }) }
  }
  let value
  try { value = await upstream.json() } catch {
    return { status: 502, body: JSON.stringify({ ok: false, code: 'INVALID_RESPONSE' }) }
  }
  if (!value || typeof value !== 'object' || typeof value.ok !== 'boolean') {
    return { status: 502, body: JSON.stringify({ ok: false, code: 'INVALID_RESPONSE' }) }
  }
  return { status: 200, body: JSON.stringify(value) }
}
