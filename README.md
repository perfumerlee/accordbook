# Accordbook

An open-source formula notebook for perfumers.

Built by a perfumer, for perfumers.

<img width="1690" height="1311" alt="아비 (222)" src="https://github.com/user-attachments/assets/b0e38b49-21e3-4ce6-b499-183f59d1057f" />

> **Private by default**  
> Your formulas stay on your device.

## v1.05 features

- 1,000-part formula notebook with a 10.00 g reference batch
- Formula ID and prefix management
- Formula editing with Parts, Material, CAS / Ref., and Notes
- Dilution handling and direct solvent recognition
- Concentrate, solvent, batch, and completion calculations
- Local autosave with IndexedDB and session fallback
- Formula duplication, material reset, archive, restore, and permanent delete
- Standalone Formula File export for sharing individual formulas
- Safe Formula import that adds formulas without replacing the existing Notebook
- Notebook Backup and Restore backup for full Notebook recovery
- Formula provenance with source, lineage, revision history, and SHA-256 fingerprints
- Local revision integrity verification with hash-chain records
- Formula Time Machine for reconstructing supported past formula states
- Read-only viewing of reconstructable revisions
- Comparison between past revisions and the current formula
- Restoration of past formula states as new revisions without rewriting history
- Current-formula browser printing
- Header Quick Print with a compact printer action
- Formula Origins with Original, Inspired by, Adapted from, and Unknown states
- Origin details with optional creator, note, and validated HTTP/HTTPS link fields
- Formula Actions help popover for Dilution, Highlight, and Remove controls
- CAS Check for reviewing all materials in the current formula at once
- Safe CAS autofill for exact, single-candidate matches
- Existing user-entered CAS / Ref. values are never overwritten automatically
- CAS check results with total, autofilled, verified, review-required, and unresolved counts
- Visual highlighting for unresolved empty CAS fields after a CAS check
- Local CAS resolver data with no live external lookup required during normal use
- English / Korean interface
- Desktop, tablet, and mobile-safe layouts

## CAS Check

Accordbook v1.05 adds a local CAS checking assistant for reviewing material information in the current formula.

CAS Check scans the materials on the open page and fills an empty CAS / Ref. field only when a match is considered sufficiently certain.

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

Unresolved empty CAS fields can also be highlighted after the check so that materials requiring manual review are easier to locate.

The CAS resolver is an assistance tool and should not replace supplier documentation, SDS data, regulatory references, or other authoritative sources.

## Formula sharing

Accordbook uses a separate Formula File format for sharing individual formulas.

Export the currently open formula as an `.accordbook` file and share it with another Accordbook user. Legacy `.json` Formula Files remain supported for import. When imported, the formula is added as a new entry in the recipient's Notebook without changing existing formulas or archived items.

A new local Formula ID is generated automatically when a Formula File is imported.

Formula Files and Notebook Backups serve different purposes:

- **Formula File** — share or import a single formula
- **Notebook Backup** — back up or restore the entire Notebook

Use **Import formula** for shared formulas.  
Use **Restore backup** only when you want to restore the entire Notebook from a backup.

## Formula provenance

Accordbook can preserve provenance information alongside a formula.

This includes formula lineage, revision history, content fingerprints, and local integrity records.

Formula composition is normalized using a versioned canonicalization process and fingerprinted with SHA-256.

Source information such as origin or author is treated as a recorded claim rather than proof of authorship.

Provenance is designed to preserve evidence of how a formula has changed without exposing the formula to an external service.

## Formula Time Machine

Accordbook preserves local provenance and revision evidence for formula revisions, including optional Formula Origins.

Origin records are local claims. `Not specified` means no origin has been recorded, while `Unknown` means the user intentionally recorded that the starting point is uncertain. Origin metadata does not affect the formula content fingerprint.

When sufficient reconstruction data is available, a past formula state can be rebuilt from checkpoints and recorded revision changes.

The reconstructed formula is fingerprinted again and checked against the fingerprint stored with that revision.

Past formula states can be:

- viewed without changing the current formula
- compared with the current formula
- restored as a new revision

Restoring a past revision never deletes later history.

For example:

`Revision #18 → Restore → Revision #31`

The formula state from Revision #18 becomes the new current state while Revisions #19–#30 remain preserved.

Older provenance records that do not contain reconstruction data remain valid evidence but may not be reconstructable.

## Privacy and storage

No account or backend is required for formula storage.

Formulas, provenance records, revision history, reconstruction data, fingerprints, and CAS check data are kept in the browser/device storage used by Accordbook.

CAS checking uses local resolver data during normal use and does not require a live lookup against an external fragrance database.

Formula sharing and backup files are created locally and downloaded by the user.

Keep a Notebook Backup for portability and recovery.

Accordbook does not send formula names, materials, CAS / Ref. values, Parts, Notes, dilution details, fingerprints, provenance records, or Formula File contents to analytics.

## Formula rules

- 1,000 parts = 10.00 g
- 1 part = 0.01 g
- A diluted material keeps its surface notation, such as `@10% in ALC`
- Direct solvent rows and dilution carriers are included in solvent calculations

## Development

```bash
npm install
npm test
npm run build
npm run dev
```

## Try Accordbook

[Open Accordbook →](https://perfumerlee.github.io/accordbook/)
