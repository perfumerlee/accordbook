import type { FormulaVersion, FormulaVersionSnapshot } from '../models/formula'

export const canShowVersionComposition = (version: FormulaVersion) => version.kind === 'manual'

export function getVersionComposition(snapshot: FormulaVersionSnapshot): string[] {
  const names = [...new Set(snapshot.rows.map(row => row.material.trim()).filter(Boolean))]
  return names.sort((a, b) => a.localeCompare(b, 'en') || (a < b ? -1 : a > b ? 1 : 0))
}

export function formatVersionCompositionForClipboard({ name, versionNumber, materials, language }: { name: string; versionNumber: number | null; materials: string[]; language: 'en' | 'ko' }): string {
  const count = language === 'ko' ? `원료 ${materials.length}개` : `${materials.length} Materials`
  const heading = language === 'ko' ? '포뮬러 원료 구성' : 'FORMULA COMPOSITION'
  const footer = language === 'ko' ? '함량은 표시되지 않습니다.' : 'Proportions hidden'
  return [name, '', heading, `v${versionNumber} · ${count}`, '', ...materials, '', footer].join('\n')
}
