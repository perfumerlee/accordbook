# Accordbook Formula Drop Admin — Phase 1

This standalone Apps Script project initializes the separate operational workbook for Formula Drops. It does not contain a Web App UI or `doGet`/`doPost` endpoint yet.

## Operator setup

1. Create a new Google Spreadsheet named `Accordbook Formula Drop Operations`.
2. Do not use the existing spreadsheet that contains `PaidFormulaLicenses` or `PaidFormulaConfig`.
3. Copy the new Spreadsheet ID.
4. Create a new standalone Apps Script project named `Accordbook Formula Drop Admin`.
5. Add `FormulaDropAdmin.gs` to that project.
6. Add this Script Property:

```text
FORMULA_DROP_SPREADSHEET_ID=<spreadsheet-id>
```

7. Set the Apps Script project timezone to `Asia/Seoul`.
8. Set the Spreadsheet timezone to `Asia/Seoul` under Spreadsheet → Settings → Time zone.
9. Run `initializeFormulaDropSheets()` and complete Google authorization.
10. Verify that the workbook contains exactly these operational sheets:

```text
FormulaDrops
FormulaDropEvents
```

11. Verify header Notes, frozen row 1, filters, validation, and Plain Text handling for `publicAccessLast4` and `publicAccessPin`.
12. Verify that no `PaidFormulaLicenses` data exists in this workbook.

The initializer is fail-safe for non-empty sheets with mismatched headers. It does not rewrite, move, or delete production data. Admin Web App deployment instructions belong to Phase 6.
