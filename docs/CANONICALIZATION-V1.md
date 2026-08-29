# Canonicalization v1

This is the frozen historical specification used by Accordbook's SHA-256 content fingerprint. Do not change it; a future rule change requires a new canonicalization version.

## Rules

- Each row is represented, in insertion order, as `{material, cas, parts, dilution}`.
- Included composition data is trimmed material, trimmed CAS/Ref., numeric parts (or `null`), and dilution presence with numeric percent and a trimmed, uppercased solvent token.
- Formula IDs, internal/row IDs, name, notes, highlight state, dates, archive/provenance/UI state and active selection are excluded. Dilution `enabled` is not separately serialized; presence is represented by the object or `null`.
- Strings use `trim()`, normalize CRLF/CR to LF, preserve case except solvent, and use `''` for missing CAS.
- Rows are sorted by their `JSON.stringify` representation using `localeCompare`; duplicates remain.
- The result is serialized with `JSON.stringify` using the shown object insertion order, encoded as UTF-8 by `TextEncoder`, and hashed with SHA-256.
- This specification and its vectors are immutable fixtures. Unsupported future rules must use a new version.

Official vectors: [canonicalization-v1.json](test-vectors/canonicalization-v1.json).
