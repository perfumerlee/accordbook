import './rev30.css';

type PreviewRow = {
  parts: number;
  material: string;
  cas: string;
  marked?: boolean;
  dilution?: string;
  solvent?: boolean;
};

const rows: PreviewRow[] = [
  { parts: 400, material: 'Benzyl acetate', cas: '140-11-4', marked: true, dilution: '@10% in DPG' },
  { parts: 150, material: 'Linalool', cas: '78-70-6', marked: true },
  { parts: 150, material: 'Abiethyl alcohol', cas: '' },
  { parts: 50, material: 'Methyl dihydrojasmonate', cas: '24851-98-7' },
  { parts: 40, material: 'Benzyl alcohol', cas: '100-51-6' },
  { parts: 40, material: 'Methyl linoleate', cas: '112-63-0' },
  { parts: 30, material: 'cis-3-hexenyl benzoate', cas: '25152-85-6' },
  { parts: 30, material: 'Neralidol', cas: '7212-44-4' },
  { parts: 20, material: 'Acetyl methyl anthranilate', cas: '2719-08-6' },
  { parts: 20, material: 'Eugenol', cas: '97-53-0' },
  { parts: 20, material: 'Jasmin oil', cas: '', marked: true },
  { parts: 20, material: 'DPG', cas: '25265-71-8', solvent: true },
  { parts: 15, material: 'Indole', cas: '120-72-9' },
  { parts: 10, material: 'Methyl jasmonate', cas: '39924-52-2' },
  { parts: 4, material: 'Farnesol', cas: '4602-84-0' },
  { parts: 1, material: 'para-cresol', cas: '106-44-5', marked: true },
];

function USFlag() {
  return (
    <svg className="flag-svg" viewBox="0 0 7410 3900" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M0 0h7410v3900H0" fill="#b31942" />
      <path d="M0 450h7410m0 600H0m0 600h7410m0 600H0m0 600h7410m0 600H0" stroke="#fff" strokeWidth="300" />
      <path d="M0 0h2964v2100H0" fill="#0a3161" />
      <defs>
        <path id="us-star" d="M247 90 317.534 307.082 132.873 172.918H361.127L176.466 307.082z" />
      </defs>
      <g fill="#fff">
        <g id="rowA">
          <use href="#us-star" x="0" y="0" /><use href="#us-star" x="494" y="0" /><use href="#us-star" x="988" y="0" />
          <use href="#us-star" x="1482" y="0" /><use href="#us-star" x="1976" y="0" /><use href="#us-star" x="2470" y="0" />
        </g>
        <g id="rowB">
          <use href="#us-star" x="247" y="210" /><use href="#us-star" x="741" y="210" /><use href="#us-star" x="1235" y="210" />
          <use href="#us-star" x="1729" y="210" /><use href="#us-star" x="2223" y="210" />
        </g>
        <use href="#rowA" y="420" /><use href="#rowB" y="420" />
        <use href="#rowA" y="840" /><use href="#rowB" y="840" />
        <use href="#rowA" y="1260" /><use href="#rowB" y="1260" />
        <use href="#rowA" y="1680" />
      </g>
    </svg>
  );
}

function KoreaFlag() {
  return (
    <svg className="flag-svg" viewBox="-72 -48 144 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#fff" d="M-72-48v96H72v-96z" />
      <g stroke="#000" strokeWidth="4">
        <path
          transform="rotate(33.69006752598)"
          d="M-50-12v24m6 0v-24m6 0v24m76 0V1m0-2v-11m6 0v11m0 2v11m6 0V1m0-2v-11"
        />
        <path
          transform="rotate(-33.69006752598)"
          d="M-50-12v24m6 0V1m0-2v-11m6 0v24m76 0V1m0-2v-11m6 0v24m6 0V1m0-2v-11"
        />
      </g>
      <g transform="rotate(33.69006752598)">
        <path fill="#cd2e3a" d="M12 0a18 18 0 11-36 0 24 24 0 1148 0" />
        <path fill="#0047a0" d="M0 0a12 12 0 1124 0 24 24 0 11-48 0 12 12 0 1024 0" />
      </g>
    </svg>
  );
}

export default function Rev30Preview() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Accordbook</div>
        <div className="brand-sub">A formula notebook for perfumers</div>

        <div className="side-title">Formula ID prefix</div>
        <div className="prefix-row">
          <input maxLength={12} defaultValue="ACC" aria-label="Formula ID prefix" />
          <button className="btn prefix-save-btn" type="button">Save</button>
        </div>

        <button className="btn primary new-btn" type="button">+ New formula</button>

        <div className="side-title">Notebook</div>
        <div className="formula-list">
          <div className="formula-item active">
            <div className="formula-code">ACC-2608-000</div>
            <div className="formula-label">Jasmine 10</div>
          </div>
        </div>

        <div className="side-title">Data</div>
        <div className="data-actions">
          <div className="export-wrap">
            <button className="btn" type="button"><span>Export</span> ▾</button>
            <div className="export-menu">
              <button className="btn" type="button">JSON backup</button>
              <button className="btn" type="button">Print / Save current formula as PDF</button>
            </div>
          </div>
          <button className="btn" type="button">Import JSON</button>
        </div>

        <button className="btn archive-toggle" type="button">
          <span>Archive</span>
          <span className="archive-count">0</span>
        </button>
        <div className="archive-panel" />

        <div className="privacy">
          <strong>Private by default</strong><br />
          <span>Your formulas stay on your device.</span><br />
          VERSION v1.0
        </div>
      </aside>

      <main className="main">
        <section className="notebook">
          <header className="note-header">
            <div className="title-area">
              <div className="title-primary">
                <label>Formula / Accord title</label>
                <input className="formula-name" type="text" defaultValue="Jasmine 10" placeholder="Untitled formula" />
              </div>
              <div className="title-hint">1,000 parts = 10.00 g · 1 part = 0.01 g</div>
            </div>

            <div>
              <div className="page-box">
                <div className="page-key">FORMULA ID</div>
                <div className="page-value">ACC-2608-000</div>
                <div className="page-key">DATE</div>
                <div className="page-value">2026 / 08 / 28</div>
              </div>

              <div className="header-tools">
                <div className="autosave-status">
                  <span className="autosave-dot" />
                  <span>Saved locally</span>
                </div>

                <div className="language-toggle" aria-label="Language">
                  <button className="lang-btn active" type="button" aria-label="English" title="English">
                    <USFlag />
                  </button>
                  <button className="lang-btn" type="button" aria-label="한국어" title="한국어">
                    <KoreaFlag />
                  </button>
                </div>
              </div>
            </div>
          </header>

          <div className="content">
            <div className="table-head">
              <div style={{ textAlign: 'center' }}>Parts</div>
              <div>Material</div>
              <div>CAS / Ref.</div>
              <div style={{ textAlign: 'right' }}>Percent</div>
              <div />
            </div>

            <div className="rows">
              {rows.map((row, index) => (
                <div className={`row${row.marked ? ' marked' : ''}`} key={`${row.material}-${index}`}>
                  <input
                    type="number"
                    step={1}
                    min={0}
                    className="parts"
                    defaultValue={row.parts}
                    placeholder="0"
                  />

                  <div className="material-wrap">
                    <input
                      type="text"
                      className="material"
                      defaultValue={row.material}
                      placeholder="Material"
                    />
                    <div className="material-meta">
                      {row.dilution ? <span className="dilution-suffix">{row.dilution}</span> : null}
                      {row.solvent ? <span className="solvent-badge">SOLVENT</span> : null}
                    </div>
                  </div>

                  <input type="text" className="cas" defaultValue={row.cas} placeholder="CAS / Ref." />
                  <div className="percent">{(row.parts / 10).toFixed(1)}%</div>

                  <div className="row-actions">
                    <button className={`dilution-btn${row.dilution ? ' active' : ''}`} type="button">DIL</button>
                    <button className={`mark-btn${row.marked ? ' active' : ''}`} type="button">▰</button>
                    <button className="remove-btn" type="button">×</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="editor-actions">
              <button className="btn primary" type="button">+ Add material</button>
              <button className="btn" type="button">Duplicate as new page</button>
              <button className="btn" type="button">Reset materials</button>
              <button className="btn" type="button">Move to Archive</button>
            </div>

            <div className="summary-grid">
              <div>
                <div className="notes-title">Notes</div>
                <textarea
                  className="notes"
                  placeholder="Experiment notes, substitutions, observations…"
                  defaultValue=""
                />
              </div>

              <div className="metrics">
                <div className="summary-title">Total</div>
                <div className="simple-total">
                  <div className="main-line">
                    <span>Formula</span>
                    <strong>1,000 / 1,000</strong>
                  </div>
                  <div className="sub-line">
                    <span>Batch <strong>10.00 g</strong></span>
                    <span>Concentrate <strong>62.00%</strong></span>
                    <span>Solvent <strong>38.00%</strong> · <strong>3.80 g</strong></span>
                  </div>
                  <div className="status ok">Complete</div>
                </div>

                <div style={{ display: 'none' }}>
                  <strong>1000</strong>
                  <strong>0</strong>
                  <strong>6.20 g</strong>
                  <strong>3.80 g</strong>
                </div>
              </div>
            </div>
          </div>

          <footer className="note-footer">
            <span>Everything starts with the fundamentals.</span>
            <span>PAGE ACC-2608-000</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
