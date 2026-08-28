export function printCurrentFormula(): boolean { if (typeof window === 'undefined' || typeof window.print !== 'function') return false; window.print(); return true }
