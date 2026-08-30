# Accordbook

An open-source formula notebook for perfumers.

Built by a perfumer, for perfumers.

<img width="1790" height="1316" alt="accordbook-preview" src="https://github.com/user-attachments/assets/70c4f861-d3bb-4255-a610-60b64a2c4438" />

> **Private by default**  
> Your formulas stay on your device.

## v1.04 features

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
- English / Korean interface
- Desktop, tablet, and mobile-safe layouts

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

Accordbook v1.04 preserves local provenance and revision evidence for formula revisions, including optional Formula Origins.

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

Formulas, provenance records, revision history, reconstruction data, and fingerprints are kept in the browser/device storage used by Accordbook.

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

## Versioning

Public Accordbook versions use:

`v1.01` → `v1.02` → `v1.03` → `v1.04` → ...

The package version for Accordbook v1.04 is `1.0.4`.

## Try Accordbook

[Open Accordbook →](https://perfumerlee.github.io/accordbook/)
