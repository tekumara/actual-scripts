import { addDays } from "./date-utils.js";
import { resolveImportAccount } from "./import-account.js";
import { formatAmount, formatBudgetDate } from "./reporting.js";
import { normalizeTransaction, toFiniteNumber, truthy } from "./transaction-data.js";

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
  { fetchMetadata, fetchPreferenceValue, renderCliTable, withActual },
) {
  await withActual(async ({ actualApi }) => {
    const accounts = await actualApi.getAccounts();
    const account = resolveImportAccount(accounts, args.account);
    const transactions = sortListedTransactions(
      await actualApi.getTransactions(account.id, args.start, args.end),
    );

    if (transactions.length === 0) {
      console.log(`No transactions found for account ${JSON.stringify(account.name ?? account.id)}.`);
      return;
    }

    const balanceCutoff = addDays(args.start ?? transactions[0].date, -1);
    const [openingBalance, metadata, dateFormat] = await Promise.all([
      actualApi.getAccountBalance(account.id, balanceCutoff),
      fetchMetadata(),
      fetchPreferenceValue("dateFormat"),
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
