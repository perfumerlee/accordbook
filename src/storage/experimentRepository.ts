import { validateExperiment } from '../services/experimentLifecycle'
import type { Experiment } from '../models/experiment'
import type { StorageDatabase } from './database'

const clone = <T>(value: T): T => structuredClone(value)

export class ExperimentRepository {
  constructor(private readonly database: StorageDatabase) {}
  save(experiment: Experiment): Promise<void> { validateExperiment(experiment); return this.database.put('experiments', experiment.experimentId, clone(experiment)) }
  async get(experimentId: string): Promise<Experiment | undefined> { const value = await this.database.get<Experiment>('experiments', experimentId); return value ? clone(value) : undefined }
  async list(): Promise<Experiment[]> { return (await this.database.getAll<Experiment>('experiments')).map(clone) }
  async listByParentFormulaId(parentFormulaId: string): Promise<Experiment[]> { return (await this.list()).filter((item) => item.parentFormulaId === parentFormulaId) }
  delete(experimentId: string): Promise<void> { return this.database.delete('experiments', experimentId) }
  async deleteByParentFormulaId(parentFormulaId: string): Promise<void> { for (const item of await this.listByParentFormulaId(parentFormulaId)) await this.delete(item.experimentId) }
}
