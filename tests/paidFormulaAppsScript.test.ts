import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createHmac } from 'node:crypto'
import { expect, it } from 'vitest'

it('Apps Script authenticates sellers, records verifiers and deduplicates retries', () => {
  const rows: any[][] = []
  const sheet = {
    getLastRow: () => rows.length,
    appendRow: (row: any[]) => rows.push(row),
    setFrozenRows: () => {},
    getRange: (r: number, c: number, height: number, width: number) => ({
      getValues: () => rows.slice(r - 1, r - 1 + height).map(row => row.slice(c - 1, c - 1 + width)),
      setNumberFormat: () => {},
      setNotes: () => {},
      setValues: (values: any[][]) => { values.forEach((valueRow, i) => { const target = rows[r - 1 + i] || []; valueRow.forEach((value, j) => { target[c - 1 + j] = value }); rows[r - 1 + i] = target }) },
    }),
  }
  const token = 'seller-secret-'.repeat(4)
  const cache = new Map<string, string>()
  const context: any = {
    CacheService: { getScriptCache: () => ({ get: (key: string) => cache.get(key), put: (key: string, value: string) => cache.set(key, value), remove: (key: string) => cache.delete(key) }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (name: string) => name === 'SELLER_TOKEN' ? token : 'pepper-secret-'.repeat(4) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, hasLock: () => true, releaseLock: () => {} }) },
    Utilities: { Charset: { UTF_8: 'utf8' }, computeHmacSha256Signature: (value: string, key: string) => createHmac('sha256', key).update(value).digest(), base64Encode: (value: Uint8Array) => Buffer.from(value).toString('base64') },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ setMimeType: () => JSON.parse(text) }) },
  }
  runInNewContext(readFileSync(new URL('../scripts/apps-script/PaidFormulaRegistry.gs', import.meta.url), 'utf8'), context)
  context.setupPaidFormulaRegistry()
  const request = { action: 'register', sellerToken: token, packageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', buyerName: '=Buyer', phone: '010-1234-0012', pin: '000123', productName: 'Pack' }
  const post = (value: object) => context.doPost({ postData: { contents: JSON.stringify(value) } })
  expect(post({ ...request, sellerToken: 'wrong' }).ok).toBe(false)
  expect(rows).toHaveLength(1)
  expect(post(request).ok).toBe(true)
  expect(rows).toHaveLength(2)
  expect(rows[1][1]).toBe("'=Buyer")
  expect(rows[1][3]).toBe('0012')
  expect(rows[1]).not.toContain('000123')
  expect(post(request).ok).toBe(true)
  expect(rows).toHaveLength(2)
  expect(post({ ...request, pin: '999999' }).ok).toBe(false)
  const verify = { action: 'verify', packageId: request.packageId, buyerName: request.buyerName, phoneLast4: '0012', pin: request.pin }
  expect(post(verify)).toEqual({ ok: true, packageId: request.packageId })
  expect(post({ ...verify, phoneLast4: '9999' }).ok).toBe(false)
  expect(post({ ...verify, buyerName: 'Other' }).ok).toBe(false)
  for (let i = 0; i < 4; i++) expect(post({ ...verify, pin: '999999' }).ok).toBe(false)
  expect(post(verify).ok).toBe(false)
  expect(rows[1][10]).toBe(5)
  rows[1][10] = 0
  rows[1][11] = ''
  expect(post(verify).ok).toBe(true)
  rows[1][6] = 'revoked'
  expect(post(verify).ok).toBe(false)
  expect(post(request).ok).toBe(false)
})
