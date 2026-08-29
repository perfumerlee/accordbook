import { describe, expect, it } from 'vitest'
import { parseNaturalContributionCsv } from '../src/services/naturalContributionCsvParser'

describe('parseNaturalContributionCsv', () => {
  it('parses NCS-to-constituent contribution rows', () => {
    const csv = 'ncs_cas,ncs_name,constituent_cas,constituent_name,percent\n' +
      '8000-28-0,Lavandula oil,78-70-6,Linalool,30\n'
    const { dataset, skippedRows } = parseNaturalContributionCsv(csv)
    expect(skippedRows).toBe(0)
    expect(dataset.entries).toHaveLength(1)
    expect(dataset.entries[0]).toEqual({ ncsCas: '8000-28-0', ncsName: 'Lavandula oil', constituentCas: '78-70-6', constituentName: 'Linalool', percent: 30 })
  })

  it('skips rows missing a CAS or percent', () => {
    const csv = 'ncs_cas,ncs_name,constituent_cas,constituent_name,percent\n' +
      ',Lavandula oil,78-70-6,Linalool,30\n' +
      '8000-28-0,Lavandula oil,,Linalool,30\n' +
      '8000-28-0,Lavandula oil,78-70-6,Linalool,\n'
    const { dataset, skippedRows } = parseNaturalContributionCsv(csv)
    expect(skippedRows).toBe(3)
    expect(dataset.entries).toHaveLength(0)
  })

  it('handles quoted fields with commas', () => {
    const csv = 'ncs_cas,ncs_name,constituent_cas,constituent_name,percent\n' +
      '8000-28-0,"Lavandula, hybrid oil",78-70-6,Linalool,30\n'
    const { dataset } = parseNaturalContributionCsv(csv)
    expect(dataset.entries[0].ncsName).toBe('Lavandula, hybrid oil')
  })
})
