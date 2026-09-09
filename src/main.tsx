import { Component, StrictMode, useCallback, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import AccordbookNotebook from './components/AccordbookNotebook'
import { IntroSplash } from './components/IntroSplash'
import Rev30Preview from './rev30-preview/Rev30Preview'
import FormulaDropIndexPage from './components/FormulaDropIndexPage'
import FormulaDropDetailPage from './components/FormulaDropDetailPage'
import { resolveAccordbookRoute } from './services/formulaDropRoutes'

const reservedRoute = new URLSearchParams(window.location.search).get('__accordbook_route')
if (reservedRoute && reservedRoute.startsWith('/drop')) {
  try { const restored = new URL(reservedRoute, window.location.origin); if (restored.origin === window.location.origin && /^\/drop(?:\/|$)/.test(restored.pathname)) window.history.replaceState({}, '', restored.pathname + restored.search + restored.hash) } catch { /* keep the safe root route */ }
}
const isRev30Preview = new URLSearchParams(window.location.search).get('rev30preview') === '1'
const route = resolveAccordbookRoute(window.location.pathname)

// Keep one React root when Vite re-evaluates this entry during development.
const root: Root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!)
if (import.meta.hot) {
  import.meta.hot.dispose((data) => { data.root = root })
}

root.render(
  <StrictMode>
    {isRev30Preview ? <Rev30Preview /> : route.kind === 'drop-index' ? <FormulaDropIndexPage /> : route.kind === 'drop-detail' ? <FormulaDropDetailPage dropId={route.dropId} /> : <ProductionWithIntro />}
  </StrictMode>,
)

function ProductionWithIntro() {
  const [introDone, setIntroDone] = useState(false)
  const handleIntroDone = useCallback(() => setIntroDone(true), [])
  return <><AccordbookNotebook introComplete={introDone} /><>{!introDone && <IntroSplashBoundary onDone={handleIntroDone} />}</></>
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
