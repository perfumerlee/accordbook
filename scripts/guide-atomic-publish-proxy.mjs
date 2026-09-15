import { forwardGuideDraft } from './guide-draft-proxy.mjs'
import { collectPublishBundle, MAX_PUBLISH_REQUEST_BYTES } from './guide-publish-bundle.mjs'
import { markPublishedAssets } from './guide-asset-staging.mjs'

// Only local disk bytes are assembled here; Apps Script independently reloads HEAD.
export async function forwardAtomicPublish(target, body, deps = { forwardGuideDraft, collectPublishBundle, markPublishedAssets }) {
  if (body.document || body.stagedAssets) return { status: 200, body: JSON.stringify({ ok: false, code: 'INVALID_DRAFT' }) }
  const prepared = await deps.forwardGuideDraft(target, JSON.stringify({ action: 'prepareAssetPublish', guideId: body.guideId, operatorKey: body.operatorKey }))
  const head = JSON.parse(prepared.body)
  if (!head.ok) return prepared
  if (head.assetPublishProtocol !== 1) return { status: 200, body: JSON.stringify({ ok: false, code: 'ASSET_PUBLISH_NOT_DEPLOYED' }) }
  if (head.draft?.revision !== body.expectedDraftRevision) return { status: 200, body: JSON.stringify({ ok: false, code: 'REVISION_CONFLICT' }) }
  const assets = await deps.collectPublishBundle(head.draft.document)
  const request = JSON.stringify({ action: 'publishGuide', guideId: body.guideId, expectedDraftRevision: body.expectedDraftRevision, operatorKey: body.operatorKey, ...(assets.length ? { stagedAssets: assets } : {}) })
  if (Buffer.byteLength(request) > MAX_PUBLISH_REQUEST_BYTES) throw Error('ASSET_AGGREGATE_TOO_LARGE')
  const result = await deps.forwardGuideDraft(target, request), response = JSON.parse(result.body)
  if (response.commitSha && (response.ok || response.code === 'PUBLISH_SUCCEEDED_DRAFT_REBASE_FAILED')) {
    try { await deps.markPublishedAssets((response.publishedAssets ?? []).filter(p => assets.some(a => a.guidePath === p.guidePath && a.sha256 === p.sha256)), response.commitSha) }
    catch { response.stagingWarning = 'PUBLISH_SUCCEEDED_STAGING_CLEANUP_FAILED'; result.body = JSON.stringify(response) }
  }
  return result
}
