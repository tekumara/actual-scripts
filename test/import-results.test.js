import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImportSummaryTable,
  buildPreviewMatchesTable,
  renderImportResult,
} from "../src/import-results.js";

const account = { id: "acct-602", name: "St George 602" };

const result = {
  errors: [{ message: "Duplicate imported_id" }],
  added: ["txn-1", "txn-2"],
  updated: ["txn-3"],
  updatedPreview: [
    {
      transaction: {
        date: "2025-10-17",
        imported_payee: "Hellofresh",
        amount: -8399,
      },
      ignored: true,
    },
    {
      transaction: {
        date: "2025-10-18",
        imported_payee: "Xero Salary",
        amount: 1449956,
      },
      existing: { id: "existing-1" },
    },
  ],
};

test("buildImportSummaryTable reports requested import counts", () => {
  const table = buildImportSummaryTable({
    account,
    mapped: 12,
    dryRun: true,
    result,
  });

  assert.equal(table.title, "Import preview");
  assert.equal(table.subtitle, "St George 602 (acct-602)");
  assert.deepEqual(
    table.rows.map((row) => row.cells),
    [
      ["Mapped transactions", "12"],
      ["Added transactions", "2"],
      ["Errors", "1"],
      ["Updated", "1"],
      ["Preview matches", "2"],
    ],
  );
});

test("buildPreviewMatchesTable projects preview matches into table rows", () => {
  const table = buildPreviewMatchesTable(result);

  assert.equal(table.title, "Preview matches");
  assert.deepEqual(
    table.rows.map((row) => row.cells),
    [
      ["2025-10-17", "Hellofresh", "-83.99", "true"],
      ["2025-10-18", "Xero Salary", "14,499.56", "false"],
    ],
  );
});

test("renderImportResult includes summary, preview table, and error messages", () => {
  const rendered = renderImportResult({
    account,
    mapped: 12,
    dryRun: false,
    result,
  });

  assert.match(rendered, /Import result/);
  assert.match(rendered, /Mapped transactions/);
  assert.match(rendered, /Preview matches/);
  assert.match(rendered, /Hellofresh/);
  assert.match(rendered, /Xero Salary/);
  assert.match(rendered, /Duplicate imported_id/);
});

test("renderImportResult omits updated preview section when there are no updated preview transactions", () => {
  const rendered = renderImportResult({
    account,
    mapped: 12,
    dryRun: true,
    result: {
      errors: [],
      added: [],
      updated: [],
      updatedPreview: [],
    },
  });

  assert.match(rendered, /Import preview/);
  assert.match(rendered, /Mapped transactions/);
  assert.doesNotMatch(rendered, /Matched imported transactions considered during reconciliation/);
  assert.doesNotMatch(rendered, /No matched imported transactions/);
});
