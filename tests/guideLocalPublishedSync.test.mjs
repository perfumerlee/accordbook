import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { syncPublishedGuideSourceToLocal } from '../scripts/guide-local-published-sync.mjs'

function publishedDocument() {
  return {
    schemaVersion: 1,
    guideId: 'time-machine',
    slug: 'time-machine',
    order: 3,
    metadata: { lastUpdated: '2026-09-18' },
    locales: {
      en: {
        status: 'PUBLISHED',
        title: 'Time Machine',
        subtitle: 'Version history',
        seo: { title: 'Time Machine', description: 'Version history' },
      },
    },
    blocks: [
      {
        blockId: 'timeline',
        type: 'screenshot',
        media: {
          figureId: 'timeline',
          presentation: { desktopScale: 0.4 },
          variants: {
            en: {
              desktop: {
                src: 'assets/time-machine/en/desktop/timeline.png',
                alt: 'Timeline',
                caption: 'Timeline',
                viewport: '1440x900',
              },
            },
          },
        },
      },
    ],
  }
}

describe('Guide local published-source mirror', () => {
  it('writes the authoritative published document to content/guide', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'accordbook-guide-sync-'))
    const document = publishedDocument()

    const result = await syncPublishedGuideSourceToLocal({
      target: 'https://example.invalid/exec',
      guideId: 'time-machine',
      operatorKey: 'test-key',
      rootDir,
      forward: async () => ({
        status: 200,
        body: JSON.stringify({
          ok: true,
          document,
          publishedFingerprint: 'a'.repeat(64),
        }),
      }),
    })

    expect(result.ok).toBe(true)
    const saved = JSON.parse(
      await readFile(
        join(rootDir, 'content', 'guide', 'time-machine.json'),
        'utf8',
      ),
    )
    expect(saved.blocks[0].media.presentation.desktopScale).toBe(0.4)
  })

  it('does not write an invalid or mismatched published document', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'accordbook-guide-sync-'))

    const result = await syncPublishedGuideSourceToLocal({
      target: 'https://example.invalid/exec',
      guideId: 'time-machine',
      operatorKey: 'test-key',
      rootDir,
      forward: async () => ({
        status: 200,
        body: JSON.stringify({
          ok: true,
          document: { ...publishedDocument(), guideId: 'faq' },
        }),
      }),
    })

    expect(result).toEqual({ ok: false, code: 'INVALID_PUBLISHED_SOURCE' })
  })
})
