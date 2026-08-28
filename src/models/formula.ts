export interface FormulaDilution {
  enabled: boolean
  percent: number
  solvent: string
}

export interface FormulaMaterial {
  id: string
  parts: number | ''
  material: string
  cas?: string
  marked?: boolean
  dilution?: FormulaDilution
}
