# Formula provenance

Accordbook v1.02 keeps provenance locally with each formula. Claimed Source is user-provided information; it is not proof of authorship. Integrity verification checks the stored content fingerprint and local revision hash chain.

The content fingerprint canonicalizes material rows using trimmed text, uppercase solvent tokens, numeric parts, and deterministic row ordering. Formula name, notes, IDs, dates, highlight state, and provenance metadata are excluded.

New formulas begin a local lineage. Duplicates retain the parent record and fingerprint while receiving a new Formula ID and record ID. This is tamper-evident, not tamper-proof: there is no digital signature, trusted timestamp, external registry, or legal authorship certification.
