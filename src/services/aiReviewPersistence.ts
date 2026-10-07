import type { AIContextV1 } from '../models/aiContext'
import type { FormulaAiReviewRecord } from '../models/aiReviewRecord'
import type { AiReview } from './aiClient'
import type { StorageMode } from '../storage/database'
import type { AiReviewRepository, ReviewSaveStatus } from '../storage/aiReviewRepository'

export interface CompletedFormulaReview {
  readonly reviewId: string
  readonly sourceFormulaId: string
  readonly sourceFormulaDisplayId?: string
  readonly snapshot: AIContextV1
  readonly response: AiReview
  readonly locale: 'en' | 'ko'
  readonly createdAt: string
}

/** Pair only values captured for the successful request; never reads live Formula state. */
export function makeFormulaAiReviewRecord(completed: CompletedFormulaReview): FormulaAiReviewRecord {
  return { ...completed, reviewType: 'formula', schemaVersion: 1 }
}

export type ReviewPersistenceResult = ReviewSaveStatus | 'failed'

/** Reconcile uncertain saves by looking up the same ID before any retry. */
export async function persistFormulaAiReview(
  repository: AiReviewRepository | undefined,
  record: FormulaAiReviewRecord,
  mode: StorageMode | undefined,
): Promise<ReviewPersistenceResult> {
  if (!repository) return 'session-only'
  const serialized = JSON.stringify(record)
  const durability = (): ReviewSaveStatus => mode === 'indexeddb' ? 'saved-locally' : 'session-only'
  const existingMatches = async () => {
    const existing = await repository.get(record.reviewId)
    return existing !== undefined && JSON.stringify(existing) === serialized
  }
  try {
    if (await existingMatches()) return durability()
  } catch {
    return 'failed'
  }
  try {
    return await repository.save(record)
  } catch {
    try {
      return await existingMatches() ? durability() : 'failed'
    } catch {
      return 'failed'
    }
  }
}
