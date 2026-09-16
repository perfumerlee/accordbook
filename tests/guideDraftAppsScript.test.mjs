import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve('scripts/apps-script/guide-drafts')
const drafts = fs.readFileSync(path.join(root, 'GuideDrafts.gs'), 'utf8')
const schema = fs.readFileSync(path.join(root, 'GuideDraftSchema.gs'), 'utf8')

describe('Apps Script Draft v1/v2 storage compatibility', () => {
  it('accepts only known versions and requires a validated BASE for v2', () => {
    expect(schema).toContain("value.formatVersion !== 1 && value.formatVersion !== 2")
    expect(schema).toContain("value.formatVersion === 2")
    expect(schema).toContain('basePublishedDocument')
    expect(schema).toContain('validatePublishDocument_(value.basePublishedDocument)')
    expect(schema).toContain('validatePublishDocument_(value.document)')
  })

  it('preserves the selected envelope version and BASE during save', () => {
    expect(schema).toContain("body.formatVersion === 2 || Object.prototype.hasOwnProperty.call(body, 'basePublishedDocument')")
    expect(schema).toContain('candidate.basePublishedDocument = body.basePublishedDocument')
    expect(drafts).toContain('draftEnvelopeFromSave_(body,body.guideId,revision)')
    expect(drafts).toContain('JSON.stringify(d,null,2)')
  })

  it('keeps revision persistence before head advancement', () => {
    expect(drafts.indexOf("revisions_(folder).createFile('r'+String(revision)")).toBeLessThan(drafts.indexOf('const heads=folder.getFilesByName'))
  })

  it('does not activate v2 in the existing TypeScript save client', () => {
    const client = fs.readFileSync(path.resolve('src/services/guideDrafts.ts'), 'utf8')
    expect(client).toContain("formatVersion: 1")
  })

  it('keeps refresh authoritative and conflict-free persistence coherent', () => {
    const refresh = fs.readFileSync(path.join(root, 'GuideRefresh.gs'), 'utf8')
    expect(refresh).toContain("current.formatVersion !== 2")
    expect(refresh).toContain('current.basePublishedFingerprint !== body.expectedBasePublishedFingerprint')
    expect(refresh).toContain('readPublishedGuide_(body.guideId)')
    expect(refresh).toContain("status: 'already-current'")
    expect(refresh).toContain("status: 'conflicts'")
    expect(refresh).toContain('persistRefreshDraft_')
    expect(refresh).toContain('mergeGuideDocumentsServer_')
    expect(refresh).toContain('refreshEqual_(body.mergedDocument, canonical.document)')
    expect(refresh).toContain('basePublishedDocument: remote.document')
    expect(refresh).toContain('basePublishedFingerprint: remote.publishedFingerprint')
    expect(refresh).not.toContain('publishGithub_(\'post\', \'/git/blobs\'')
  })

  it('cannot accept client-suppressed conflicts or structurally valid arbitrary documents', () => {
    const refresh = fs.readFileSync(path.join(root, 'GuideRefresh.gs'), 'utf8')
    expect(refresh).toContain('if (canonical.conflicts.length)')
    expect(refresh).toContain("status: 'conflicts'")
    expect(refresh).toContain("code: 'INVALID_REFRESH_PROPOSAL'")
    expect(refresh).not.toContain('body.conflicts && body.conflicts.length')
  })

  it('includes the refresh merge implementation in the Guide Draft bundle exactly once', () => {
    const bundle = fs.readdirSync(root).filter(name => name.endsWith('.gs'))
    expect(bundle).toContain('GuideRefreshMerge.gs')
    expect(fs.existsSync(path.resolve('scripts/apps-script/GuideRefreshMerge.gs'))).toBe(false)
    const definitions = bundle
      .map(name => fs.readFileSync(path.join(root, name), 'utf8'))
      .join('\n')
      .match(/function mergeGuideDocumentsServer_\s*\(/g) ?? []
    expect(definitions).toHaveLength(1)
  })
})
