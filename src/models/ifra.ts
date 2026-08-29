export interface IfraMaterial {
  cas: string
  name: string
  limits: Record<string, number>
  allergen26?: boolean
  allergen83?: boolean
  declaredName?: string
}

export interface IfraDataset {
  importedAt: string
  categoryKeys: string[]
  materials: IfraMaterial[]
}
