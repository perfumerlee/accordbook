import type { Experiment } from '../models/experiment'
import type { FormulaVersion } from '../models/formula'

export function stateLabel(version: FormulaVersion | undefined, language: 'en' | 'ko') {
  if (!version) return language === 'ko' ? '저장된 버전' : 'Saved version'
  if (version.kind === 'restore-point') return language === 'ko' ? '복원 지점' : 'Restore point'
  return version.versionNumber == null ? (language === 'ko' ? '저장된 버전' : 'Saved version') : `V${version.versionNumber}`
}

export function baseLabel(experiment: Experiment, versions: FormulaVersion[], language: 'en' | 'ko') {
  const source = experiment.baseSource
  return source.kind === 'current' ? 'CURRENT' : stateLabel(versions.find(v => v.versionId === source.sourceVersionId), language)
}

// Time Machine reverses the repository's ascending creation order.
export function sourceOrder(versions: FormulaVersion[]) {
  return [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).reverse()
}

export function displayDate(value: string, language: 'en' | 'ko') {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
