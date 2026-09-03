import type { StarterFormulaTemplate } from '../data/starterFormulas'

export function StarterFormulaPicker({ starters, language, onSelect, onClose }: { starters: StarterFormulaTemplate[]; language: 'en' | 'ko'; onSelect: (starter: StarterFormulaTemplate) => void; onClose: () => void }) {
  const ko = language === 'ko'
  return <div className="starter-picker" role="dialog" aria-label={ko ? '샘플 포뮬러' : 'Sample formulas'}><div className="starter-picker-head"><div><span className="side-title">{ko ? '샘플 포뮬러' : 'SAMPLE FORMULAS'}</span><h2>{ko ? '샘플로 시작하기' : 'Start with a sample'}</h2></div><button type="button" aria-label={ko ? '닫기' : 'Close'} onClick={onClose}>×</button></div>{starters.map((starter) => <button className="starter-picker-item" type="button" key={starter.id} onClick={() => onSelect(starter)}><span><strong>{starter.title}</strong><small>{starter.description}</small></span><b>{ko ? '이 샘플 사용' : 'USE THIS SAMPLE'}</b></button>)}</div>
}
