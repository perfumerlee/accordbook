export type ProductAnalyticsEvent =
  | 'formula_created'
  | 'formula_completed'
  | 'dilution_applied'
  | 'backup_exported'
  | 'print_opened'

type AnalyticsParams = Record<string, string>

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>
  }
}

const completedFormulaIds = new Set<string>()

function isProductionHost(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === 'perfumerlee.github.io'
}

export function trackEvent(name: ProductAnalyticsEvent, params?: AnalyticsParams): void {
  try {
    if (!isProductionHost()) return
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event: name, ...params })
  } catch {
    // Analytics is an optional side effect and must never affect the app.
  }
}

export function trackFormulaCreated(method: 'new' | 'duplicate' | 'import'): void {
  trackEvent('formula_created', { creation_method: method })
}

export function trackFormulaCompleted(formulaId: string): void {
  if (completedFormulaIds.has(formulaId)) return
  completedFormulaIds.add(formulaId)
  trackEvent('formula_completed')
}

export function trackDilutionApplied(): void { trackEvent('dilution_applied') }
export function trackBackupExported(): void { trackEvent('backup_exported') }
export function trackPrintOpened(): void { trackEvent('print_opened') }

export function resetAnalyticsForTests(): void { completedFormulaIds.clear() }
