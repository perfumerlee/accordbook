import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { forwardGuideDraft } from './guide-draft-proxy.mjs'

const guideIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function localGuideSourcePath(rootDir, guideId) {
  if (!guideIdPattern.test(guideId)) throw new Error('INVALID_GUIDE_ID')
  return resolve(rootDir, 'content', 'guide', `${guideId}.json`)
}

export async function syncPublishedGuideSourceToLocal({
  target,
  guideId,
  operatorKey,
  rootDir = process.cwd(),
  forward = forwardGuideDraft,
}) {
  if (!target) return { ok: false, code: 'NO_GUIDE_ENDPOINT' }
  if (!operatorKey) return { ok: false, code: 'NO_OPERATOR_KEY' }
  if (!guideIdPattern.test(String(guideId ?? ''))) return { ok: false, code: 'INVALID_GUIDE_ID' }

  const request = JSON.stringify({
    action: 'getPublishedGuide',
    guideId,
    operatorKey,
  })

  let result
  try {
    result = await forward(target, request)
  } catch {
    return { ok: false, code: 'PUBLISHED_SOURCE_FETCH_FAILED' }
  }

  if (!result || result.status !== 200) {
    return { ok: false, code: 'PUBLISHED_SOURCE_FETCH_FAILED' }
  }

  let payload
  try {
    payload = JSON.parse(result.body)
  } catch {
    return { ok: false, code: 'INVALID_PUBLISHED_SOURCE' }
  }

  const document = payload?.document
  if (
    !payload?.ok ||
    !document ||
    document.schemaVersion !== 1 ||
    document.guideId !== guideId ||
    document.slug !== guideId ||
    !Array.isArray(document.blocks)
  ) {
    return { ok: false, code: 'INVALID_PUBLISHED_SOURCE' }
  }

  const file = localGuideSourcePath(rootDir, guideId)
  try {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  } catch {
    return { ok: false, code: 'LOCAL_SOURCE_WRITE_FAILED' }
  }

  return {
    ok: true,
    relativePath: relative(rootDir, file).replaceAll('\\', '/'),
    publishedFingerprint:
      typeof payload.publishedFingerprint === 'string'
        ? payload.publishedFingerprint
        : undefined,
  }
}
