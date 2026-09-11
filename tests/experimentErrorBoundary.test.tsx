import { describe, expect, it, vi } from 'vitest'
import ExperimentErrorBoundary from '../src/components/ExperimentErrorBoundary'

describe('ExperimentErrorBoundary', () => {
  it('renders a quiet recovery action without exposing the exception', () => {
    const onReturn = vi.fn()
    const boundary = new ExperimentErrorBoundary({ language: 'ko', onReturn, children: null })
    boundary.state = ExperimentErrorBoundary.getDerivedStateFromError(new Error('secret stack'))
    const view = boundary.render() as any
    expect(view.props.role).toBe('alert')
    expect(JSON.stringify(view)).not.toContain('secret stack')
    const findButton = (node: any): any => !node ? undefined : Array.isArray(node) ? node.map(findButton).find(Boolean) : node?.type === 'button' ? node : findButton(node?.props?.children)
    expect(findButton(view)?.props.onClick).toBe(onReturn)
  })
  it('starts clean for a new boundary instance', () => {
    const boundary = new ExperimentErrorBoundary({ language: 'en', onReturn: () => undefined, children: null })
    expect(boundary.state.failed).toBe(false)
    expect(boundary.render()).toBeNull()
  })
})
