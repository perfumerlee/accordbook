import type { ExperimentNextRoundRequestV1, ExperimentNextRoundResultV1, ExperimentNextRoundReviewRecord } from '../models/experimentNextRoundAi'
import type { StorageMode } from '../storage/database'
import type { AiReviewRepository, ReviewSaveStatus } from '../storage/aiReviewRepository'

export interface CompletedExperimentNextRound {
  readonly reviewId: string; readonly experimentId: string; readonly experimentDisplayName: string
  readonly variantId: string; readonly variantLabel: string; readonly evaluationId: string
  readonly request: ExperimentNextRoundRequestV1; readonly response: ExperimentNextRoundResultV1
  readonly locale: 'en' | 'ko'; readonly createdAt: string
}
export function makeExperimentNextRoundReviewRecord(value: CompletedExperimentNextRound): ExperimentNextRoundReviewRecord {
  return { reviewId: value.reviewId, reviewType: 'experiment', operation: 'next_round', schemaVersion: 1,
    experimentId: value.experimentId, experimentDisplayName: value.experimentDisplayName,
    variantId: value.variantId, variantLabel: value.variantLabel, evaluationId: value.evaluationId,
    submittedContext: structuredClone(value.request), deterministicDelta: structuredClone(value.request.delta),
    response: structuredClone(value.response), locale: value.locale, createdAt: value.createdAt }
}
export type ExperimentNextRoundSaveResult = ReviewSaveStatus | 'failed'
export async function persistExperimentNextRoundReview(repository: AiReviewRepository | undefined, record: ExperimentNextRoundReviewRecord, mode: StorageMode | undefined): Promise<ExperimentNextRoundSaveResult> {
  if (!repository) return 'failed'
  const serialized = JSON.stringify(record)
  const status = (): ReviewSaveStatus => mode === 'indexeddb' ? 'saved-locally' : 'session-only'
  const same = async () => { const current = await repository.getExperimentReviewRecord(record.reviewId); return current !== undefined && JSON.stringify(current) === serialized }
  try { if (await same()) return status() } catch { return 'failed' }
  try { return await repository.save(record) } catch { try { return await same() ? status() : 'failed' } catch { return 'failed' } }
}
