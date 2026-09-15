# Phase 8D atomic image publication

Repository implementation only. No deployment or live publication was performed.

Deploy the existing Web App in Phase 8E with **all four** source files:
`GuideDrafts.gs`, `GuidePublisher.gs`, `GuidePublishAssets.gs`, and
`GuidePublishValidation.gs`. The local proxy checks `prepareAssetPublish` protocol
version 1 before it can send an asset publication to the server.

## Limits

- File validation: 5,242,880 bytes (5 MiB).
- Sum of supplied images: 5,000,000 bytes, at most 64 assets.
- Exact serialized Apps Script request: 6,779,294 UTF-8 bytes.
- Thus a valid staged file above 5,000,000 bytes cannot be published in v0.01.
- Draft document protection remains 900,000 JSON characters.

These separate limits conservatively fit the measured single-image request.
They are not evidence that the complete GitHub transaction fits the Apps Script
runtime/time limit; Phase 8E must measure the complete workflow. No chunking.

## Authority and transaction

The proxy reads authenticated private Draft HEAD, verifies its revision, and
reads only referenced, known local staging entries. Browser intent carries no
document, filesystem path, or image bytes. Apps Script independently reloads
HEAD and verifies revision, document validation, paths, completeness, MIME,
dimensions, size, SHA-256, and existing-content conflicts before any Git POST.
All Git reads are pinned to one parent commit. One tree includes JSON and all
new blobs, one commit uses that parent, and one non-force ref update publishes.
The ref is rechecked before PATCH; Git non-fast-forward protection remains.

## After publication

Successful server receipts mark matching manifest entries with `publishedCommit`.
Files are retained, preserving local preview and historical Draft references.
The local published catalog includes verified marked entries. Receipt write
failure is a success warning and never causes a second GitHub request.
Draft rebase failure retains the existing published-with-warning contract.

Do not automatically retry uncertain publish responses. A network interruption
can hide a successful ref update; inspect main and Draft HEAD before retrying.
No background deletion, Drive asset storage, or GitHub token in the local proxy.

## Runtime validation equivalence

The Apps Script image inspector implements the existing Phase 3 header/dimension
contract (PNG IHDR, WebP VP8/VP8L/VP8X), with additional chunk bounds checks.
It is not a full image decoder. `GuidePublishValidation.gs` is a small server
equivalent of `guideContracts.ts`; keep both in sync when the schema evolves.
