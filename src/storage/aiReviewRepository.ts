import type { AiReviewRecord, FormulaAiReviewRecord } from '../models/aiReviewRecord'
import { validateFormulaAiReviewRecord } from '../models/aiReviewRecord'
import type { ExperimentAiCompareReviewRecord } from '../models/experimentAiReviewRecord'
import { validateExperimentAiCompareReviewRecord } from '../models/experimentAiReviewRecord'
import type { ExperimentAiReviewRecord } from '../models/aiReviewRecord'
import { validateExperimentNextRoundReviewRecord } from '../models/experimentNextRoundAi'
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
function validateReviewRecord(value: AiReviewRecord): void {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid AI Review record.')
  if (value.reviewType === 'formula') validateFormulaAiReviewRecord(value)
  else if (value.reviewType === 'experiment') {
    if (value.operation === 'compare') validateExperimentAiCompareReviewRecord(value)
    else if (value.operation === 'next_round') validateExperimentNextRoundReviewRecord(value)
    else throw new Error('Invalid AI Review record.')
  }
  else throw new Error('Invalid AI Review record.')
}

export class AiReviewRepository {
  constructor(private readonly database: StorageDatabase) {}

  async save(record: AiReviewRecord): Promise<ReviewSaveStatus> {
    validateReviewRecord(record)
    await this.database.add('reviews', record.reviewId, clone(record))
    return this.database.mode === 'indexeddb' ? 'saved-locally' : 'session-only'
  }

  async get(reviewId: string): Promise<AiReviewRecord | undefined> {
    const value = await this.database.get<AiReviewRecord>('reviews', reviewId)
    if (!value) return undefined
    validateReviewRecord(value)
    return deepFreeze(clone(value))
  }

  async listByFormula(sourceFormulaId: string): Promise<FormulaAiReviewRecord[]> {
    return (await this.database.getByParent<AiReviewRecord>('reviews', sourceFormulaId))
      .filter((value): value is FormulaAiReviewRecord => typeof value === 'object' && value !== null && value.reviewType === 'formula')
      .map(value => { validateFormulaAiReviewRecord(value); return deepFreeze(clone(value)) })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async listAll(): Promise<FormulaAiReviewRecord[]> {
    return (await this.database.getAll<AiReviewRecord>('reviews'))
      .filter((value): value is FormulaAiReviewRecord => typeof value === 'object' && value !== null && value.reviewType === 'formula')
      .map(value => { validateFormulaAiReviewRecord(value); return deepFreeze(clone(value)) })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getExperimentReview(reviewId: string): Promise<ExperimentAiCompareReviewRecord | undefined> {
    const value = await this.database.get<AiReviewRecord>('reviews', reviewId)
    if (!value || value.reviewType !== 'experiment' || value.operation !== 'compare') return undefined
    validateExperimentAiCompareReviewRecord(value)
    return deepFreeze(clone(value))
  }

  async listByExperiment(experimentId: string): Promise<ExperimentAiCompareReviewRecord[]> {
    return (await this.database.getReviewsByExperiment(experimentId))
      .filter((value): value is ExperimentAiCompareReviewRecord => value.operation === 'compare')
      .map(value => { validateExperimentAiCompareReviewRecord(value); return deepFreeze(clone(value)) })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async listAllExperiments(): Promise<ExperimentAiCompareReviewRecord[]> {
    return (await this.database.getAll<AiReviewRecord>('reviews'))
      .filter((value): value is ExperimentAiCompareReviewRecord => typeof value === 'object' && value !== null && value.reviewType === 'experiment' && value.operation === 'compare')
      .map(value => { validateExperimentAiCompareReviewRecord(value); return deepFreeze(clone(value)) })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getExperimentReviewRecord(reviewId: string): Promise<ExperimentAiReviewRecord | undefined> {
    const value = await this.database.get<AiReviewRecord>('reviews', reviewId)
    if (!value || value.reviewType !== 'experiment') return undefined
    validateReviewRecord(value)
    return deepFreeze(clone(value))
  }

  async listAllExperimentReviews(): Promise<ExperimentAiReviewRecord[]> {
    return (await this.database.getAll<AiReviewRecord>('reviews'))
      .filter((value): value is ExperimentAiReviewRecord => typeof value === 'object' && value !== null && value.reviewType === 'experiment')
      .map(value => { validateReviewRecord(value); return deepFreeze(clone(value)) })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async listExperimentReviews(experimentId: string): Promise<ExperimentAiReviewRecord[]> {
    return (await this.database.getReviewsByExperiment(experimentId))
      .map(value => { validateReviewRecord(value); return deepFreeze(clone(value)) })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  delete(reviewId: string): Promise<void> { return this.database.delete('reviews', reviewId) }
}
