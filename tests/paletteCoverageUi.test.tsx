import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FormulaMaterial } from '../src/models/formula'
import { createPaletteRecord } from '../src/services/materialPalette'
import PaletteCoverage from '../src/components/PaletteCoverage'

const rows: FormulaMaterial[] = [
  { id: '1', material: 'Hedione', parts: 10 },
  { id: '2', material: 'HEDIONE', parts: 20 },
  { id: '3', material: 'White musk', parts: 30 },
  { id: '4', material: '', parts: '' },
]
const props = { rows, records: [createPaletteRecord({ materialName: 'Hedione' })], repository: {} as never, onChanged: async () => {}, language: 'en' as const }

describe('Palette Coverage UI', () => {
  it('shows matched, unique total, and missing counts in an accessible button', () => {
    const html = renderToStaticMarkup(<PaletteCoverage {...props} />)
    expect(html).toContain('Palette 1/2 · Missing 1')
    expect(html).toContain('Material Palette: 1 of 2 unique materials, 1 missing. View missing materials.')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('class="palette-coverage-chevron"')
  })

  it('localizes the status and accessible label to Korean', () => {
    const html = renderToStaticMarkup(<PaletteCoverage {...props} language="ko" />)
    expect(html).toContain('팔레트 1/2 · 누락 1')
    expect(html).toContain('팔레트에 등록된 원료 1개 / 고유 원료 2개, 누락 1개. 누락 원료 보기.')
  })
})
