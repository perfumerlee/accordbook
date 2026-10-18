import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SolventInput from '../src/components/SolventInput'

describe('SolventInput', () => {
  it('renders a controlled accessible combobox in English', () => {
    const html = renderToStaticMarkup(<SolventInput value="My Custom Solvent" onChange={() => {}} language="en" ariaLabel="Solvent" id="solvent" />)
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-label="Solvent"')
    expect(html).toContain('aria-controls="solvent-suggestions"')
    expect(html).toContain('value="My Custom Solvent"')
    expect(html).toContain('role="listbox"')
  })

  it('localizes the suggestion list label and keeps canonical values in the shared dictionary', () => {
    const html = renderToStaticMarkup(<SolventInput value="Dipropylene" onChange={() => {}} language="ko" ariaLabel="용매" />)
    expect(html).toContain('aria-label="용매"')
    expect(html).toContain('aria-label="용매 제안"')
    expect(html).toContain('DPG — Dipropylene Glycol')
  })

  it('keeps the suggest-only status distinct from input normalization', () => {
    const html = renderToStaticMarkup(<SolventInput value="Alcohol" onChange={() => {}} language="en" ariaLabel="Solvent" />)
    expect(html).toContain('value="Alcohol"')
    expect(html).not.toContain('value="ALC"')
  })
})
