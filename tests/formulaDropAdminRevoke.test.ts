import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const gs = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/FormulaDropAdmin.gs', import.meta.url), 'utf8')
const html = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/Dashboard.html', import.meta.url), 'utf8')

describe('Phase 7B-2B close and revoke orchestration', () => {
  it('expires the Drop before calling the Registry and never rolls it back', () => {
    expect(gs).toContain('closeAndRevokeFormulaDrop')
    expect(gs).toContain('expireDropForRevoke_')
    expect(gs).toContain("dropStatus: 'EXPIRED'")
    expect(gs).toContain("result: 'partial'")
    expect(gs).toContain("action, packageId, adminSecret: secret")
    expect(gs).toContain("callPaidFormulaRegistryAdmin_('admin-revoke'")
    expect(gs).toContain('expireFormulaDropInternal_')
    expect(gs).toContain("String(confirmed[6]) !== 'EXPIRED'")
    expect(gs).toContain('confirmedUpdatedAt')
    expect(gs).toContain('Math.abs(confirmedMillis - now.getTime()) > 2000')
    expect(gs).toContain('new Date(confirmed[10])')
    expect(gs).toContain('confirmed[10]')
  })

  it('keeps retry revoke separate from Drop mutation', () => {
    expect(gs).toContain('retryFormulaDropLicenseRevoke')
    expect(gs).toContain("context.status !== 'EXPIRED'")
    expect(html).toContain('REVOKE LICENSE')
    expect(html).toContain('retryFormulaDropLicenseRevoke')
  })

  it('requires typed confirmation and does not expose the secret to the browser', () => {
    expect(html).toContain('typed !== dropId')
    expect(html).not.toContain('PAID_FORMULA_ADMIN_SECRET')
    expect(html).not.toContain('PAID_FORMULA_REGISTRY_ADMIN_URL')
    expect(gs).toContain('confirmationDropId !== dropId')
  })

  it('keeps the existing non-revoking END DROP path', () => {
    expect(gs).toContain('function expireFormulaDrop(dropId, expectedUpdatedAt)')
    expect(gs).toContain('expireFormulaDropInternal_(dropId, expectedUpdatedAt, false)')
    expect(html).toContain("expire: 'expireFormulaDrop'")
    expect(html).toContain('운영 상태 확인 필요')
  })
})
