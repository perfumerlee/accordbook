import type { FormulaAiReviewRecord } from '../models/aiReviewRecord'
import { validateFormulaAiReviewRecord } from '../models/aiReviewRecord'
import type { StorageDatabase } from './database'

const clone = <T>(value: T): T => structuredClone(value)
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

export type ReviewSaveStatus = 'saved-locally' | 'session-only'

export class AiReviewRepository {
  constructor(private readonly database: StorageDatabase) {}

  async save(record: FormulaAiReviewRecord): Promise<ReviewSaveStatus> {
    validateFormulaAiReviewRecord(record)
    await this.database.add('reviews', record.reviewId, clone(record))
    return this.database.mode === 'indexeddb' ? 'saved-locally' : 'session-only'
  }

  async get(reviewId: string): Promise<FormulaAiReviewRecord | undefined> {
    const value = await this.database.get<FormulaAiReviewRecord>('reviews', reviewId)
    if (!value) return undefined
    validateFormulaAiReviewRecord(value)
    return deepFreeze(clone(value))
  }

  async listByFormula(sourceFormulaId: string): Promise<FormulaAiReviewRecord[]> {
    return (await this.database.getByParent<FormulaAiReviewRecord>('reviews', sourceFormulaId))
      .map(value => { validateFormulaAiReviewRecord(value); return deepFreeze(clone(value)) })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async listAll(): Promise<FormulaAiReviewRecord[]> {
    return (await this.database.getAll<FormulaAiReviewRecord>('reviews'))
      .map(value => { validateFormulaAiReviewRecord(value); return deepFreeze(clone(value)) })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  delete(reviewId: string): Promise<void> { return this.database.delete('reviews', reviewId) }
}
