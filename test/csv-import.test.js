import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCsvImportCategoryResolver,
  mapCsvImportRowsToImportTransactions,
  parseCsvImport,
  parseCsvImportToImportTransactions,
} from "../src/csv-import.js";

test("parses csv import rows with canonical headers", () => {
  const rows = parseCsvImport([
    "\uFEFFdate,payee,notes,debit,credit,balance",
    "2026-04-05,Coffee Shop,Morning caffeine,4.50,,123.45",
  ].join("\n"));

  assert.deepEqual(rows, [
    {
      __line: 2,
      Date: "2026-04-05",
      Payee: "Coffee Shop",
      Notes: "Morning caffeine",
      Debit: "4.50",
      Credit: "",
      Balance: "123.45",
    },
  ]);
});

test("parses csv import rows with required headers only", () => {
  const rows = parseCsvImport([
    "Date,Payee,Notes,Debit,Credit",
    "2026-04-05,Coffee Shop,Morning caffeine,4.50,",
  ].join("\n"));

  assert.deepEqual(rows, [
    {
      __line: 2,
      Date: "2026-04-05",
      Payee: "Coffee Shop",
      Notes: "Morning caffeine",
      Debit: "4.50",
      Credit: "",
    },
  ]);
});

test("maps csv import rows to Actual import transactions", () => {
  const actual = parseCsvImportToImportTransactions(
    [
      "Date,Payee,Notes,Debit,Credit",
      "05/04/2026,Coffee Shop,Morning caffeine,4.50,",
      "05/04/2026,Coffee Shop,Morning caffeine,4.50,",
      '2026-04-06,Salary,,,"$1,234.56"',
      "2026-04-07,Interest,,,.50",
    ].join("\n"),
    {
      accountId: "acct-main",
      dateFormat: "DD/MM/YYYY",
    },
  );

  assert.deepEqual(actual, [
    {
      account: "acct-main",
      date: "2026-04-05",
      amount: -450,
      payee_name: "Coffee Shop",
      imported_payee: "Coffee Shop",
      notes: "Morning caffeine",
      imported_id: "csv|2026-04-05|Coffee Shop|4.50|",
    },
    {
      account: "acct-main",
      date: "2026-04-05",
      amount: -450,
      payee_name: "Coffee Shop",
      imported_payee: "Coffee Shop",
      notes: "Morning caffeine",
      imported_id: "csv|2026-04-05|Coffee Shop|4.50||dup:2",
    },
    {
      account: "acct-main",
      date: "2026-04-06",
      amount: 123456,
      payee_name: "Salary",
      imported_payee: "Salary",
      imported_id: "csv|2026-04-06|Salary||$1,234.56",
    },
    {
      account: "acct-main",
      date: "2026-04-07",
      amount: 50,
      payee_name: "Interest",
      imported_payee: "Interest",
      imported_id: "csv|2026-04-07|Interest||.50",
    },
  ]);
});

test("uses Balance to strengthen csv row uniqueness and imported ids", () => {
  const actual = parseCsvImportToImportTransactions(
    [
      "Date,Payee,Notes,Debit,Credit,Balance",
      "05/04/2026,Coffee Shop,Morning caffeine,4.50,,100.00",
      "05/04/2026,Coffee Shop,Morning caffeine,4.50,,95.50",
    ].join("\n"),
    {
      accountId: "acct-main",
      dateFormat: "DD/MM/YYYY",
    },
  );

  assert.deepEqual(actual, [
    {
      account: "acct-main",
      date: "2026-04-05",
      amount: -450,
      payee_name: "Coffee Shop",
      imported_payee: "Coffee Shop",
      notes: "Morning caffeine",
      imported_id: "csv|2026-04-05|Coffee Shop|4.50||100.00",
    },
    {
      account: "acct-main",
      date: "2026-04-05",
      amount: -450,
      payee_name: "Coffee Shop",
      imported_payee: "Coffee Shop",
      notes: "Morning caffeine",
      imported_id: "csv|2026-04-05|Coffee Shop|4.50||95.50",
    },
  ]);
});

test("maps CSV Category to Actual category ids when requested", () => {
  const categoryResolver = buildCsvImportCategoryResolver({
    categories: [
      {
        id: "cat-groceries",
        name: "Groceries",
        tombstone: false,
      },
      {
        id: "cat-income",
        name: "Income",
        tombstone: false,
      },
      {
        id: "cat-archived",
        name: "Archived",
        tombstone: true,
      },
    ],
  });
  const actual = parseCsvImportToImportTransactions(
    [
      "Date,Payee,Notes,Debit,Credit,Category,SubCategory",
      "05/04/2026,Coffee Shop,Morning caffeine,4.50,,Groceries,Ignored SubCategory",
      "05/04/2026,Salary,,,1234.56,Income,",
    ].join("\n"),
    {
      accountId: "acct-main",
      dateFormat: "DD/MM/YYYY",
      categoryResolver,
    },
  );

  assert.deepEqual(actual, [
    {
      account: "acct-main",
      date: "2026-04-05",
      amount: -450,
      payee_name: "Coffee Shop",
      imported_payee: "Coffee Shop",
      category: "cat-groceries",
      notes: "Morning caffeine",
      imported_id: "csv|2026-04-05|Coffee Shop|4.50|",
    },
    {
      account: "acct-main",
      date: "2026-04-05",
      amount: 123456,
      payee_name: "Salary",
      imported_payee: "Salary",
      category: "cat-income",
      imported_id: "csv|2026-04-05|Salary||1234.56",
    },
  ]);
});

test("omits tombstoned and unresolved CSV categories unless keepUnresolved is enabled", () => {
  const categoryResolver = buildCsvImportCategoryResolver({
    categories: [
      { id: "cat-groceries", name: "Groceries", tombstone: false },
      { id: "cat-archived", name: "Archived", tombstone: true },
    ],
  });

  const actual = parseCsvImportToImportTransactions(
    [
      "Date,Payee,Notes,Debit,Credit,Category",
      "2026-04-05,Old Thing,,1.00,,Archived",
      "2026-04-06,Coffee Shop,Morning caffeine,4.50,,Deposits",
      "2026-04-07,Store,,1.00,,cat-groceries",
    ].join("\n"),
    { accountId: "acct-main", categoryResolver },
  );

  assert.deepEqual(actual, [
    {
      account: "acct-main",
      date: "2026-04-05",
      amount: -100,
      payee_name: "Old Thing",
      imported_payee: "Old Thing",
      imported_id: "csv|2026-04-05|Old Thing|1.00|",
    },
    {
      account: "acct-main",
      date: "2026-04-06",
      amount: -450,
      payee_name: "Coffee Shop",
      imported_payee: "Coffee Shop",
      notes: "Morning caffeine",
      imported_id: "csv|2026-04-06|Coffee Shop|4.50|",
    },
    {
      account: "acct-main",
      date: "2026-04-07",
      amount: -100,
      payee_name: "Store",
      imported_payee: "Store",
      imported_id: "csv|2026-04-07|Store|1.00|",
    },
  ]);
});

test("keeps raw unresolved CSV categories when keepUnresolved is enabled", () => {
  const categoryResolver = buildCsvImportCategoryResolver({
    categories: [
      { id: "cat-groceries", name: "Groceries", tombstone: false },
      { id: "cat-archived", name: "Archived", tombstone: true },
    ],
    keepUnresolved: true,
  });

  const actual = parseCsvImportToImportTransactions(
    [
      "Date,Payee,Notes,Debit,Credit,Category",
      "2026-04-05,Old Thing,,1.00,,Archived",
      "2026-04-06,Coffee Shop,Morning caffeine,4.50,,Deposits",
      "2026-04-07,Store,,1.00,,cat-groceries",
    ].join("\n"),
    { accountId: "acct-main", categoryResolver },
  );

  assert.deepEqual(actual, [
    {
      account: "acct-main",
      date: "2026-04-05",
      amount: -100,
      payee_name: "Old Thing",
      imported_payee: "Old Thing",
      category: "Archived",
      imported_id: "csv|2026-04-05|Old Thing|1.00|",
    },
    {
      account: "acct-main",
      date: "2026-04-06",
      amount: -450,
      payee_name: "Coffee Shop",
      imported_payee: "Coffee Shop",
      category: "Deposits",
      notes: "Morning caffeine",
      imported_id: "csv|2026-04-06|Coffee Shop|4.50|",
    },
    {
      account: "acct-main",
      date: "2026-04-07",
      amount: -100,
      payee_name: "Store",
      imported_payee: "Store",
      category: "cat-groceries",
      imported_id: "csv|2026-04-07|Store|1.00|",
    },
  ]);
});

test("ignores Notes when building imported ids", () => {
  const actual = parseCsvImportToImportTransactions(
    [
      "Date,Payee,Notes,Debit,Credit",
      "05/04/2026,Coffee Shop,Morning caffeine,4.50,",
      "05/04/2026,Coffee Shop,Afternoon caffeine,4.50,",
    ].join("\n"),
    {
      accountId: "acct-main",
      dateFormat: "DD/MM/YYYY",
    },
  );

  assert.deepEqual(actual, [
    {
      account: "acct-main",
      date: "2026-04-05",
      amount: -450,
      payee_name: "Coffee Shop",
      imported_payee: "Coffee Shop",
      notes: "Morning caffeine",
      imported_id: "csv|2026-04-05|Coffee Shop|4.50|",
    },
    {
      account: "acct-main",
      date: "2026-04-05",
      amount: -450,
      payee_name: "Coffee Shop",
      imported_payee: "Coffee Shop",
      notes: "Afternoon caffeine",
      imported_id: "csv|2026-04-05|Coffee Shop|4.50||dup:2",
    },
  ]);
});

test("can omit imported_id when requested", () => {
  const actual = parseCsvImportToImportTransactions(
    [
      "Date,Payee,Notes,Debit,Credit,Balance",
      "05/04/2026,Coffee Shop,Morning caffeine,4.50,,100.00",
    ].join("\n"),
    {
      accountId: "acct-main",
      dateFormat: "DD/MM/YYYY",
      includeImportId: false,
    },
  );

  assert.deepEqual(actual, [
    {
      account: "acct-main",
      date: "2026-04-05",
      amount: -450,
      payee_name: "Coffee Shop",
      imported_payee: "Coffee Shop",
      notes: "Morning caffeine",
    },
  ]);
});

test("omits blank notes", () => {
  const actual = mapCsvImportRowsToImportTransactions(
    [
      {
        __line: 2,
        Date: "2026-04-05",
        Payee: "Interest",
        Notes: " ",
        Debit: "",
        Credit: "1.23",
      },
    ],
    {
      accountId: "acct-main",
    },
  );

  assert.deepEqual(actual, [
    {
      account: "acct-main",
      date: "2026-04-05",
      amount: 123,
      payee_name: "Interest",
      imported_payee: "Interest",
      imported_id: "csv|2026-04-05|Interest||1.23",
    },
  ]);
});

test("rejects signed debit and credit amounts", () => {
  assert.throws(
    () =>
      parseCsvImportToImportTransactions(
        [
          "Date,Payee,Notes,Debit,Credit",
          "2026-04-05,Refund,,,-1.00",
        ].join("\n"),
        { accountId: "acct-main" },
      ),
    /non-negative amount without signs/,
  );

  assert.throws(
    () =>
      parseCsvImportToImportTransactions(
        [
          "Date,Payee,Notes,Debit,Credit",
          '2026-04-05,Coffee Shop,,"(4.50)",',
        ].join("\n"),
        { accountId: "acct-main" },
      ),
    /non-negative amount without signs/,
  );
});

test("rejects rows with both debit and credit populated", () => {
  assert.throws(
    () =>
      mapCsvImportRowsToImportTransactions(
        [
          {
            __line: 2,
            Date: "2026-04-05",
            Payee: "Bad Row",
            Notes: "",
            Debit: "10.00",
            Credit: "9.00",
          },
        ],
        { accountId: "acct-main" },
      ),
    /both Debit and Credit populated/,
  );
});

test("rejects invalid dates", () => {
  assert.throws(
    () =>
      parseCsvImportToImportTransactions(
        [
          "Date,Payee,Notes,Debit,Credit",
          "31/02/2026,Coffee Shop,,4.50,",
        ].join("\n"),
        {
          accountId: "acct-main",
          dateFormat: "DD/MM/YYYY",
        },
      ),
    /Invalid CSV date/,
  );
});
