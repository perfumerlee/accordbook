import { useEffect, useState } from 'react'
import { FormulaEditor } from './components/FormulaEditor'
import type { Formula } from './models/formula'
import { generateFormulaId } from './services/formulaIdGenerator'
import { createStorage, type AccordbookStorage, type AutosaveStatus } from './storage/storageService'
import './styles/notebook.css'

const now = () => new Date().toISOString()
const createFormula = async (storage: AccordbookStorage): Promise<Formula> => {
  const date = new Date()
  return { id: crypto.randomUUID(), formulaId: await generateFormulaId({ prefix: 'ACC', date }, storage.meta), date: date.toISOString().slice(0, 10), name: '', notes: '', rows: [{ id: crypto.randomUUID(), parts: '', material: '' }], createdAt: now(), updatedAt: now() }
}

function App() {
  const [storage, setStorage] = useState<AccordbookStorage>()
  const [formula, setFormula] = useState<Formula>()
  const [status, setStatus] = useState<AutosaveStatus>('saving')

  useEffect(() => { createStorage().then(async (value) => { setStorage(value); const formulas = await value.formulas.list(); setFormula(formulas[0] ?? await createFormula(value)); setStatus('saved-locally') }) }, [])
  useEffect(() => { if (!storage || !formula) return; setStatus('saving'); const timer = window.setTimeout(() => { storage.saveFormula(formula).then(setStatus) }, 350); return () => window.clearTimeout(timer) }, [storage, formula])

  if (!storage || !formula) return <main className="loading-shell">Opening notebook…</main>
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <p className="eyebrow">Accordbook</p>
        <h1>A formula notebook for perfumers</h1>
        <div className="sidebar-section">
          <span className="section-label">Notebook</span>
          <span className="formula-link">{formula.formulaId}</span>
        </div>
        <div className="sidebar-footer">
          <strong>Private by default</strong>
          <span>Your formulas stay on your device.</span>
          <span>Everything starts with the fundamentals.</span>
        </div>
      </aside>
      <section className="notebook-page" aria-label="Formula notebook">
        <FormulaEditor formula={formula} autosaveStatus={status} onChange={setFormula} />
        <footer>Everything starts with the fundamentals.</footer>
      </section>
    </main>
  )
}

export default App
