export function getFormulaDropApiEndpoint(): string {
  if (import.meta.env.MODE === 'test') return ''
  return (import.meta.env.VITE_FORMULA_DROP_PUBLIC_API_URL ?? '').trim()
}
