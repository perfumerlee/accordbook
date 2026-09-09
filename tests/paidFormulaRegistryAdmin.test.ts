import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../scripts/apps-script/PaidFormulaRegistry.gs', import.meta.url), 'utf8')

describe('Paid Formula Registry Phase 7B-1 admin contract', () => {
  it('routes private admin actions separately from public actions', () => {
    expect(source).toContain("input.action === 'admin-revoke'")
    expect(source).toContain("input.action === 'admin-license-status'")
    expect(source).toContain("input.action !== 'register'")
    expect(source).toContain("input.action === 'verify'")
    expect(source).toContain("input.action === 'lock-status'")
  })

  it('uses a separate Script Property and fails closed', () => {
    expect(source).toContain("PAID_FORMULA_ADMIN_SECRET")
    expect(source).toContain("error: 'unauthorized'")
    expect(source).not.toContain('SELLER_TOKEN === input.adminSecret')
    expect(source).not.toContain('PIN_PEPPER === input.adminSecret')
  })

  it('validates exact package IDs and handles duplicates safely', () => {
    expect(source).toContain('validPackageId_')
    expect(source).toContain("error: 'ambiguous'")
    expect(source).toContain('adminRows_')
  })

  it('implements locked idempotent revoke without changing other fields', () => {
    expect(source).toContain('LockService.getScriptLock()')
    expect(source).toContain("status: 'already_revoked'")
    expect(source).toContain("setValue('revoked')")
    expect(source).toContain("error: 'invalid_license_state'")
    expect(source).not.toContain('admin-activate')
    expect(source).not.toContain('revokedAt')
  })

  it('keeps responses minimal and preserves existing verification semantics', () => {
    expect(source).toContain('return reply_({ ok: true, status });')
    expect(source).toContain("row[6] !== 'active'")
    expect(source).not.toContain('buyerName:')
    expect(source).not.toContain('pinVerifier:')
  })
})
