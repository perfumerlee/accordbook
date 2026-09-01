# Accordbook

**An open-source formula notebook for perfumers.**

Built by a perfumer, for perfumers.

> **Private by default**  
> Your formulas stay on your device.

Accordbook is a local-first formula notebook designed for perfumers to write, calculate, revise, organize, and share fragrance formulas without requiring an account or backend.

---

## Try Accordbook

**[Open Accordbook.org →](https://accordbook.org/)**

---

## Preview

### Desktop

<!-- DESKTOP SCREENSHOT -->
<img width="1672" height="941" alt="accordbook_readme_main1" src="https://github.com/user-attachments/assets/0e841547-f4b3-4be3-8f60-a6c5583a798b" />

### Smartphone

<!-- SMARTPHONE SCREENSHOT -->
<img width="1672" height="941" alt="accordbook_readme_main2" src="https://github.com/user-attachments/assets/0ad68896-ae2e-4514-b6a5-6c84fd47bccd" />


---

## v1.05

Accordbook v1.05 expands the formula notebook with local CAS checking, Formula File sharing, provenance and revision tools, Formula Origins, and improved responsive layouts for desktop and mobile use.

### Formula notebook

- 1,000-part formula notebook with a 10.00 g reference batch
- Formula ID and customizable prefix management
- Formula editing with Parts, Material, CAS / Ref., and Notes
- Dilution handling and direct solvent recognition
- Automatic concentrate, solvent, batch, shortage, and completion calculations
- Formula duplication and material reset
- Archive, restore, and permanent delete
- Local autosave using IndexedDB with session fallback

### Formula files and backup

- Standalone Formula File export for sharing individual formulas
- Official Formula File extension: `.accordbook`
- Legacy `.json` Formula Files remain supported for import
- Safe Formula import that adds formulas without replacing the existing Notebook
- Automatic local Formula ID generation when importing a Formula File
- Notebook Backup and Restore for full Notebook recovery
- Formula Files and Notebook Backups remain separate workflows

### Formula provenance

- Formula source and lineage records
- Revision history
- SHA-256 content fingerprints
- Local revision integrity verification
- Hash-chain revision records
- Reconstruction support for compatible revisions
- Formula Time Machine
- Read-only viewing of reconstructable past revisions
- Comparison between a past revision and the current formula
- Restoration of past formula states as new revisions without rewriting history

### Formula Origins

Formula Origins record where a formula began while keeping user claims separate from verified system facts.

Available states include:

- Original
- Inspired by
- Adapted from
- Unknown

Optional Origin details can include:

- Source / Reference
- Creator / Author
- Link
- Note

Origin metadata does not affect the formula content fingerprint.

### CAS Check

- Review all materials in the current formula at once
- Safe CAS autofill for exact, single-candidate matches
- Existing user-entered CAS / Ref. values are never overwritten automatically
- Result summary with total, autofilled, verified, review-required, and unresolved counts
- Visual highlighting for unresolved empty CAS fields
- Local CAS resolver data
- No live external fragrance-database lookup required during normal use

### Interface

- English / Korean interface
- Desktop, tablet, and smartphone-safe layouts
- Current-formula browser printing
- Header Quick Print on supported layouts
- Formula Actions help
- Material highlighting
- Dedicated mobile formula workspace
- Responsive material rows
- Mobile Formula and Material actions
- Improved Notebook and Archive navigation for longer lists

---

## CAS Check

Accordbook v1.05 includes a local CAS checking assistant for reviewing material information in the currently open formula.

CAS Check fills an empty CAS / Ref. field only when the local resolver produces a sufficiently certain result.

Automatic entry requires:

- an existing material name
- an empty CAS / Ref. field
- an exact normalized material-name match
- exactly one resolver candidate
- a valid CAS number for that candidate

Accordbook does not automatically apply ambiguous, fuzzy, invalid, or missing matches.

Existing user-entered CAS / Ref. values are preserved and are never overwritten automatically.

After a check, Accordbook summarizes the result using categories such as:

- **Total materials**
- **Autofilled**
- **Verified**
- **Needs review**
- **Not found**

Unresolved empty CAS fields can be highlighted so materials requiring manual review are easier to locate.

> CAS Check is an assistance tool. Supplier documentation, SDS information, regulatory references, and other authoritative sources should remain the primary references for material identification.

---

## Formula sharing

Accordbook uses a dedicated Formula File for sharing individual formulas.

The official extension is:

```text
.accordbook
```

Formula Files remain JSON-based internally while using an Accordbook-specific file identity.

A Formula File can be exported from the currently open formula and imported into another Accordbook Notebook.

When imported:

- the Formula is added as a new Notebook entry
- existing formulas are not replaced
- archived formulas are not changed
- a new local Formula ID is generated automatically

Legacy `.json` Formula Files remain supported for import.

### Formula File vs Notebook Backup

These two formats serve different purposes.

**Formula File**

- shares one formula
- uses `.accordbook`
- imports additively
- does not replace the Notebook

**Notebook Backup**

- preserves the full Notebook
- is used for recovery or migration
- restores Notebook-level data

Use **Import formula** for shared formulas.

Use **Restore backup** only when restoring the complete Notebook.

---

## Formula provenance

Accordbook can preserve provenance information alongside a formula.

This includes:

- formula lineage
- revision history
- content fingerprints
- revision integrity records
- reconstruction information where available

Formula composition is normalized through a versioned canonicalization process and fingerprinted using SHA-256.

Source information such as Origin or Author is treated as a recorded claim rather than proof of authorship.

The provenance system is designed to preserve evidence of how a formula changed without requiring the formula itself to be uploaded to an external service.

---

## Formula Time Machine

Accordbook can reconstruct supported past formula states from locally recorded revision evidence.

When sufficient reconstruction data exists, a historical formula state can be rebuilt and fingerprinted again.

The reconstructed fingerprint is compared with the fingerprint recorded for that revision.

Past formula states can be:

- viewed without changing the current formula
- compared with the current formula
- restored as a new revision

Restoring a historical state never deletes later history.

For example:

```text
Revision #18
      ↓ Restore
Revision #31
```

The formula state from Revision #18 becomes the new current state as Revision #31.

Revisions #19–#30 remain preserved.

Older provenance records without reconstruction data remain valid evidence records but may not be reconstructable.

---

## Privacy and storage

Accordbook is **private by default**.

No account or backend is required for normal formula storage.

The following information is kept in the browser/device storage used by Accordbook:

- formulas
- material data
- Notes
- Formula Origins
- provenance records
- revision history
- reconstruction data
- fingerprints
- local CAS resolver results

CAS Check uses local resolver data during normal use and does not require sending formula materials to a live external fragrance database.

Formula sharing files and Notebook Backups are generated locally and downloaded by the user.

Accordbook does not send the following formula content to analytics:

- Formula titles
- Material names
- CAS / Ref. values
- Parts
- Notes
- dilution details
- fingerprints
- provenance records
- Formula File contents

For portability and recovery, keeping a recent Notebook Backup is recommended.

---

## Formula rules

Accordbook uses a simple 1,000-parts system.

- **1,000 parts = 10.00 g**
- **1 part = 0.01 g**
- Percentage is derived from Parts
- Diluted materials retain surface notation such as `@10% in ALC`
- Direct solvent rows are included in solvent calculations
- Dilution carriers are included in solvent calculations

Common solvent tokens include:

- ALC
- DPG
- IPM
- TEC

---

## Language

Accordbook supports:

- English
- Korean

Only system interface text is translated.

User-entered formula content is never automatically translated.

This includes:

- Formula titles
- Material names
- CAS / Ref. values
- Notes
- Source / Reference values
- Creator / Author names
- Links
- Origin Notes
- user-entered solvent text

Technical notation such as `PARTS`, `CAS / REF.`, `DIL`, `ALC`, `DPG`, `IPM`, and `TEC` can remain unchanged across interface languages.

---

## Technical stack

- React
- TypeScript
- Vite
- IndexedDB
- Vitest

Accordbook runs entirely in the browser for normal use.

---

## Evidence specification

Accordbook v1.05 preserves the existing evidence specification.

- **Canonicalization v1**
- **Revision Hash Payload v1**

Existing content fingerprints and revision histories remain compatible.

The provenance system is designed to be **tamper-evident**, not tamper-proof.

Accordbook does not claim to certify:

- original authorship
- copyright ownership
- formula authenticity
- trusted timestamps

Those require separate trust layers such as digital signatures, trusted timestamping, or independent verification.

---

## Development

```bash
npm install
npm test
npm run build
npm run dev
```

---

## License

Accordbook is open source under the **MIT License**.

---

**Everything starts with the fundamentals.**
