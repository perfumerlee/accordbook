# Formula provenance

Accordbook v1.03 keeps provenance locally with each formula. Claimed Source is user-provided information; it is not proof of authorship. Integrity verification checks the stored content fingerprint and local revision hash chain.

The content fingerprint canonicalizes material rows using trimmed text, uppercase solvent tokens, numeric parts, and deterministic row ordering. Formula name, notes, IDs, dates, highlight state, and provenance metadata are excluded.

New formulas begin a local lineage. Duplicates retain the parent record and fingerprint while receiving a new Formula ID and record ID. This is tamper-evident, not tamper-proof: there is no digital signature, trusted timestamp, external registry, or legal authorship certification.

## Revision Hash Payload v1

`revisionHashPayloadVersion: 1` describes the historical payload used by the production verifier. The version metadata is descriptive and is not included in the payload, so adding it does not change existing hashes.

The hash input is the UTF-8 encoding of this `JSON.stringify` object, in exactly this key order:

```json
{"schemaVersion":1,"recordId":"...","revisionId":"...","sequence":2,"eventType":"modified","recordedAt":"2026-08-29T12:00:00.000Z","contentFingerprint":"...","previousRevisionHash":"..."}
```

Included fields are `schemaVersion`, `recordId`, `revisionId`, `sequence`, `eventType`, `recordedAt`, `contentFingerprint`, and `previousRevisionHash`. `revisionHashPayloadVersion` is excluded from the hash input, as are the stored `revisionHash` and all other Formula, provenance, UI, and export metadata. `sequence` is the JSON number; `eventType` and `contentFingerprint` are strings; `recordedAt` is the stored timestamp string; and `previousRevisionHash` is the prior hash string or JSON `null` for the first revision. No additional string normalization is applied. The resulting UTF-8 bytes are hashed with SHA-256 and represented as lowercase hexadecimal.

Missing `revisionHashPayloadVersion` means version 1 for legacy evidence. Explicit version 1 uses the same verifier. Unsupported versions are not verified and never fall back to version 1. If the hash payload meaning changes, a new version must be added without changing or deleting version 1.

The deterministic reference is [revision-hash-payload-v1.json](test-vectors/revision-hash-payload-v1.json). Its expected value is an immutable historical fixture.
