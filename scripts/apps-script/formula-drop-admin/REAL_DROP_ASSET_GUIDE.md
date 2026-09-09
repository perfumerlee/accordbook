# Real Formula Drop Asset Guide

This guide prepares a real encrypted Licensed `.accordbook` asset without changing the Licensed Formula security model. It applies to `DROP-2026-001` and future Drops.

## 1. Prepare the Drop safely

While replacing a test asset, keep the FormulaDrops row in `DRAFT`. Do not leave it `ACTIVE` while the file, package ID, or campaign PIN is being replaced.

## 2. Create the campaign License through the existing Export flow

Use Accordbook's existing Licensed Formula Export action. The current UI generates the PIN; the operator does not choose it manually. The exported package creates a UUID v4 `packageId` inside its outer JSON package and registers the same ID in `PaidFormulaLicenses`.

For a public campaign, use a deliberately non-personal campaign identity. The current validation requires a Korean 010 phone number in `010-####-####` form and a non-empty buyer name of at most 100 characters. A documented test convention is `accordbook` and `010-0000-0000`; confirm it is not a real person's number before use. The last four digits are then `0000`. Keep the actual generated six-digit PIN shown by Export; do not replace it with an example PIN.

## 3. Inspect the selected package

After Export registers the License and downloads the file, inspect it without decrypting it:

```powershell
npm run formula-drop:inspect -- "C:\path\to\exported-file.accordbook"
```

The helper prints only packageId, format, version, and filename. It does not decrypt, print Formula contents, print credentials, or contact Google Sheets.

## 4. Verify the package ID invariant

Stop if these are not identical:

```text
A = packageId printed by the inspector
B = packageId in PaidFormulaLicenses
C = FormulaDrops.licenseId

A === B === C
```

`FormulaDrops.licenseId` is only a foreign reference. Do not copy buyerName, phone, PIN verifier, License status, failedAttempts, or lockedUntil into FormulaDrops.

Each `licenseId` must be unique across FormulaDrops. Do not attach one Licensed package to multiple Drops; the public import-resolution API rejects duplicate mappings as ambiguous.

## 5. Host the encrypted package

For the current Vite/GitHub Pages deployment, the minimal stable convention is:

```text
public/formula-drops/2026-001/DROP-2026-001.accordbook
```

After Pages deployment, the expected URL is:

```text
https://accordbook.org/formula-drops/2026-001/DROP-2026-001.accordbook
```

Vite copies files in `public/` unchanged to `dist/`, and the existing Pages workflow uploads `dist/`. The `.accordbook` file is encrypted JSON; its direct URL is not a secret. Anyone with the URL may bypass Drop-page download tracking, but the existing Licensed Formula verification is still required to import it.

Rename only the outer file after Export if desired. The package filename is not used by the current parser or decryption logic; the packageId remains inside the file. Prefer the stable campaign filename above and never modify the package JSON contents.

Do not commit an arbitrary or real package automatically in this phase.

## 6. Replace the FormulaDrops values

With the row still `DRAFT`, update only after the real file and registry record are confirmed:

```text
fileName            DROP-2026-001.accordbook
fileUrl             https://accordbook.org/formula-drops/2026-001/DROP-2026-001.accordbook
licenseId           <the real packageId>
publicAccessName    accordbook
publicAccessLast4  0000
publicAccessPin     <the actual generated campaign PIN>
```

Keep the two access fields as Plain Text so leading zeroes survive. The public values must be exactly the campaign credentials used during Export, but they must never be copied from a private customer's License.

## 7. Activate and verify

1. Confirm the encrypted file URL retrieves the file directly.
2. Confirm `A === B === C`.
3. Confirm the actual PIN and `0000` match the campaign License.
4. Set valid `startAt` and `expiresAt`.
5. Change the Drop from `DRAFT` to `ACTIVE` only when ready.
6. Open `/drop/2026-001?source=manual_test`.
7. Download once and verify the downloaded file is the real `.accordbook` package.
8. Do not implement or expect Phase 5 import events in this workflow.
