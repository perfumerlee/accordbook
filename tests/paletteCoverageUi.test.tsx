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
    expect(html).toContain('Owned <strong>1</strong>')
    expect(html).toContain('Missing <strong>1</strong>')
    expect(html).toContain('2 MATERIALS')
    expect(html).toContain('Material Palette: 1 of 2 unique materials, 1 missing. View missing materials.')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('class="palette-coverage-chevron"')
    expect(html).toContain('title="View material palette details"')
  })

  it('localizes the status and accessible label to Korean', () => {
    const html = renderToStaticMarkup(<PaletteCoverage {...props} language="ko" />)
    expect(html).toContain('보유 <strong>1</strong>')
    expect(html).toContain('미보유 <strong>1</strong>')
    expect(html).toContain('원료 2개')
    expect(html).toContain('팔레트에 등록된 원료 1개 / 고유 원료 2개, 누락 1개. 누락 원료 보기.')
  })
  it('shows zero coverage for an empty Formula', () => {
    const html = renderToStaticMarkup(<PaletteCoverage {...props} rows={[]} />)
    expect(html).toContain('0 MATERIALS')
    expect(html).toContain('Owned <strong>0</strong>')
    expect(html).toContain('Missing <strong>0</strong>')
    expect(html).not.toContain('Missing 0')
    expect(html).toContain('palette-coverage-chevron')
  })
  it('marks full coverage without a missing warning', () => {
    const html = renderToStaticMarkup(<PaletteCoverage {...props} records={[...props.records, createPaletteRecord({ materialName: 'White musk' })]} />)
    expect(html).toContain('2 MATERIALS')
    expect(html).toContain('Owned <strong>2</strong>')
    expect(html).toContain('Missing <strong>0</strong>')
    expect(html).toContain('palette-coverage-chevron')
    expect(html).not.toContain('Missing 0')
    expect(html).toContain('View Palette status.')
  })
})
