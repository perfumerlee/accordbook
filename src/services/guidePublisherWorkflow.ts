export type PublishWorkflowResult = { ok: true; revisionAfter: number; commitSha: string } | { ok: false; code: string; currentRevision?: number; commitSha?: string; publishedFingerprint?: string }
export type PublishWorkflowDeps<D> = { readHead(): Promise<{ revision: number; document: D; baseFingerprint: string } | undefined>; readPublished(): Promise<{ document: D; fingerprint: string }>; validateAssets(document: D): Promise<string[]>; transaction(document: D): Promise<{ commitSha: string }>; rebase(head: { revision: number; document: D }, fingerprint: string): Promise<number> }
export async function runPublishWorkflow<D>(expectedRevision: number, expectedFingerprint: string, deps: PublishWorkflowDeps<D>): Promise<PublishWorkflowResult> {
  const head = await deps.readHead()
  if (!head) return { ok: false, code: 'NO_DRAFT' }
  if (head.revision !== expectedRevision) return { ok: false, code: 'REVISION_CONFLICT', currentRevision: head.revision }
  const published = await deps.readPublished()
  if (head.baseFingerprint !== published.fingerprint) return { ok: false, code: 'PUBLISHED_SOURCE_CHANGED' }
  const missing = await deps.validateAssets(head.document)
  if (missing.length) return { ok: false, code: 'UNPUBLISHED_ASSET_REFERENCE' }
  const commit = await deps.transaction(head.document)
  try { return { ok: true, revisionAfter: await deps.rebase(head, published.fingerprint), commitSha: commit.commitSha } }
  catch { return { ok: false, code: 'PUBLISH_SUCCEEDED_DRAFT_REBASE_FAILED', commitSha: commit.commitSha, publishedFingerprint: published.fingerprint } }
}
