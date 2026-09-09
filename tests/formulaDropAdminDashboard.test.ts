import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const gs = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/FormulaDropAdmin.gs', import.meta.url), 'utf8')
const html = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/Dashboard.html', import.meta.url), 'utf8')
describe('Formula Drop Phase 6 admin dashboard contract', () => {
  it('has a private HtmlService entry point and read-only server functions', () => {
    expect(gs).toContain("createTemplateFromFile('Dashboard')")
    expect(gs).toContain('getFormulaDropDashboardData')
    expect(gs).toContain('getFormulaDropDetail')
    expect(gs).toContain('aggregateDrop_')
  })
  it('keeps sensitive fields and raw identifiers out of the dashboard payload', () => {
    expect(gs).toContain("return { dropId: String(row[0])")
    expect(gs).not.toContain('visitorIds:')
    expect(html).toContain('textContent')
  })
  it('contains effective status, conversion, source, and failure aggregation', () => {
    expect(gs).toContain("'INVALID'")
    expect(gs).toContain('visitToDownload')
    expect(gs).toContain('uniqueImporters')
    expect(gs).toContain('failureReason')
  })
})
