import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

it.each(['DRAFT', 'ACTIVE'])('loads actual %s edit row and preserves strings', status => {
  const source = readFileSync(new URL('../scripts/apps-script/formula-drop-admin/FormulaDropAdmin.gs', import.meta.url), 'utf8')
  const row = ['DROP-2099-002', 2099, 2, 'Floral Structure', 'Subtitle', 'Description', status, '', '', 'test.accordbook', 'https://example.com/test.accordbook', '00000000-0000-4000-8000-000000000099', 'campaign', '0000', '012345', new Date('2099-01-01T00:00:00Z'), new Date('2099-01-02T00:00:00Z')]
  const sheet = { getLastRow: () => 2, getRange: () => ({ getValues: () => [row] }) }
  const context = { Date, sheet }
  const result = runInNewContext(source + `\nformulaDropSpreadsheet_ = () => ({getSheetByName: () => sheet}); checkFormulaDropHeaders_ = () => {}; getFormulaDropAdminConfig('DROP-2099-002');`, context)
  expect(result).toMatchObject({ title: 'Floral Structure', status, subtitle: 'Subtitle', description: 'Description', publicAccessLast4: '0000', publicAccessPin: '012345', updatedAt: '2099-01-02T00:00:00.000Z' })
  expect(result.fileName).toBe('test.accordbook')
  expect(result.fileUrl).toBe(row[10])
  expect(result.licenseId).toBe(row[11])
})
