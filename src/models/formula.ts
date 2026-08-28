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

export interface Formula {
  id: string
  formulaId: string
  date: string
  name: string
  notes: string
  rows: FormulaMaterial[]
  createdAt: string
  updatedAt: string
  archivedAt?: string
}
