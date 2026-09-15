import type { GuideDocument } from '../models/guide'
import { collectGuideAssetReferences } from './guidePublisher'
import { classifyGuideAsset } from './guideAssetResolution'
import { listPublishedGuideAssets, listStagedGuideAssets, type PublishedGuideAsset, type StagedGuideAsset } from './guideAssetStaging'

export function publicationAssetCheck(document: GuideDocument, staged: StagedGuideAsset[], published: PublishedGuideAsset[]) {
  const statuses = collectGuideAssetReferences(document).map(src => classifyGuideAsset(src, staged, published))
  const stagedCount = statuses.filter(s => s === 'STAGED').length
  const missingCount = statuses.filter(s => s === 'MISSING').length
  return { hasUnpublishedStagedAssets: stagedCount > 0, stagedCount, missingCount,
    reason: missingCount ? `${missingCount} MISSING ASSET${missingCount === 1 ? '' : 'S'} · Restore referenced images before publishing.` : undefined }
}
export async function checkPublicationAssets(document: GuideDocument) {
  try {
    const [staged, published] = await Promise.all([listStagedGuideAssets(), listPublishedGuideAssets()])
    if (!staged.ok || !published.ok) return { reason: 'Asset catalog unavailable · Retry before publishing.' }
    const check = publicationAssetCheck(document, staged.assets ?? [], published.assets ?? [])
    if (check.reason) return check
    const response = await fetch('/api/guide-assets-readiness', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({guideId:document.guideId,refs:collectGuideAssetReferences(document)}) })
    const ready = await response.json()
    return response.ok && ready.ok ? check : { ...check, reason: ready.code ?? 'ASSET_READINESS_FAILED' }
  } catch { return { reason: 'Asset catalog unavailable · Retry before publishing.' } }
}
export async function guardPublicationAssets(document: GuideDocument, publish: () => Promise<unknown>, blocked: (reason: string) => void) {
  const check = await checkPublicationAssets(document)
  if (check.reason) { blocked(check.reason); return }
  return publish()
}
