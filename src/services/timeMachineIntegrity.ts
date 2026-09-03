import type { AccordbookStorage } from '../storage/storageService'

export async function ensureTimeMachineIntegrity(storage: AccordbookStorage): Promise<number> {
  const [formulas, archive, versions] = await Promise.all([storage.formulas.list(), storage.archive.list(), storage.versions.listAll()])
  const validParents = new Set([...formulas, ...archive].map((formula) => formula.id))
  const orphans = versions.filter((version) => !validParents.has(version.parentFormulaId))
  await Promise.all(orphans.map((version) => storage.versions.delete(version.versionId)))
  return orphans.length
}
