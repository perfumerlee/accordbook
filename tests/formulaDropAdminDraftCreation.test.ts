import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const gs = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/FormulaDropAdmin.gs', import.meta.url), 'utf8')
const html = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/Dashboard.html', import.meta.url), 'utf8')

describe('Formula Drop Draft creation', () => {
  it('creates immediately and opens the generated Draft for editing', () => {
    expect(html).toContain('.createFormulaDropDraft({})')
    expect(html).toContain('result.ok ? openEditor(result.dropId)')
    expect(html).not.toContain("prompt('새 Drop 제목을 입력하세요.')")
  })

  it('starts the sequence at 001 for each calendar year', () => {
    expect(gs).toContain("Number(row[1]) === year ? Math.max(max, Number(row[2]) || 0) : max")
    expect(gs).toContain("'DROP-' + year + '-' + String(sequence).padStart(3, '0')")
  })
})
