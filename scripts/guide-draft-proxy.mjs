// Local-only transport. Never forward Google HTML/error pages or log credentials.
import { writeDraftErrorSnapshot } from './guide-draft-error-snapshot.mjs'
const diagnosticActions = new Set(['checkAuth', 'getDraft', 'saveDraft', 'listDraftRevisions', 'getDraftRevision', 'deleteDraft', 'getPublishedGuide', 'refreshDraft', 'upgradeLegacyDraft', 'prepareAssetPublish', 'publishGuide'])
const diagnosticCodes = new Set(['INVALID_DRAFT', 'REVISION_CONFLICT', 'AUTH_FAILED', 'NO_DRAFT', 'INVALID_RESPONSE', 'REFRESH_FAILED', 'INVALID_REFRESH_PROPOSAL', 'REVISION_NOT_FOUND', 'UPSTREAM_ERROR', 'NETWORK_ERROR'])
const diagnosticReasons = new Set(['INVALID_GUIDE_ID', 'MISSING_DOCUMENT', 'DOCUMENT_GUIDE_ID_MISMATCH', 'DOCUMENT_TOO_LARGE', 'INVALID_FORMAT_VERSION', 'INVALID_DOCUMENT', 'MISSING_BASE_PUBLISHED_DOCUMENT', 'INVALID_BASE_PUBLISHED_DOCUMENT', 'INVALID_BASE_PUBLISHED_FINGERPRINT', 'DRAFT_SCHEMA_REJECTED', 'DRAFT_SAVE_EXCEPTION'])

export async function forwardGuideDraft(target, body, fetcher = fetch, writeSnapshot = writeDraftErrorSnapshot) {
  let action = 'UNKNOWN'
  try { const name = JSON.parse(String(body)).action; if (diagnosticActions.has(name)) action = name } catch {}
  const diagnostic = { action, upstreamReached: false, stage: 'exec', redirect: false, safeJson: false }
  const observedFetch = async (...args) => {
    const response = await fetcher(...args)
    diagnostic.upstreamReached = true
    diagnostic.upstreamStatus = response.status
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    diagnostic.contentType = ['application/json', 'text/html', 'text/plain'].includes(mime) ? mime : 'OTHER_OR_ABSENT'
    if (args[1].method === 'GET') {
      diagnostic.redirect = true
      diagnostic.stage = new URL(args[0]).hostname === 'script.googleusercontent.com' ? 'content' : 'exec-redirect'
    }
    return response
  }
  try {
    const result = await forwardGuideDraftResponse(target, body, observedFetch)
    const value = JSON.parse(result.body)
    if (!value.ok) {
      diagnostic.localStatus = result.status
      diagnostic.safeJson = result.status === 200 && diagnosticCodes.has(value.code)
      if (diagnosticCodes.has(value.code)) diagnostic.code = value.code
      if (diagnosticReasons.has(value.reason)) diagnostic.reason = value.reason
      console.warn('[guide-draft-proxy]', JSON.stringify(diagnostic))
      await writeSnapshot(diagnostic)
    }
    return result
  } catch (error) {
    diagnostic.localStatus = 502
    diagnostic.exceptionCategory = ['TimeoutError', 'AbortError', 'TypeError', 'SyntaxError'].includes(error?.name) ? error.name : 'PROXY_EXCEPTION'
    console.warn('[guide-draft-proxy]', JSON.stringify(diagnostic))
    await writeSnapshot(diagnostic)
    throw error
  }
}

async function forwardGuideDraftResponse(target, body, fetcher) {
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
    const contentType = upstream.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const parsed = await upstream.json().catch(() => null)
      const safeCodes = new Set(['INVALID_DRAFT', 'REVISION_CONFLICT', 'AUTH_FAILED', 'NO_DRAFT', 'INVALID_RESPONSE', 'REFRESH_FAILED', 'INVALID_REFRESH_PROPOSAL', 'REVISION_NOT_FOUND'])
      if (parsed && parsed.ok === false && safeCodes.has(parsed.code)) {
        const safe = { ok: false, code: parsed.code }
        if (typeof parsed.reason === 'string' && /^[A-Z_]+$/.test(parsed.reason)) safe.reason = parsed.reason
        if (Number.isInteger(parsed.currentRevision)) safe.currentRevision = parsed.currentRevision
        return { status: 200, body: JSON.stringify(safe) }
      }
    }
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
