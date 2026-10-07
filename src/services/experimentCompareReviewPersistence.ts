import type { ExperimentAiCompareReviewRecord } from '../models/experimentAiReviewRecord'
import type { ExperimentCompareRequestV1, ExperimentCompareResultV1 } from '../models/experimentCompareAi'
import type { StorageMode } from '../storage/database'
import type { AiReviewRepository, ReviewSaveStatus } from '../storage/aiReviewRepository'

export interface CompletedExperimentCompare {
  readonly reviewId: string
  readonly experimentId: string
  readonly experimentDisplayName: string
  readonly selectedVariantIds: readonly string[]
  readonly selectedVariantLabels: readonly string[]
  readonly variantIdsByLabel: Readonly<Record<string, string>>
  readonly request: ExperimentCompareRequestV1
  readonly response: ExperimentCompareResultV1
  readonly locale: 'en' | 'ko'
  readonly createdAt: string
}

/** Builds from the captured successful request; never reads the current Experiment. */
export function makeExperimentCompareReviewRecord(completed: CompletedExperimentCompare): ExperimentAiCompareReviewRecord {
  return {
    reviewId: completed.reviewId, reviewType: 'experiment', operation: 'compare', schemaVersion: 1,
    experimentId: completed.experimentId, experimentDisplayName: completed.experimentDisplayName,
    selectedVariantIds: [...completed.selectedVariantIds], selectedVariantLabels: [...completed.selectedVariantLabels], variantIdsByLabel: { ...completed.variantIdsByLabel },
    submittedContext: structuredClone(completed.request), deterministicDelta: structuredClone(completed.request.deltas),
    response: structuredClone(completed.response), locale: completed.locale, createdAt: completed.createdAt,
  }
}

export type ExperimentReviewPersistenceResult = ReviewSaveStatus | 'failed'
export async function persistExperimentCompareReview(repository: AiReviewRepository | undefined, record: ExperimentAiCompareReviewRecord, mode: StorageMode | undefined): Promise<ExperimentReviewPersistenceResult> {
  if (!repository) return 'failed'
  const serialized = JSON.stringify(record)
  const durability = (): ReviewSaveStatus => mode === 'indexeddb' ? 'saved-locally' : 'session-only'
  const existingMatches = async () => {
    const existing = await repository.getExperimentReview(record.reviewId)
    return existing !== undefined && JSON.stringify(existing) === serialized
  }
  try { if (await existingMatches()) return durability() } catch { return 'failed' }
  try { return await repository.save(record) }
  catch {
    try { return await existingMatches() ? durability() : 'failed' }
    catch { return 'failed' }
  }
}
