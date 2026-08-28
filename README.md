# Accordbook

An open-source formula notebook for perfumers.

Built by a perfumer, for perfumers.

> **Private by default**  
> Your formulas stay on your device.

## v1.0 features

- 1,000-part formula notebook with a 10.00 g reference batch
- Formula ID and prefix management
- Formula editing with material rows, Parts, Material, CAS / Ref., and Notes
- Dilution handling and direct solvent recognition
- Concentrate, solvent, batch, and completion calculations
- Local autosave with IndexedDB and session fallback
- Formula duplication, material reset, archive, restore, and permanent delete
- JSON backup and replace-import
- Current-formula browser printing
- English / Korean interface
- Desktop, tablet, and mobile-safe layouts

## Privacy and storage

No account or backend is required for formula storage. Formulas are kept in the browser/device storage used by Accordbook. Keep a JSON backup for portability and recovery.

## Formula rules

- 1,000 parts = 10.00 g
- 1 part = 0.01 g
- A diluted material keeps its surface notation, such as `@10% in ALC`.

## Development

```bash
npm install
npm test
npm run build
npm run dev
```

## Try Accordbook

[Open Accordbook →](https://perfumerlee.github.io/accordbook/)
