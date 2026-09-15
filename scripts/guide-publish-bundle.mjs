import { listStagedGuideAssets, readStagedGuideAsset } from './guide-asset-staging.mjs'
import { listPublishedGuideAssets } from './guide-asset-catalog.mjs'
export const MAX_NEW_ASSET_BYTES = 5000000
export const MAX_PUBLISH_REQUEST_BYTES = 6779294
export function assetReferences(document) {
  const paths = new Set()
  for (const b of document.blocks ?? []) for (const locale of Object.values(b.media?.variants ?? {})) for (const v of Object.values(locale ?? {})) if (v?.src) paths.add(v.src)
  return [...paths].sort()
}
export function canonicalAssetPath(path, guideId) {
  if (!['getting-started', 'time-machine', 'formula-drop'].includes(guideId)) throw Error('INVALID_GUIDE_ID')
  const m = /^assets\/([a-z0-9-]+)\/(en|ko)\/(desktop|tablet|mobile)\/([a-z0-9][a-z0-9-]*\.(png|webp))$/.exec(path)
  if (!m) throw Error('ASSET_PATH_INVALID')
  if (m[1] !== guideId) throw Error('ASSET_GUIDE_MISMATCH')
  return path
}
export async function collectPublishBundle(document, deps = { listStagedGuideAssets, readStagedGuideAsset, listPublishedGuideAssets }) {
  const staged = await deps.listStagedGuideAssets(), published = await deps.listPublishedGuideAssets(), bundle = []
  let total = 0
  for (const path of assetReferences(document)) {
    canonicalAssetPath(path, document.guideId)
    if (published.some(a => a.guidePath === path)) continue
    const candidates = staged.filter(a => a.guidePath === path)
    if (!candidates.length) throw Error('STAGED_ASSET_REQUIRED')
    const { asset, bytes } = await deps.readStagedGuideAsset(candidates[0].stagedAssetId)
    total += bytes.length
    if (total > MAX_NEW_ASSET_BYTES) throw Error('ASSET_AGGREGATE_TOO_LARGE')
    if (bundle.length >= 64) throw Error('ASSET_AGGREGATE_TOO_LARGE')
    bundle.push({ guidePath: path, mimeType: asset.mimeType, size: bytes.length, width: asset.width, height: asset.height, sha256: asset.sha256, base64: bytes.toString('base64') })
  }
  return bundle
}
