import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
const source = readFileSync('scripts/apps-script/formula-drop-public/FormulaDropPublic.gs', 'utf8')
const packageText = readFileSync('public/formula-drops/2026-001/ACBK-DROP-2026-001-McintoshApple.accordbook','utf8')
function fixture(url = 'https://accordbook.org/formula-drops/2026-001/ACBK-DROP-2026-001-McintoshApple.accordbook', text = packageText, status = 200, size = text.length) {
  const fetch = vi.fn(() => ({ getResponseCode: () => status, getContentText: () => text, getContent: () => ({ length: size }) }))
  const context = vm.createContext({ UrlFetchApp: { fetch } })
  vm.runInContext(source, context)
  context.json_ = (x: unknown) => x
  context.spreadsheet_ = () => ({ getSheetByName: () => ({}) })
  context.headers_ = () => {}
  context.findDropRow_ = () => ['DROP-2026-001',2026,1,'Mcintosh Apple / Simplified Study','','','ACTIVE','','','McintoshApple.accordbook',url]
  context.publicDrop_ = () => ({ status: 'ACTIVE' })
  return { fetch, context, resolve: (dropId = 'DROP-2026-001') => context.resolveDropPackage_({dropId}) }
}
describe('executable Apps Script resolver boundary', () => {
  it('resolves the allowed Drop asset without redirects', () => { const f = fixture(); expect(f.resolve().ok).toBe(true); expect(f.fetch).toHaveBeenCalledWith(expect.any(String), { followRedirects: false, muteHttpExceptions: true }) })
  it.each(['https://untrusted.example/a','http://accordbook.org/a','https://accordbook.org.evil.test/a','https://accordbook.org@evil.test/a','https://accordbook.org:444/a','https://accordbook.org/formula-drops/2026-002/x.accordbook'])('rejects %s before fetching', url => { const f=fixture(url); expect(f.resolve().ok).toBe(false); expect(f.fetch).not.toHaveBeenCalled() })
  it('rejects invalid IDs before fetching', () => { const f=fixture(); expect(f.resolve('../x').ok).toBe(false); expect(f.fetch).not.toHaveBeenCalled() })
  it.each([301,302,404,500])('rejects HTTP %s', status => { expect(fixture(undefined,packageText,status).resolve().ok).toBe(false) })
  it.each(['<html>missing</html>','{}','{"type":"accordbook-paid-package","formatVersion":2}','{"type":"accordbook-formula","formatVersion":2,"formula":{}}'])('rejects malformed or paid packages', text => { expect(fixture(undefined,text).resolve().ok).toBe(false) })
  it('rejects oversized bytes', () => { expect(fixture(undefined,packageText,200,16000001).resolve().ok).toBe(false) })
  it('rejects missing and inactive Drops', () => { const f=fixture(); f.context.findDropRow_ = () => undefined; expect(f.resolve().ok).toBe(false); expect(f.fetch).not.toHaveBeenCalled() })
})
