import { addDays, normalizeDateInput } from "./date-utils.js";
import { resolveImportAccount } from "./import-account.js";
import { fetchBudgetDateFormat } from "./preferences.js";
import { formatAmount, formatBudgetDate } from "./reporting.js";
import { normalizeTransaction, toFiniteNumber, truthy } from "./transaction-data.js";

function fail(message) {
  throw new Error(message);
}

function payeeLabel(transaction, metadata) {
  return metadata.payeesById.get(transaction.payeeId)?.name ?? "";
}

function categoryLabel(transaction, metadata) {
  if (transaction.subtransactions.length > 0) {
    return "Split";
  }
  return metadata.categoriesById.get(transaction.categoryId)?.name ?? "";
}

export function normalizeListedTransaction(rawTransaction) {
  return {
    ...normalizeTransaction(rawTransaction),
    sortOrder: toFiniteNumber(rawTransaction.sort_order, 0),
    startingBalance: truthy(rawTransaction.starting_balance_flag),
  };
}

export function sortListedTransactions(rawTransactions) {
  return rawTransactions
    .map(normalizeListedTransaction)
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }
      if (left.startingBalance !== right.startingBalance) {
        return Number(right.startingBalance) - Number(left.startingBalance);
      }
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.id.localeCompare(right.id);
    });
}

export function buildTransactionsTable(
  transactions,
  metadata,
  { accountName = null, dateFormat, openingBalance = 0 } = {},
) {
  let runningBalance = openingBalance;

  return {
    title: "Transactions",
    subtitle:
      accountName == null
        ? `${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`
        : `${accountName} (${transactions.length} transaction${transactions.length === 1 ? "" : "s"})`,
    columns: [
      { label: "Date", align: "left" },
      { label: "Payee", align: "left" },
      { label: "Notes", align: "left" },
      { label: "Category", align: "left" },
      { label: "Payment", align: "right" },
      { label: "Deposit", align: "right" },
      { label: "Balance", align: "right" },
    ],
    rows: transactions.map((transaction) => {
      runningBalance += transaction.amount;
      return {
        cells: [
          formatBudgetDate(transaction.date, dateFormat),
          payeeLabel(transaction, metadata),
          transaction.notes ?? "",
          categoryLabel(transaction, metadata),
          transaction.amount < 0 ? formatAmount(Math.abs(transaction.amount)) : "",
          transaction.amount > 0 ? formatAmount(transaction.amount) : "",
          formatAmount(runningBalance),
        ],
      };
    }),
  };
}

export async function commandTransactions(
  args,
  { fetchMetadata, renderCliTable, withActual },
) {
  await withActual(async ({ actualApi }) => {
    const accounts = await actualApi.getAccounts();
    const account = resolveImportAccount(accounts, args.account);
    const dateFormat = await fetchBudgetDateFormat(actualApi);
    const start = args.start ? normalizeDateInput(args.start, { dateFormat }) : null;
    const end = args.end ? normalizeDateInput(args.end, { dateFormat }) : null;
    if (start && end && start > end) {
      fail("--start must be on or before --end.");
    }

    const transactions = sortListedTransactions(
      await actualApi.getTransactions(account.id, start ?? undefined, end ?? undefined),
    );

    if (transactions.length === 0) {
      console.log(`No transactions found for account ${JSON.stringify(account.name ?? account.id)}.`);
      return;
    }

    const balanceCutoff = addDays(start ?? transactions[0].date, -1);
    const [openingBalance, metadata] = await Promise.all([
      actualApi.getAccountBalance(account.id, balanceCutoff),
      fetchMetadata(),
    ]);

    console.log(
      renderCliTable(
        buildTransactionsTable(transactions, metadata, {
          accountName: account.name ?? account.id,
          dateFormat,
          openingBalance,
        }),
      ),
    );
  });
}
