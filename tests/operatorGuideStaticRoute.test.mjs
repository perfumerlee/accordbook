import { describe, expect, it } from 'vitest'
import { operatorNoIndexShell, operatorRedirectShell } from '../scripts/generate-pages-routes.mjs'

const shell = '<html><head><title>Accordbook</title></head><body><div id="root"></div></body></html>'

describe('operator Guide static routes', () => {
  it('keeps operator pages out of search indexes', () => {
    expect(operatorNoIndexShell(shell)).toContain('noindex, nofollow')
  })

  it('redirects the common oparator typo to the canonical operator Guide route', () => {
    const result = operatorRedirectShell(shell)

    expect(result).toContain('href="/operator/guide/"')
    expect(result).toContain('location.replace("/operator/guide/" + location.search + location.hash)')
    expect(result).toContain('noindex, nofollow')
  })
})
