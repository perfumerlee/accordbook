# Permanent Formula Drop archive

A published `/drop/YYYY-NNN` URL is permanent. Never delete/reuse its metadata
because downloads expire. The backend continues to enforce download eligibility.

## Publishing

1. Approve the public content in the existing publishing workflow.
2. Add `public/formula-drops/YYYY-NNN/drop.json` with `slug`, `title`, and
   `description`. Optional: `subtitle`, authored `summary`, `publishedAt`,
   `updatedAt`, `expiresAt` (ISO timestamps). The directory must match the slug.
3. Use the existing `FORMULA COMPOSITION` description and separator convention.
   Build and React share its parser. Do not copy a second material list.
4. Optionally add `og-source.png` in the same directory.
5. Run `npm run build`; review the HTML and PNG in `dist`, then owner deploys.

The build reads only repository data, never Apps Script. Every dated public
directory must contain metadata; missing/duplicate/invalid metadata fails the
build. Unknown fields fail validation, including credentials and private data.
Review prose manually: no validator can reliably distinguish a secret embedded
inside otherwise valid public text. Never include PIN, access name, last4, file
URL, license ID, payload, private parts/CAS, or unpublished information.

`2026-001/drop.json` was migrated verbatim from the already observed public DTO
in the development snapshot. Publication/author dates were not invented.

## Rendering and availability

The static route has real body content, meta, JSON-LD, and root-relative assets.
React uses createRoot (not hydration), replacing this body without duplication.
Live data remains the operational authority. If a known record is missing or
the API fails, its public archive is retained, with downloads unavailable and
an explanatory message. Unknown routes keep existing error behavior. The index
merges archived records so old pages remain linked. Live responses take precedence;
update archive JSON whenever public editorial content changes to avoid stale SEO.

Static copy states the recorded download period without claiming ACTIVE forever.
Neither sitemap nor image generation filters out expired records. No fake lastmod.
Repo-known routes return a static index document (hosting may add a trailing slash);
canonical URLs omit the slash. API-only routes still use the existing 404 fallback.

## Social image contract / Admin v0.02

No `og-source.png`: AUTO. Its presence: CUSTOM. Final output is always
`dist/formula-drops/YYYY-NNN/og.png`, PNG 1200 × 630. Custom images must be single
PNG, at least 600 × 315, at most 10 MB and 40 million pixels. EXIF orientation
is applied, then center cover-crop without distortion. Corrupt custom files fail
the build rather than silently using AUTO. Source metadata is stripped.

AUTO uses the OFL-licensed Libre Baskerville font from its installed Fontsource
package; opentype.js converts glyphs to paths and Sharp rasterizes those paths.
No OS font or external fetch is used during build. Unsupported glyphs or text
too long to fit legibly fail clearly; supply CUSTOM in that case. Page fonts
are unchanged. The image excludes transient availability/status.

Future Admin AUTO/CUSTOM UI can create/replace/remove `og-source.png` alongside
the snapshot. No upload UI or GitHub automation is implemented here. Platforms
cache stable OG URLs; replacement cache invalidation belongs to that later phase.

Public robots rules allow crawling, including OAI-SearchBot; this does not
guarantee indexing/citation. Admin Apps Script access restrictions are separate.
The Pages workflow uploads all of dist, including HTML, PNG, sitemap and robots.
