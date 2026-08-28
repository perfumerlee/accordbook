import type { AccordbookSettings } from '../models/settings'
import type { StorageDatabase } from './database'

const SETTINGS_KEY = 'current'

export class SettingsRepository {
  constructor(private readonly database: StorageDatabase) {}

  get(): Promise<AccordbookSettings | undefined> { return this.database.get<AccordbookSettings>('settings', SETTINGS_KEY) }
  save(settings: AccordbookSettings): Promise<void> { return this.database.put('settings', SETTINGS_KEY, settings) }
}
