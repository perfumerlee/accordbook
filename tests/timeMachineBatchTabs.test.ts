import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TimeMachinePanel, { TIME_MACHINE_TABS } from '../src/components/TimeMachinePanel'
import { ScaleBatchView } from '../src/components/ScaleBatchView'
import { createStorage } from '../src/storage/storageService'
import type { FormulaVersion } from '../src/models/formula'
const version = (parts: number): FormulaVersion => ({ versionId: 'v6', parentFormulaId: 'f', versionNumber: 6, kind: 'manual', createdAt: '2026-09-05T00:00:00Z', sourceCurrentUpdatedAt: '', note: '', snapshot: { name: 'Historical', formulaId: 'ACC', date: '', notes: '', rows: [{ rowId: 'source', material: 'Historical material', parts }] } })

describe('Time Machine workspaces', () => {
  it('renders only VERSION and COMPARE tabs before a version is selected', async () => {
    expect(TIME_MACHINE_TABS).toEqual(['version', 'compare'])
    const html = renderToStaticMarkup(createElement(TimeMachinePanel, { formula: { id: 'f', formulaId: 'ACC', name: 'Current', date: '', notes: '', rows: [], createdAt: '', updatedAt: '' }, storage: await createStorage(), language: 'en', isOpen: true, onClose: () => {} }))
    expect(html.match(/role="tab"/g)).toHaveLength(2)
    expect(html).not.toContain('id="tm-tab-batch"')
    expect(html).not.toContain('aria-controls="tm-view-batch"')
    expect(html).not.toContain('tm-batch-action')
    expect(html).not.toContain('tm-make-batch')
  })
  it('shows the no-selection state with disabled calculator', () => {
    const html = renderToStaticMarkup(createElement(ScaleBatchView, { language: 'en' }))
    expect(html).toContain('Select a version to calculate a batch.')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('<table')
  })
  it.each([740, 999, 1001])('explains incomplete %s parts without a result', parts => {
    const html = renderToStaticMarkup(createElement(ScaleBatchView, { version: version(parts), language: 'en' }))
    expect(html).toContain('Complete the formula to calculate a batch.')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('<table')
  })
  it('uses the supplied selected snapshot and defaults to 10 grams', () => {
    const html = renderToStaticMarkup(createElement(ScaleBatchView, { version: version(1000), language: 'en' }))
    expect(html).toContain('Historical material')
    expect(html).toContain('v6')
    expect(html).toContain('10.00')
    expect(html).toContain('aria-pressed="true">g')
    expect(html).not.toContain('disabled=""')
  })
  it.each([[1, 1000, 0], [2, 980, 20], [3, 970, 30], [4, 1000, 0]] as const)('explains eligibility by parts, not version number: v%s', (number, parts, shortage) => {
    const selected = { ...version(parts), versionId: 'v' + number, versionNumber: number }
    const html = renderToStaticMarkup(createElement(ScaleBatchView, { version: selected, language: 'en' }))
    expect(html).toContain(parts.toLocaleString('en-US') + ' / 1,000 parts')
    if (shortage) {
      expect(html).toContain('Add ' + shortage + ' more parts.')
      expect(html).toContain('save and select a new version')
      expect(html).not.toContain('<table')
    } else {
      expect(html).toContain('<table')
      expect(html).not.toContain('disabled=""')
    }
  })
  it('does not reconstruct or substitute unavailable content', () => {
    const unavailable = { ...version(1000), snapshot: undefined } as unknown as FormulaVersion
    const html = renderToStaticMarkup(createElement(ScaleBatchView, { version: unavailable, language: 'en' }))
    expect(html).toContain('Version content is unavailable.')
    expect(html).not.toContain('<table')
  })
})
