# Accordbook

An open-source formula notebook for perfumers.

Built by a perfumer, for perfumers.

<img width="1790" height="1316" alt="accordbook-preview" src="https://github.com/user-attachments/assets/70c4f861-d3bb-4255-a610-60b64a2c4438" />

> **Private by default**  
> Your formulas stay on your device.

## v1.01 features

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
- Validation that keeps Formula Files and Notebook Backups clearly separated
- Current-formula browser printing
- English / Korean interface
- Desktop, tablet, and mobile-safe layouts

## Formula sharing

Accordbook v1.01 introduces a separate Formula File format for sharing individual formulas.

Export the currently open formula as a JSON file and share it with another Accordbook user. When imported, the formula is added as a new entry in the recipient's Notebook without changing existing formulas or archived items.

A new local Formula ID is generated automatically when a Formula File is imported.

Formula Files and Notebook Backups serve different purposes:

- **Formula File** — share or import a single formula
- **Notebook Backup** — back up or restore the entire Notebook

Use **Import formula** for shared formulas.  
Use **Restore backup** only when you want to restore the entire Notebook from a backup.

## Privacy and storage

No account or backend is required for formula storage.

Formulas are kept in the browser/device storage used by Accordbook. Formula sharing and backup files are created locally and downloaded by the user.

Keep a Notebook Backup for portability and recovery.

Accordbook does not send formula names, materials, CAS / Ref. values, Parts, Notes, dilution details, or Formula File contents to analytics.

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

`v1.01` → `v1.02` → `v1.03` → ...

The package version for Accordbook v1.01 is `1.0.1`.

## Try Accordbook

[Open Accordbook →](https://perfumerlee.github.io/accordbook/)
