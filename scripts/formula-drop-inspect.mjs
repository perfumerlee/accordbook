import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const PACKAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const decode64 = value => Uint8Array.from(Buffer.from(value, 'base64'))

export function inspectPaidFormulaPackageText(text, fileName = 'package.accordbook') {
  if (typeof text !== 'string' || text.length > 16_000_000) throw new Error('Invalid or oversized package')
  let file
  try { file = JSON.parse(text) } catch { throw new Error('Invalid licensed package JSON') }
  if (!file || file.type !== 'accordbook-paid-package' || file.formatVersion !== 1 || file.accessMode !== 'offline-credentials-v1' || !PACKAGE_ID.test(file.packageId)
    || file.kdf?.algorithm !== 'PBKDF2' || file.kdf.hash !== 'SHA-256' || file.kdf.iterations !== 600000
    || file.encryption?.algorithm !== 'AES-GCM' || file.encryption.tagLength !== 128
    || typeof file.kdf.salt !== 'string' || typeof file.encryption.iv !== 'string' || typeof file.ciphertext !== 'string'
    || decode64(file.kdf.salt).length !== 16 || decode64(file.encryption.iv).length !== 12 || decode64(file.ciphertext).length < 16) throw new Error('Invalid licensed package structure')
  return { packageId: file.packageId, formatVersion: file.formatVersion, accessMode: file.accessMode, fileName }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const path = process.argv[2]
  if (!path) { console.error('Usage: npm run formula-drop:inspect -- <path-to-.accordbook>'); process.exitCode = 1 }
  else try { const result = inspectPaidFormulaPackageText(await readFile(path, 'utf8'), basename(path)); console.log('VALID LICENSED FORMULA PACKAGE'); console.log(`packageId: ${result.packageId}`); console.log(`format: ${result.accessMode}`); console.log(`version: ${result.formatVersion}`); console.log(`file: ${result.fileName}`) } catch (error) { console.error(error instanceof Error ? error.message : 'Invalid licensed package'); process.exitCode = 1 }
}
