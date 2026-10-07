import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { IDBFactory } from 'fake-indexeddb'
import { createStorage } from '../src/storage/storageService'
import type { FormulaAiReviewRecord } from '../src/models/aiReviewRecord'

const makeReview = (reviewId: string, sourceFormulaId: string, createdAt: string): FormulaAiReviewRecord => ({
  reviewId, reviewType: 'formula', sourceFormulaId, sourceFormulaDisplayId: `ACC-${sourceFormulaId}`,
  snapshot: { type: 'accordbook-ai-context', version: 1, scope: 'formula_review', formula: { rows: [{ material: 'Hedione', parts: 100 }] } },
  response: { summary: `Summary ${reviewId}`, observations: [{ detail: 'Observation' }], nextChecks: [{ detail: 'Check' }] },
  locale: 'ko', createdAt, schemaVersion: 1,
})

describe('AI Review History UI contract', () => {
  it('uses Formula-scoped and global repository queries, preserving newest-first repository order', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const reviews = (await createStorage()).reviews
    const older = makeReview('2f6a7f2c-8084-4d9a-9c6f-5b03a3958174', 'formula-1', '2026-10-01T00:00:00.000Z')
    const newer = makeReview('2f6a7f2c-8084-4d9a-9c6f-5b03a3958175', 'formula-1', '2026-10-02T00:00:00.000Z')
    const orphan = makeReview('2f6a7f2c-8084-4d9a-9c6f-5b03a3958176', 'deleted-formula', '2026-10-03T00:00:00.000Z')
    await reviews.save(older); await reviews.save(newer); await reviews.save(orphan)
    expect((await reviews.listByFormula('formula-1')).map(review => review.reviewId)).toEqual([newer.reviewId, older.reviewId])
    expect((await reviews.listAll()).map(review => review.reviewId)).toEqual([orphan.reviewId, newer.reviewId, older.reviewId])
  })

  it('keeps saved detail separate from the current response and does not call AI from history actions', () => {
    const component = readFileSync('src/components/AiFormulaReview.tsx', 'utf8')
    const historyActions = component.slice(component.indexOf('const deleteSavedReview ='), component.indexOf('const built = formula ?'))
    expect(component).toContain("const [savedDetail, setSavedDetail]")
    expect(component).toContain("{result && !savedDetail && <div className=\"ai-review-result\"")
    expect(component).toContain('savedDetail.response.summary')
    expect(component).toContain("historyScope === 'all' ? await reviews.listAll() : sourceId ? await reviews.listByFormula(sourceId)")
    expect(component).toContain('if (historyRequest.current === requestId && formula?.id === sourceId)')
    expect(component).toContain('window.confirm(m.confirmDeleteReview)')
    expect(component).toContain('await reviews.get(selectedId)')
    expect(component).toContain('await reviews.delete(selectedId)')
    expect(historyActions).not.toMatch(/reviewFormula|\bfetch\s*\(/)
    expect(component).toContain("storageMode === 'memory' && <p role=\"status\">")
  })

  it('provides Korean and English labels without translating stored response content', () => {
    const messages = readFileSync('src/i18n/aiMessages.ts', 'utf8')
    expect(messages).toContain("history: 'Review History'")
    expect(messages).toContain("history: '리뷰 기록'")
    expect(messages).toContain("sourceUnavailable: 'Source Formula unavailable'")
    expect(messages).toContain("sourceUnavailable: '원본 Formula를 찾을 수 없음'")
    const component = readFileSync('src/components/AiFormulaReview.tsx', 'utf8')
    expect(component).toContain("savedDetail.locale === 'ko' ? m.korean : m.english")
    expect(component).toContain('{savedDetail.response.summary}')
    expect(component).not.toContain('translate(')
  })

  it('discloses Review snapshot and response contents before starting a full backup download', () => {
    const notebook = readFileSync('src/components/AccordbookNotebook.tsx', 'utf8')
    const exportHandler = notebook.slice(notebook.indexOf('const exportJson ='), notebook.indexOf('const [workspaceFeedback'))
    expect(exportHandler).toContain('저장된 AI Review의 전송 스냅샷과 생성된 응답')
    expect(exportHandler).toContain('saved AI Review submission snapshots and generated responses')
    expect(exportHandler.indexOf('window.confirm')).toBeLessThan(exportHandler.indexOf('downloadBackup(backup)'))
  })
})
