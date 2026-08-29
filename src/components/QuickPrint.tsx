export default function QuickPrint({ label, onPrint }: { label: string; onPrint: () => void }) {
  return <button className="quick-print" type="button" aria-label={label} title={label} onClick={onPrint}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" /></svg></button>
}
