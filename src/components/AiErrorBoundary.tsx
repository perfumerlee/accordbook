import { Component, type ReactNode } from 'react'
import { aiMessages } from '../i18n/aiMessages'
export default class AiErrorBoundary extends Component<{ language: 'en' | 'ko'; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { /* No content, token or exception logging. */ }
  render() {
    const m = aiMessages[this.props.language]
    return this.state.failed ? <section className="ai-review" role="status"><p>{m.boundary}</p><button type="button" onClick={() => this.setState({ failed: false })}>{m.reset}</button></section> : this.props.children
  }
}
