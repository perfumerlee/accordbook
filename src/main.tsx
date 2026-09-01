import { Component, StrictMode, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import AccordbookNotebook from './components/AccordbookNotebook'
import { IntroSplash } from './components/IntroSplash'
import Rev30Preview from './rev30-preview/Rev30Preview'

const isRev30Preview = new URLSearchParams(window.location.search).get('rev30preview') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isRev30Preview ? <Rev30Preview /> : <ProductionWithIntro />}
  </StrictMode>,
)

function ProductionWithIntro() {
  const [introDone, setIntroDone] = useState(false)
  return <><AccordbookNotebook /><>{!introDone && <IntroSplashBoundary onDone={() => setIntroDone(true)} />}</></>
}

class IntroSplashBoundary extends Component<{ onDone: () => void; children?: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Accordbook intro splash failed; continuing to notebook', error)
    this.props.onDone()
  }

  render() {
    return this.state.failed ? null : <IntroSplash oncePerSession={false} onDone={this.props.onDone} />
  }
}
