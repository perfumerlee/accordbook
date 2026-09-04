export function isAccordionAvailable(actualFormulaCount: number): boolean {
  return actualFormulaCount > 0
}

export function reconcileAccordionOpen(open: boolean, actualFormulaCount: number, autoOpen = false): boolean {
  if (actualFormulaCount === 0) return false
  return open || autoOpen
}
