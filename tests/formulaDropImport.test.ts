import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const importer = readFileSync(new URL('../src/components/PaidFormulaImport.tsx', import.meta.url), 'utf8')
const download = readFileSync(new URL('../src/services/formulaDropDownload.ts', import.meta.url), 'utf8')
const identity = readFileSync(new URL('../src/services/formulaDropIdentity.ts', import.meta.url), 'utf8')
const api = readFileSync(new URL('../src/services/formulaDropPublicApi.ts', import.meta.url), 'utf8')
const script = readFileSync(new URL('../scripts/apps-script/formula-drop-public/FormulaDropPublic.gs', import.meta.url), 'utf8')

describe('Formula Drop Phase 5 import funnel contract', () => {
  it('remembers Drop context only after a successful download', () => {
    expect(download).toContain('rememberFormulaDropImport(dropId)')
    expect(identity).toContain('accordbook.drop.import-context.v1')
  })

  it('resolves canonical Drop identity from the package ID and fails open', () => {
    expect(api).toContain("action: 'resolve-import-drop'")
    expect(api).toContain('catch { return undefined }')
    expect(importer).toContain('resolveFormulaDropByPackageId(file.packageId)')
    expect(script).toContain("ambiguous_mapping")
    expect(script).not.toContain('PaidFormulaLicenses')
  })

  it('records attempt and success around the existing import lifecycle', () => {
    expect(importer).toContain("'import_attempt'")
    expect(importer).toContain("'import_success'")
    expect(importer).toContain("await onImport(shared)")
    expect(importer.indexOf("'import_success'")).toBeGreaterThan(importer.indexOf('await onImport(shared)'))
  })

  it('does not record a pre-attempt lock as an import failure', () => {
    expect(importer).toContain("if (lockMatch)")
    expect(importer).toContain("'import_failed'")
    expect(importer.indexOf("'import_failed'")).toBeGreaterThan(importer.indexOf('} else {'))
  })
})
