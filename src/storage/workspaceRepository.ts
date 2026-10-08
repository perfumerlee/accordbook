import type { StorageDatabase } from './database'
import type { WorkspaceSource } from '../services/workspaceExport'
import { toWorkspaceFile } from '../services/workspaceExport'
import { consumePreparedWorkspaceAppend } from '../services/workspaceExecution'
import { profileWorkspace } from '../services/workspaceProfile'
import type { AiReviewRecord } from '../models/aiReviewRecord'

/** Preserve a free review ID; collisions get a fresh local UUID, never overwrite. */
export function allocateWorkspaceReviews(reviews: readonly AiReviewRecord[], occupied: Set<string>): AiReviewRecord[] {
  return reviews.map(review => {
    let reviewId = review.reviewId
    for (let attempt = 0; occupied.has(reviewId); attempt++) {
      if (attempt >= 16) throw new Error('Unable to allocate Review identity')
      reviewId = crypto.randomUUID()
    }
    occupied.add(reviewId)
    return { ...review, reviewId }
  })
}

export type WorkspaceRecords = WorkspaceSource
export interface WorkspaceMetaUpdate {
  key: string
  value: number
  // Compare-and-set prevents a future allocator from committing a stale sequence.
  expectedValue: number | null
}
export interface WorkspaceAppend extends WorkspaceRecords { metaUpdate?: WorkspaceMetaUpdate; checkDisplayId?: boolean }
export class WorkspaceAppendConflict extends Error {
  constructor(readonly code: 'meta-changed' | 'display-id-collision') {
    super(code === 'meta-changed' ? 'Workspace meta sequence changed' : 'Workspace display ID collision')
    this.name = 'WorkspaceAppendConflict'
  }
}

export function prepareWorkspaceAppend(input: WorkspaceAppend): WorkspaceAppend {
  const trusted = consumePreparedWorkspaceAppend(input)
  const value = trusted ? input : structuredClone(input)
  if (!trusted) toWorkspaceFile(value) // Public callers still cross the complete validation boundary.
  const rowIds = new Set<string>()
  for (const row of value.formula.rows) {
    if (typeof row.id !== 'string' || !row.id.trim() || rowIds.has(row.id)) throw new Error('Invalid runtime row identity')
    rowIds.add(row.id)
  }
  if (value.formula.archivedAt !== undefined) throw new Error('Workspace append requires an active Formula')
  const meta = value.metaUpdate
  if (meta && (!meta.key.trim() || !Number.isSafeInteger(meta.value) || meta.value < 1 ||
    (meta.expectedValue !== null && (!Number.isSafeInteger(meta.expectedValue) || meta.expectedValue < 0)) ||
    meta.value <= (meta.expectedValue ?? 0))) throw new Error('Invalid Workspace meta update')
  return value
}
export class WorkspaceRepository {
  constructor(private readonly database: StorageDatabase) {}
  readWorkspace(formulaId: string): Promise<WorkspaceRecords | undefined> { return this.database.readWorkspace(formulaId) }
  appendWorkspaceAtomic(input: WorkspaceAppend): Promise<void> { return this.database.appendWorkspaceAtomic(input) }
}

export function readIndexedWorkspace(database: IDBDatabase, formulaId: string): Promise<WorkspaceRecords | undefined> {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['formulas', 'versions', 'experiments', 'reviews'], 'readonly')
    let formula: WorkspaceRecords['formula'] | undefined
    const versions: WorkspaceRecords['versions'] = []; const experiments: WorkspaceRecords['experiments'] = []
    const reviews: AiReviewRecord[] = []
    const reviewIds = new Set<string>()
    tx.oncomplete = () => resolve(formula ? { formula, versions, experiments, reviews } : undefined)
    tx.onabort = () => reject(tx.error ?? new Error('Workspace read aborted'))
    tx.onerror = () => {
      // Aborting also emits errors for pending requests; a second abort may throw.
      try { tx.abort() } catch { /* onabort owns rejection */ }
    }
    tx.objectStore('formulas').get(formulaId).onsuccess = event => { formula = (event.target as IDBRequest).result }
    // All requests share one readonly snapshot. Old adapters deliberately fall back to a scan.
    const reviewStore = tx.objectStore('reviews')
    const formulaReviewRequest = reviewStore.indexNames.contains('sourceFormulaId')
      ? reviewStore.index('sourceFormulaId').openCursor(formulaId)
      : reviewStore.openCursor()
    formulaReviewRequest.onsuccess = event => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
      if (!cursor) return
      const review = cursor.value as AiReviewRecord
      if (review.reviewType === 'formula' && review.sourceFormulaId === formulaId && !reviewIds.has(review.reviewId)) {
        reviewIds.add(review.reviewId); reviews.push(review)
      }
      cursor.continue()
    }
    for (const name of ['versions', 'experiments'] as const) {
      const store = tx.objectStore(name)
      const indexed = store.indexNames.contains('parentFormulaId')
      const request = indexed ? store.index('parentFormulaId').openCursor(formulaId) : store.openCursor()
      request.onsuccess = event => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
        if (!cursor) return
        if (cursor.value.parentFormulaId === formulaId) {
          if (name === 'versions') versions.push(cursor.value)
          else {
            experiments.push(cursor.value)
            const indexedReviews = reviewStore.indexNames.contains('experimentId')
            const reviewRequest = indexedReviews ? reviewStore.index('experimentId').openCursor(cursor.value.experimentId) : reviewStore.openCursor()
            const experimentId = cursor.value.experimentId
            reviewRequest.onsuccess = () => {
              const reviewCursor = reviewRequest.result
              if (!reviewCursor) return
              if (reviewCursor.value.reviewType === 'experiment' && reviewCursor.value.experimentId === experimentId && !reviewIds.has(reviewCursor.value.reviewId)) {
                reviewIds.add(reviewCursor.value.reviewId); reviews.push(reviewCursor.value)
              }
              reviewCursor.continue()
            }
          }
        }
        cursor.continue()
      }
    }
  })
}

export function appendIndexedWorkspace(database: IDBDatabase, input: WorkspaceAppend): Promise<void> {
  const value = profileWorkspace('storage-preparation', () => prepareWorkspaceAppend(input))
  return new Promise((resolve, reject) => {
    // Archive participates only for identity collision protection; it is never written.
    const tx = database.transaction(['formulas', 'archive', 'versions', 'experiments', 'reviews', 'meta'], 'readwrite')
    let failure: unknown
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Workspace append aborted'))
    const abort = (error: unknown) => {
      failure ??= error
      try { tx.abort() } catch { /* already aborting; wait for onabort */ }
    }
    tx.onerror = event => { abort((event.target as IDBRequest)?.error ?? tx.error) }
    try {
      const archived = tx.objectStore('archive').get(value.formula.id)
      archived.onsuccess = () => {
        if (archived.result !== undefined) { abort(new Error('Formula identity already exists in Archive')); return }
        const insert = () => {
          const keys = tx.objectStore('reviews').getAllKeys()
          keys.onsuccess = () => {
            try {
              const reviews = allocateWorkspaceReviews(value.reviews ?? [], new Set(keys.result.map(String)))
              const entries = [
                { store: 'formulas', key: value.formula.id, record: value.formula },
                ...value.versions.map(record => ({ store: 'versions', key: record.versionId, record })),
                ...value.experiments.map(record => ({ store: 'experiments', key: record.experimentId, record })),
                ...reviews.map(record => ({ store: 'reviews', key: record.reviewId, record })),
              ]
              let offset = 0
              const enqueue = () => {
                try {
                  profileWorkspace('idb-request-creation', () => {
                    let last: IDBRequest | undefined
                    const end = Math.min(offset + 8, entries.length)
                    while (offset < end) { const item = entries[offset++]; last = tx.objectStore(item.store).add(item.record, item.key) }
                    // The pending request keeps this SAME transaction alive across event-loop turns.
                    if (offset < entries.length) last!.onsuccess = enqueue
                    else if (value.metaUpdate) tx.objectStore('meta').put(value.metaUpdate.value, value.metaUpdate.key)
                  })
                } catch (error) { abort(error) }
              }
              enqueue()
            } catch (error) { abort(error) }
          }
        }
        const checkDisplay = () => {
          if (!value.checkDisplayId) { insert(); return }
          let remaining = 2
          for (const store of ['formulas', 'archive']) {
            tx.objectStore(store).openCursor().onsuccess = event => {
              const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
              if (!cursor) { if (--remaining === 0) insert(); return }
              if (cursor.value.formulaId === value.formula.formulaId) { abort(new WorkspaceAppendConflict('display-id-collision')); return }
              cursor.continue()
            }
          }
        }
        if (!value.metaUpdate) { checkDisplay(); return }
        const meta = tx.objectStore('meta').get(value.metaUpdate.key)
        meta.onsuccess = () => {
          if ((meta.result ?? null) !== value.metaUpdate!.expectedValue) { abort(new WorkspaceAppendConflict('meta-changed')); return }
          checkDisplay()
        }
      }
    } catch (error) { abort(error) }
  })
}
