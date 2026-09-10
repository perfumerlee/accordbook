import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import WideWorkspaceShell from '../src/components/WideWorkspaceShell'

describe('WideWorkspaceShell', () => {
  it('renders shared identity, context, divider, close button, and child content', () => {
    const html = renderToStaticMarkup(<WideWorkspaceShell eyebrow="EXPERIMENT" formulaId="ACC-2609-003" formulaName="Soft Floral Study" context="Experiment" closeLabel="Close" onClose={() => undefined}><p>content</p></WideWorkspaceShell>)
    expect(html).toContain('EXPERIMENT')
    expect(html).toContain('ACC-2609-003')
    expect(html).toContain('Soft Floral Study')
    expect(html).toContain('Experiment')
    expect(html).toContain('content')
    expect(html).toContain('aria-label="Close"')
    expect(html).toContain('wide-workspace__rule')
  })

  it('omits optional eyebrow and context without placeholders', () => {
    const html = renderToStaticMarkup(<WideWorkspaceShell formulaId="ACC-1" closeLabel="Close" onClose={() => undefined}><span>sheet</span></WideWorkspaceShell>)
    expect(html).not.toContain('wide-workspace__eyebrow')
    expect(html).not.toContain('wide-workspace__context')
    expect(html).toContain('sheet')
  })
})
