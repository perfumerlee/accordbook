import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

const source = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/FormulaDropAdmin.gs', import.meta.url), 'utf8')
function fixture(remote: object = { ok: true, accessMode: 'shared' }) {
  const id = 'DROP-2099-002', license = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const stamp = new Date('2099-01-01T00:00:00Z')
  const rows: any[][] = []
  const calls: any[] = []
  const order: string[] = []
  const sheet = {
    getLastColumn: () => 17,
    getLastRow: () => rows.length,
    getRange: (r: number, c: number, h = 1, w = 1) => ({
      getValues: () => rows.slice(r - 1, r - 1 + h).map(row => row.slice(c - 1, c - 1 + w)),
      setValues: (values: any[][]) => { order.push('write'); values.forEach((row, i) => { rows[r - 1 + i] ||= []; row.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v }) }) },
    }),
  }
  const ctx: any = {
    Date,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => key.endsWith('_URL') ? 'https://example.com/registry' : 'synthetic-config' }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush: () => {} },
    LockService: { getScriptLock: () => ({ waitLock: () => order.push('lock'), hasLock: () => true, releaseLock: () => order.push('release') }) },
    UrlFetchApp: { fetch: (_url: string, options: any) => { order.push('registry'); calls.push(JSON.parse(options.payload)); return { getResponseCode: () => 200, getContentText: () => JSON.stringify(remote) } } },
  }
  runInNewContext(source, ctx)
  rows.push(runInNewContext('FORMULA_DROPS_HEADERS', ctx))
  rows.push([id, 2099, 2, 'Synthetic', '', '', 'DRAFT', '', '', '', '', '', '', '', '', stamp, stamp])
  return { ctx, rows, calls, order, id, license, stamp }
}

it('confirms shared through the private bridge before saving a Drop license mapping', () => {
  const f = fixture()
  expect(f.ctx.updateFormulaDrop(f.id, f.stamp.toISOString(), { licenseId: f.license }).ok).toBe(true)
  expect(f.calls).toEqual([{ action: 'admin-set-shared', packageId: f.license, adminSecret: 'synthetic-config' }])
  expect(f.rows[1][11]).toBe(f.license)
  expect(f.order).toEqual(['lock', 'registry', 'write', 'release'])
  expect(f.ctx.updateFormulaDrop(f.id, f.rows[1][16].toISOString(), { title: 'Again' }).ok).toBe(true)
  expect(f.calls).toHaveLength(2)
})

it('does not save on policy failure or accept a status response as policy confirmation', () => {
  for (const response of [{ ok: false, error: 'unauthorized' }, { ok: true, status: 'active' }]) {
    const f = fixture(response), before = f.rows[1].slice()
    expect(f.ctx.updateFormulaDrop(f.id, f.stamp.toISOString(), { licenseId: f.license })).toEqual({ ok: false, error: 'license_policy_not_confirmed' })
    expect(f.rows[1]).toEqual(before)
    expect(f.order.at(-1)).toBe('release')
  }
})

it('checks conflict and duplicate mappings before changing Registry policy', () => {
  const f = fixture()
  expect(f.ctx.updateFormulaDrop(f.id, 'stale', { licenseId: f.license }).error).toBe('conflict')
  f.rows.push(['DROP-2099-003', 2099, 3, '', '', '', 'DRAFT', '', '', '', '', f.license])
  expect(f.ctx.updateFormulaDrop(f.id, f.stamp.toISOString(), { licenseId: f.license }).error).toBe('duplicate_license_id')
  expect(f.calls).toHaveLength(0)
})

it('creates an empty Draft without a Registry request', () => {
  const f = fixture()
  expect(f.ctx.createFormulaDropDraft({}).ok).toBe(true)
  expect(f.calls).toHaveLength(0)
})

it('also confirms a license passed directly to Draft creation', () => {
  const f = fixture({ ok: false, error: 'not_found' })
  expect(f.ctx.createFormulaDropDraft({ licenseId: f.license }).error).toBe('license_policy_not_confirmed')
  expect(f.rows).toHaveLength(2)
})
