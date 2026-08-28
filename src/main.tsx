import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AccordbookNotebook from './components/AccordbookNotebook'
import Rev30Preview from './rev30-preview/Rev30Preview'

const isRev30Preview = new URLSearchParams(window.location.search).get('rev30preview') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isRev30Preview ? <Rev30Preview /> : <AccordbookNotebook />}
  </StrictMode>,
)
