import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const gs = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/FormulaDropAdmin.gs', import.meta.url), 'utf8')
const html = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/Dashboard.html', import.meta.url), 'utf8')
describe('Formula Drop Phase 7A management contract', () => {
  it('provides locked server-side management actions', () => {
    expect(gs).toContain('createFormulaDropDraft')
    expect(gs).toContain('updateFormulaDrop')
    expect(gs).toContain('scheduleFormulaDrop')
    expect(gs).toContain('activateFormulaDrop')
    expect(gs).toContain('returnFormulaDropToDraft')
    expect(gs).toContain('expireFormulaDrop')
    expect(gs).toContain('LockService.getScriptLock()')
  })
  it('keeps status transitions and sensitive boundaries server validated', () => {
    expect(gs).toContain('duplicate_license_id')
    expect(gs).toContain('invalid_transition')
    expect(gs).toContain('expectedUpdatedAt')
    expect(gs).toContain("raw === 'EXPIRED'")
    expect(gs).not.toContain('appendRow')
  })
  it('exposes management controls only through google.script.run', () => {
    expect(html).toContain('createFormulaDropDraft')
    expect(html).toContain('activateFormulaDrop')
    expect(html).toContain('expireFormulaDrop')
    expect(html).not.toContain('fetch(')
  })
  it('clears field validation messages as fields become valid', () => {
    expect(html).toContain('window.editValidationErrors = {}')
    expect(html).toContain('validateEditorField(element.name)')
    expect(html).toContain('delete window.editValidationErrors[name]')
    expect(html).toContain('window.editValidationErrors = result.fields || {}')
    expect(html).toContain('node.hidden = !message')
    expect(html).toContain("field.setAttribute('aria-invalid', 'false')")
  })
})
