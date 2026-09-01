export interface StarterFormulaTemplate {
  id: string
  title: string
  description: string
  materials: Array<{ name: string; parts: number }>
  notes: string
}

const practiceNote = (body: string) => `${body}\n\nFor olfactory study and formula practice. Check current IFRA Standards, supplier documentation, and local regulations before use in a finished product.`

export const starterFormulas: StarterFormulaTemplate[] = [
  { id: 'starter-citrus-01', title: 'Simple Citrus Study', description: 'Learn the basic 1,000-part workflow.', materials: [['Bergamot FCF', 250], ['Linalyl Acetate', 220], ['Linalool', 100], ['Hedione', 230], ['Iso E Super', 80], ['Ethylene Brassylate', 120]].map(([name, parts]) => ({ name: name as string, parts: parts as number })), notes: practiceNote('A simple citrus study for learning the 1,000-part workflow.\n\nTry reducing Bergamot FCF by 50 parts and adding those 50 parts to Hedione.') },
  { id: 'starter-floral-01', title: 'Soft Floral Study', description: 'Explore a simple floral structure.', materials: [['Hedione', 320], ['Phenyl Ethyl Alcohol', 260], ['Linalool', 100], ['Linalyl Acetate', 80], ['Bergamot FCF', 60], ['Iso E Super', 80], ['Ethylene Brassylate', 100]].map(([name, parts]) => ({ name: name as string, parts: parts as number })), notes: practiceNote('A soft floral study built around Hedione and Phenyl Ethyl Alcohol.\n\nMove 100 parts from PEA to Hedione and compare the difference in transparency.') },
  { id: 'starter-woody-01', title: 'Woody Musk Study', description: 'Explore a simple woody-musky base.', materials: [['Iso E Super', 400], ['Cedarwood Virginia EO', 180], ['Ethylene Brassylate', 220], ['Hedione', 100], ['Bergamot FCF', 60], ['Linalyl Acetate', 40]].map(([name, parts]) => ({ name: name as string, parts: parts as number })), notes: practiceNote('A simple woody-musk study built around Iso E Super, Cedarwood and Ethylene Brassylate.\n\nReduce Iso E Super by 100 parts and add those 100 parts to Cedarwood Virginia.') },
]
