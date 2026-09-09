import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/FormulaDropAdmin.gs', import.meta.url), 'utf8')
const licensedRegistry = readFileSync(new URL('../scripts/apps-script/PaidFormulaRegistry.gs', import.meta.url), 'utf8')

describe('Formula Drop Phase 1 Apps Script schema', () => {
  it('defines the canonical FormulaDrops headers in order', () => {
    expect(source).toContain("'dropId', 'year', 'sequence', 'title', 'subtitle', 'description', 'status'")
    expect(source).toContain("'fileName', 'fileUrl', 'licenseId',")
    expect(source).toContain("'publicAccessName', 'publicAccessLast4', 'publicAccessPin', 'createdAt', 'updatedAt'")
  })

  it('defines the canonical FormulaDropEvents headers in order', () => {
    expect(source).toContain("'eventId', 'timestamp', 'dropId', 'visitorId', 'sessionId', 'eventType'")
    expect(source).toContain("'source', 'referrerHost', 'failureReason'")
  })

  it('defines the exact status and event enums', () => {
    expect(source).toContain("['DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED']")
    expect(source).toContain("['view', 'download', 'import_attempt', 'import_success', 'import_failed']")
  })

  it('uses the Script Property and does not hard-code a spreadsheet ID', () => {
    expect(source).toContain("FORMULA_DROP_SPREADSHEET_ID_PROPERTY = 'FORMULA_DROP_SPREADSHEET_ID'")
    expect(source).toContain("getProperty(FORMULA_DROP_SPREADSHEET_ID_PROPERTY)")
    expect(source).not.toMatch(/SPREADSHEET_ID\s*=\s*['"][^'"]+['"]/) 
  })

  it('defines header Notes for both sheets and public access fields', () => {
    expect(source).toContain('FORMULA_DROPS_HEADER_NOTES')
    expect(source).toContain('FORMULA_DROP_EVENTS_HEADER_NOTES')
    expect(source).toContain('publicAccessLast4')
    expect(source).toContain('publicAccessPin')
    expect(source).toContain('setNotes([notes])')
  })

  it('contains no destructive sheet operations', () => {
    expect(source).not.toMatch(/\.clear(?:Contents|Format)?\s*\(/)
    expect(source).not.toMatch(/\.delete(?:Rows|Columns)\s*\(/)
    expect(source).not.toMatch(/setValues\(\s*\[.*existing/i)
    expect(source).toContain("if (lastRow === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers])")
    expect(source).toContain("throw new Error('Formula Drop sheet header mismatch: ' + name + '. No data was changed.')")
  })

  it('does not modify the existing Licensed Formula Registry source', () => {
    expect(licensedRegistry).toContain("const SHEET_NAME = 'PaidFormulaLicenses';")
    expect(licensedRegistry).toContain('function setupPaidFormulaRegistry()')
  })
})
