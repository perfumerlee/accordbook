import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const api = readFileSync(new URL('../src/services/formulaDropPublicApi.ts', import.meta.url), 'utf8')
const download = readFileSync(new URL('../src/services/formulaDropDownload.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/components/FormulaDropDetailPage.tsx', import.meta.url), 'utf8')
const script = readFileSync(new URL('../scripts/apps-script/formula-drop-public/FormulaDropPublic.gs', import.meta.url), 'utf8')
describe('Formula Drop Phase 4 download contract', () => {
  it('uses a dedicated get-download action and validates the access projection', () => { expect(api).toContain("action: 'get-download'"); expect(api).toContain('accessLast4'); expect(api).toContain('accessPin'); expect(api).toContain("/^\\d{6}$/") })
  it('creates one new event ID per download and preserves the package filename on mobile', () => { expect(download).toContain('createFormulaDropEventId()'); expect(download).toContain('response.blob()'); expect(download).toContain('URL.createObjectURL(blob)'); expect(download).toContain('link.download = download.fileName'); expect(download).toContain('link.click()') })
  it('reveals access values only after a successful active download', () => { expect(page).toContain('DOWNLOAD FORMULA'); expect(page).toContain('PREPARING…'); expect(page).toContain('FORMULA DOWNLOAD STARTED'); expect(page).toContain('accessPin') })
  it('checks active eligibility before locking and appending a download event', () => { expect(script).toContain("input.action === 'get-download'"); expect(script).toContain("publicDrop.status !== 'ACTIVE'"); expect(script).toContain("'download'"); expect(script).toContain('eventExists_(events, input.eventId)'); expect(script).toContain('LockService.getScriptLock()'); expect(script).not.toMatch(/PaidFormulaLicenses|buyerName|pinVerifier|requestVerifier/) })
})
