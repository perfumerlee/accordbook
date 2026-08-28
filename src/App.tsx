import './styles/notebook.css'

function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <p className="eyebrow">Accordbook</p>
        <h1>A formula notebook for perfumers</h1>
        <div className="sidebar-section">
          <span className="section-label">Notebook</span>
          <button className="formula-link" type="button">+ New formula</button>
        </div>
        <div className="sidebar-footer">
          <strong>Private by default</strong>
          <span>Your formulas stay on your device.</span>
          <span>Everything starts with the fundamentals.</span>
        </div>
      </aside>
      <section className="notebook-page" aria-label="Formula notebook">
        <header className="formula-header">
          <div>
            <span className="section-label">Formula</span>
            <h2>Untitled formula</h2>
          </div>
          <dl>
            <div><dt>FORMULA ID</dt><dd>ACC-2608-000</dd></div>
            <div><dt>DATE</dt><dd>2026 / 08 / 28</dd></div>
          </dl>
        </header>
        <div className="placeholder-sheet">
          <p>Enter parts and materials to begin.</p>
          <span>Phase 1 foundation is ready.</span>
        </div>
        <footer>Everything starts with the fundamentals.</footer>
      </section>
    </main>
  )
}

export default App
