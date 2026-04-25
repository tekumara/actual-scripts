import { resolveImportAccount } from "./import-account.js";
import { formatAmount, formatBudgetDate } from "./reporting.js";
import { normalizeTransaction, toFiniteNumber } from "./transaction-data.js";

function truthy(value) {
  return value === true || value === 1 || value === "1";
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

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) {
    throw new Error(`Invalid date ${JSON.stringify(value)}. Expected YYYY-MM-DD.`);
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error(`Invalid date ${JSON.stringify(value)}.`);
  }

  return parsed;
}

function previousIsoDate(value) {
  const parsed = parseIsoDate(value);
  parsed.setDate(parsed.getDate() - 1);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeListedTransaction(rawTransaction) {
  const normalized = normalizeTransaction(rawTransaction);
  return {
    ...normalized,
    accountId: rawTransaction.account ?? normalized.accountId,
    payeeId: rawTransaction.payee ?? normalized.payeeId,
    categoryId: rawTransaction.category ?? normalized.categoryId,
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
      await actualApi.getTransactions(account.id, args.start ?? undefined, args.end ?? undefined),
    );

    if (transactions.length === 0) {
      console.log(`No transactions found for account ${JSON.stringify(account.name ?? account.id)}.`);
      return;
    }

    const openingBalance = await actualApi.getAccountBalance(
      account.id,
      previousIsoDate(args.start ?? transactions[0].date),
    );

    const [metadata, dateFormat] = await Promise.all([
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
