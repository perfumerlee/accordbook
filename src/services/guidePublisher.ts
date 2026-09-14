import type { GuideDocument } from '../models/guide'
import { requestGuideDraftAction, type GuideDraftResult } from './guideDrafts'
import { validateGuideDocument } from './guideContracts'

export const publisherGuidePaths = Object.freeze({
  'getting-started': 'content/guide/getting-started.json',
  'time-machine': 'content/guide/time-machine.json',
  'formula-drop': 'content/guide/formula-drop.json',
} as const)
export function publisherGuidePath(guideId: string) { return publisherGuidePaths[guideId as keyof typeof publisherGuidePaths] }
export function collectGuideAssetReferences(document: GuideDocument): string[] {
  const paths = new Set<string>()
  for (const block of document.blocks) {
    const variants = 'media' in block ? block.media?.variants : undefined
    for (const locale of Object.values(variants ?? {})) for (const variant of Object.values(locale ?? {})) if (variant?.src) paths.add(variant.src)
  }
  return [...paths].sort()
}
export function isSafeGuideAssetReference(src: string) { return /^assets\/[A-Za-z0-9._/-]+$/.test(src) && !src.includes('..') && !src.startsWith('/') && !/^[A-Za-z]:/.test(src) }
export function serializePublishedGuide(document: GuideDocument) { return JSON.stringify(document, null, 2) + '\n' }
export function publishTreeEntry(guideId: string, blobSha: string) { const path = publisherGuidePath(guideId); if (!path) throw new Error('UNKNOWN_GUIDE'); return { path, mode: '100644' as const, type: 'blob' as const, sha: blobSha } }
export function publishCommitPlan(guideId: string, parentSha: string, treeSha: string) { return { message: `content: publish guide ${guideId}`, tree: treeSha, parents: [parentSha], force: false as const } }

export type PublishEligibility = { enabled: boolean; reason?: string }
export function confirmPublishIntent(title: string, guideId: string, revision: number, enStatus: string, koStatus?: string, confirmFn: (message: string) => boolean = (message) => window.confirm(message)) { return confirmFn(`Publish “${title}”?\n\nGuide ID: ${guideId}\nDraft: r${revision}\nEN: ${enStatus}\nKO: ${koStatus ?? '—'}\n\nThis will update the public Accordbook Guide through GitHub.`) }

export function getPublishEligibility(input: { connected: boolean; draftExists: boolean; dirty: boolean; historical: boolean; conflict: boolean; publishedChanged: boolean; document: GuideDocument }): PublishEligibility {
  if (!input.connected || !input.draftExists) return { enabled: false, reason: 'Save a Draft before publishing.' }
  if (input.dirty || input.historical) return { enabled: false, reason: 'Save the Draft before publishing.' }
  if (input.conflict) return { enabled: false, reason: 'Resolve the newer Draft before publishing.' }
  if (input.publishedChanged) return { enabled: false, reason: 'The published source has changed.' }
  const validation = validateGuideDocument(input.document)
  return validation.ok ? { enabled: true } : { enabled: false, reason: 'Resolve publication validation issues before publishing.' }
}

export type GuidePublisher = { publish(guideId: string, expectedDraftRevision: number): Promise<GuideDraftResult> }

export function publishErrorMessage(result: Extract<GuideDraftResult, { ok: false }>) {
  const detail = result.code === 'UNPUBLISHED_ASSET_REFERENCE' && result.assetPaths?.length
    ? ` · ${result.assetPaths.join(', ')}`
    : result.code === 'REVISION_CONFLICT' && result.currentRevision
      ? ` · Current Draft is r${result.currentRevision}.`
      : ''
  const messages: Record<string, string> = {
    AUTH_FAILED: 'Operator authentication failed.',
    REVISION_CONFLICT: 'A newer saved Draft exists. Load the latest Draft before publishing.',
    PUBLISHED_SOURCE_CHANGED: 'The published Guide changed after this Draft was created.',
    UNPUBLISHED_ASSET_REFERENCE: 'A referenced asset is not available in the published repository.',
    GITHUB_AUTH_FAILED: 'GitHub publisher authentication is not configured correctly.',
    GITHUB_SOURCE_NOT_FOUND: 'The published Guide source or referenced asset was not found.',
    PUBLISH_CONFLICT: 'The repository changed during publication. Review the latest source and try again.',
    GITHUB_WRITE_FAILED: 'GitHub could not accept the publication.',
    PUBLISH_SUCCEEDED_DRAFT_REBASE_FAILED: 'Guide published, but the private Draft baseline could not be refreshed.',
    INVALID_DRAFT: 'The saved Draft is not valid for publication.',
  }
  return `${messages[result.code] ?? `Publisher error: ${result.code}`}${detail}`
}

export const guidePublisher: GuidePublisher = {
  publish(guideId, expectedDraftRevision) {
    return requestGuideDraftAction('publishGuide', { guideId, expectedDraftRevision })
  },
}
