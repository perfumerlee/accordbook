import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const gs = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/FormulaDropAdmin.gs', import.meta.url), 'utf8')
const html = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/Dashboard.html', import.meta.url), 'utf8')
const readme = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/README.md', import.meta.url), 'utf8')

describe('Phase 7B-2A private Registry status bridge', () => {
  it('uses server-only properties and UrlFetchApp', () => {
    expect(gs).toContain('PAID_FORMULA_REGISTRY_ADMIN_URL')
    expect(gs).toContain('PAID_FORMULA_ADMIN_SECRET')
    expect(gs).toContain('UrlFetchApp.fetch')
    expect(gs).toContain("action: 'admin-license-status'")
    expect(gs).toContain('muteHttpExceptions: true')
    expect(html).not.toContain('PAID_FORMULA_ADMIN_SECRET')
    expect(html).not.toContain('PAID_FORMULA_REGISTRY_ADMIN_URL')
  })

  it('resolves licenseId from the Drop server-side and rejects unsafe mappings', () => {
    expect(gs).toContain('getFormulaDropLicenseStatus')
    expect(gs).toContain('missing_license_id')
    expect(gs).toContain('ambiguous_drop_license_mapping')
    expect(gs).toContain('FORMULA_DROPS_HEADERS')
    expect(gs).not.toContain('SpreadsheetApp.openById(PAID')
  })

  it('normalizes configuration, network, and remote response failures', () => {
    expect(gs).toContain('registry_not_configured')
    expect(gs).toContain('registry_unavailable')
    expect(gs).toContain('registry_invalid_response')
    expect(gs).toContain('registry_unauthorized')
    expect(gs).toContain('registry_not_found')
  })

  it('keeps the UI read-only and detail-scoped', () => {
    expect(html).toContain('getFormulaDropLicenseStatus(dropId)')
    expect(html).toContain('상태 새로고침')
    expect(html).not.toContain('adminSecret')
    expect(html).toContain('CLOSE & REVOKE')
    expect(html).toContain('closeAndRevokeFormulaDrop')
    expect(gs).toContain('getFormulaDropDashboardData()')
  })

  it('documents the shared secret boundary', () => {
    expect(readme).toContain('PAID_FORMULA_REGISTRY_ADMIN_URL')
    expect(readme).toContain('PAID_FORMULA_ADMIN_SECRET')
    expect(readme).toContain('admin-license-status')
    expect(readme).toContain('admin-revoke')
  })
})
