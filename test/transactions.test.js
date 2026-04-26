import assert from "node:assert/strict";
import test from "node:test";

import { buildTransactionsTable, commandTransactions, sortListedTransactions } from "../src/transactions.js";

function makeMetadata() {
  return {
    groupsById: new Map(),
    categoriesById: new Map([
      ["groceries", { id: "groceries", name: "Groceries" }],
    ]),
    accountsById: new Map([["checking", { id: "checking", name: "Checking" }]]),
    payeesById: new Map([
      ["payee-1", { id: "payee-1", name: "Opening balance" }],
      ["payee-2", { id: "payee-2", name: "Corner Store" }],
      ["payee-3", { id: "payee-3", name: "Employer" }],
    ]),
  };
}

test("sortListedTransactions orders transactions chronologically with starting balance first", () => {
  const transactions = sortListedTransactions([
    {
      id: "txn-2",
      account: "checking",
      payee: "payee-2",
      amount: -1250,
      category: "groceries",
      date: "2026-04-05",
      sort_order: 2,
      notes: "milk",
    },
    {
      id: "txn-1",
      account: "checking",
      payee: "payee-1",
      amount: 50000,
      category: null,
      date: "2026-04-05",
      sort_order: 99,
      starting_balance_flag: true,
      notes: "",
    },
    {
      id: "txn-3",
      account: "checking",
      payee: "payee-3",
      amount: 100000,
      category: null,
      date: "2026-04-06",
      sort_order: 0,
      notes: "salary",
    },
    {
      id: "txn-0",
      account: "checking",
      payee: "payee-2",
      amount: -500,
      category: "groceries",
      date: "2026-04-05",
      sort_order: 1,
      notes: "fruit",
    },
  ]);

  assert.deepEqual(
    transactions.map((transaction) => transaction.id),
    ["txn-1", "txn-0", "txn-2", "txn-3"],
  );
});

test("buildTransactionsTable renders payment, deposit, split category, and running balance", () => {
  const table = buildTransactionsTable(
    [
      {
        id: "txn-1",
        date: "2026-04-05",
        payeeId: "payee-2",
        notes: "milk",
        categoryId: "groceries",
        amount: -1250,
        subtransactions: [],
      },
      {
        id: "txn-2",
        date: "2026-04-06",
        payeeId: "payee-3",
        notes: "salary",
        categoryId: null,
        amount: 100000,
        subtransactions: [],
      },
      {
        id: "txn-3",
        date: "2026-04-07",
        payeeId: null,
        notes: "monthly allocation",
        categoryId: null,
        amount: -3000,
        subtransactions: [{ id: "split-1" }],
      },
    ],
    makeMetadata(),
    {
      accountName: "Checking",
      dateFormat: "DD/MM/YYYY",
      openingBalance: 50000,
    },
  );

  assert.equal(table.title, "Transactions");
  assert.equal(table.subtitle, "Checking (3 transactions)");
  assert.deepEqual(
    table.columns.map((column) => column.label),
    ["Date", "Payee", "Notes", "Category", "Payment", "Deposit", "Balance"],
  );
  assert.deepEqual(table.rows[0].cells, [
    "05/04/2026",
    "Corner Store",
    "milk",
    "Groceries",
    "12.50",
    "",
    "487.50",
  ]);
  assert.deepEqual(table.rows[1].cells, [
    "06/04/2026",
    "Employer",
    "salary",
    "",
    "",
    "1,000.00",
    "1,487.50",
  ]);
  assert.deepEqual(table.rows[2].cells, [
    "07/04/2026",
    "",
    "monthly allocation",
    "Split",
    "30.00",
    "",
    "1,457.50",
  ]);
});

test("commandTransactions accepts start and end dates in the budget date format", async () => {
  const calls = [];
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(" "));
  };

  try {
    await commandTransactions(
      {
        account: "Checking",
        start: "05/04/2026",
        end: "06/04/2026",
      },
      {
        fetchMetadata: async () => makeMetadata(),
        renderCliTable: (table) => JSON.stringify(table),
        withActual: async (fn) =>
          fn({
            actualApi: {
              internal: {
                send: async (name) => {
                  assert.equal(name, "preferences/get");
                  return { dateFormat: "DD/MM/YYYY" };
                },
              },
              getAccounts: async () => [{ id: "checking", name: "Checking" }],
              getTransactions: async (accountId, start, end) => {
                calls.push({ type: "getTransactions", accountId, start, end });
                return [
                  {
                    id: "txn-1",
                    account: "checking",
                    payee: "payee-2",
                    amount: -1250,
                    category: "groceries",
                    date: "2026-04-05",
                    notes: "milk",
                  },
                ];
              },
              getAccountBalance: async (accountId, cutoff) => {
                calls.push({ type: "getAccountBalance", accountId, cutoff });
                return 50000;
              },
            },
          }),
      },
    );
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    {
      type: "getTransactions",
      accountId: "checking",
      start: "2026-04-05",
      end: "2026-04-06",
    },
    {
      type: "getAccountBalance",
      accountId: "checking",
      cutoff: "2026-04-04",
    },
  ]);
  assert.equal(logs.length, 1);
});
