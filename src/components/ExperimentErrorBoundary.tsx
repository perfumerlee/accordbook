import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { language: 'en' | 'ko'; onReturn: () => void; children: ReactNode }
type State = { failed: boolean }

export default class ExperimentErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }
  static getDerivedStateFromError(): State { return { failed: true } }
  componentDidCatch(error: unknown, info: ErrorInfo) { console.error('Experiment workspace failed to render', error, info) }
  render() {
    if (!this.state.failed) return this.props.children
    const ko = this.props.language === 'ko'
    return <main className="experiments-workspace experiments-error-boundary" role="alert"><div><div className="experiments-eyebrow">EXPERIMENTS</div><h1>{ko ? '실험을 여는 중 문제가 발생했습니다.' : 'Something went wrong while opening this Experiment.'}</h1><button type="button" onClick={this.props.onReturn}>{ko ? 'Formula로 돌아가기' : 'Return to Formula'}</button></div></main>
  }
}
