#!/usr/bin/env node

import { Command, InvalidArgumentError } from "commander";
import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { commandAccounts } from "./accounts.js";
import { buildCsvImportCategoryResolver, parseCsvImportToImportTransactions } from "./csv-import.js";
import { normalizeDateInput } from "./date-utils.js";
import { resolveImportAccount } from "./import-account.js";
import { renderImportResult } from "./import-results.js";
import { fetchBudgetDateFormat } from "./preferences.js";
import os from "node:os";
import path from "node:path";
import { addSplitCommand } from "./split.js";
import { promisify } from "node:util";
import {
  accountName,
  buildReportTable,
  categoryName,
  filterReportTransactions,
  formatAmount,
  formatBudgetDate,
  payeeName,
  resolveDateRange,
} from "./reporting.js";
import { normalizeParsedQifTransactions } from "./qif.js";
import { renderCliTable, toHtml, toTsv } from "./table-rendering.js";
import { commandMakeTransfer } from "./transfer.js";
import { commandTransactions } from "./transactions.js";
import { commandUncategorized } from "./uncategorized.js";
import { extractQueryData, normalizeTransaction, toFiniteNumber, truthy } from "./transaction-data.js";

const execFile = promisify(execFileCallback);

const ACCOUNT_MATCHING_HELP = [
  "",
  "Account matching:",
  "  <account> may be an Actual account id or account name.",
  "  Matching prefers exact id, then exact name, then unique case-insensitive name,",
  "  then a unique case-insensitive substring match.",
].join("\n");
const QIF_IMPORT_HELP = [
  ACCOUNT_MATCHING_HELP,
  "",
  "Date parsing:",
  "  Ambiguous QIF dates use the budget's dateFormat preference when available.",
].join("\n");
const CSV_IMPORT_HELP = [
  ACCOUNT_MATCHING_HELP,
  "",
  "CSV columns:",
  "  Required headers: Date, Payee, Notes, Debit, Credit.",
  "  Optional headers: Balance (used to strengthen row uniqueness and imported_id stability), Category, SubCategory.",
  "  Debit and Credit must be non-negative amounts without signs.",
  "  Notes are imported as transaction notes but excluded from imported_id.",
  "  Use --import-category to map Category values to existing Actual category names.",
  "",
  "Matching:",
  "  Use --no-import-id to omit imported_id and rely on Actual's fuzzy matching.",
  "  By default, Actual derives imported_payee from payee_name like UI CSV import.",
  "  Use --raw-imported-payee to send the CSV Payee as imported_payee exactly as-is.",
  "",
  "Date parsing:",
  "  Ambiguous CSV dates use the budget's dateFormat preference when available.",
].join("\n");

const SERVER_URL = process.env.ACTUAL_SERVER_URL ?? "http://localhost:5007";
const DEFAULT_DATA_DIR = "/tmp/actual";
const DATA_DIR = process.env.ACTUAL_DATA_DIR ?? DEFAULT_DATA_DIR;
let actualApiPromise;
let actualApiInternal = null;

async function getActualApi() {
  if (!actualApiPromise) {
    // needed because of https://github.com/actualbudget/actual/issues/7201
    if (!globalThis.navigator) {
      const platform =
        process.platform === "darwin"
          ? "MacIntel"
          : process.platform === "win32"
            ? "Win32"
            : process.platform;
      globalThis.navigator = {
        platform,
        userAgent: `node/${process.version}`,
      };
    }

    actualApiPromise = import("@actual-app/api").then((actualApiModule) => ({
      ...actualApiModule,
      async init(config = {}) {
        actualApiInternal = await actualApiModule.init(config);
        return actualApiInternal;
      },
      async shutdown() {
        try {
          await actualApiModule.shutdown();
        } finally {
          actualApiInternal = null;
        }
      },
      get internal() {
        return actualApiInternal;
      },
    }));
  }

  return actualApiPromise;
}

function fail(message) {
  throw new Error(message);
}

function normalizeReport(rawReport) {
  return {
    ...rawReport,
    date_static: truthy(rawReport.date_static),
    show_empty: truthy(rawReport.show_empty),
    show_offbudget: truthy(rawReport.show_offbudget),
    show_hidden: truthy(rawReport.show_hidden),
    show_uncategorized: truthy(rawReport.show_uncategorized),
    tombstone: truthy(rawReport.tombstone),
  };
}

function buildMetadata({ accounts, categories, categoryGroups, payees }) {
  const groupsById = new Map(
    categoryGroups
      .filter((group) => !truthy(group.tombstone))
      .map((group, index) => [
        group.id,
        {
          id: group.id,
          name: group.name ?? "?",
          hidden: truthy(group.hidden),
          sortOrder: toFiniteNumber(group.sort_order, index),
        },
      ]),
  );

  const categoriesById = new Map(
    categories
      .filter((category) => !truthy(category.tombstone))
      .map((category, index) => {
        const groupId = category.group_id ?? category.group ?? category.cat_group ?? null;
        return [
          category.id,
          {
            id: category.id,
            name: category.name ?? "?",
            hidden: truthy(category.hidden),
            groupId,
            sortOrder: toFiniteNumber(category.sort_order, index),
          },
        ];
      }),
  );

  const accountsById = new Map(
    accounts
      .filter((account) => !truthy(account.tombstone))
      .map((account, index) => [
        account.id,
        {
          id: account.id,
          name: account.name ?? "?",
          offbudget: truthy(account.offbudget),
          sortOrder: toFiniteNumber(account.sort_order, index),
        },
      ]),
  );

  const payeesById = new Map(
    payees
      .filter((payee) => !truthy(payee.tombstone))
      .map((payee) => [payee.id, { id: payee.id, name: payee.name ?? "?" }]),
  );

  return { groupsById, categoriesById, accountsById, payeesById };
}


async function copyRtf(html) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "actual-trans-"));
  const htmlPath = path.join(tempDir, "report.html");
  const rtfPath = path.join(tempDir, "report.rtf");

  try {
    await writeFile(htmlPath, html, "utf8");
    await execFile("textutil", ["-convert", "rtf", htmlPath, "-output", rtfPath]);
    await execFile("osascript", [
      "-e",
      `set the clipboard to (read POSIX file "${rtfPath}" as «class RTF »)`,
    ]);
  } finally {
    for (const file of [htmlPath, rtfPath]) {
      if (existsSync(file)) {
        await unlink(file);
      }
    }
  }
}

async function resolveBudget() {
  const actualApi = await getActualApi();
  const budgets = await actualApi.getBudgets();
  if (budgets.length === 0) {
    fail(
      "No budgets found. Set ACTUAL_SYNC_ID or create a cloud file in Actual first.",
    );
  }

  const requestedBudget = process.env.ACTUAL_SYNC_ID?.trim();
  if (requestedBudget) {
    const directMatch = budgets.find(
      (budget) =>
        budget.groupId === requestedBudget ||
        budget.cloudFileId === requestedBudget ||
        budget.id === requestedBudget ||
        budget.name === requestedBudget,
    );
    if (directMatch) {
      return directMatch;
    }

    const foldedRequest = requestedBudget.toLowerCase();
    const nameMatches = budgets.filter(
      (budget) => budget.name?.toLowerCase() === foldedRequest,
    );
    if (nameMatches.length === 1) {
      return nameMatches[0];
    }
    if (nameMatches.length > 1) {
      fail(
        `Budget name ${JSON.stringify(requestedBudget)} is ambiguous. Matching budgets: ${nameMatches
          .map((budget) => budget.name)
          .join(", ")}`,
      );
    }

    fail(
      `Budget ${JSON.stringify(requestedBudget)} not found. Available budgets: ${budgets
        .map((budget) => budget.name)
        .join(", ")}`,
    );
  }

  return budgets[0];
}

async function withActual(fn, { loadBudget = true } = {}) {
  const actualApi = await getActualApi();
  const password = process.env.ACTUAL_PASSWORD;
  if (!password) {
    fail("ACTUAL_PASSWORD is required.");
  }

  if (DATA_DIR === DEFAULT_DATA_DIR && !existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }

  await actualApi.init({
    // Budget data will be cached locally here, in subdirectories for each file.
    dataDir: DATA_DIR,
    // This is the URL of your running server, started from the CLI or the Desktop app
    serverURL: SERVER_URL,
    // This is the password you use to log into the server
    password,
    verbose: false,
  });

  try {
    if (loadBudget) {
      const budget = await resolveBudget();
      if (budget.groupId) {
        // For cloud budgets, open by sync id so Actual loads the local copy or
        // downloads it and syncs it with the server as needed.
        await actualApi.downloadBudget(budget.groupId, { password });
      } else if (budget.id) {
        // Local-only budgets have no sync id, so they can only be opened
        // directly from the local data dir by local budget id.
        // TODO: make it possible to open local-only budgets - right now they are never used
        await actualApi.loadBudget(budget.id);
      } else {
        fail(`Budget ${JSON.stringify(budget.name ?? "(unknown)")} is missing both local id and sync id.`);
      }
    }

    return await fn({ actualApi, password });
  } finally {
    try {
      await actualApi.shutdown();
    } catch {
      // Ignore shutdown failures so the original error is preserved.
    }
  }
}

async function fetchMetadata() {
  const actualApi = await getActualApi();
  const [accountsResult, categoriesResult, categoryGroupsResult, payeesResult] = await Promise.all([
    actualApi.runQuery(actualApi.q("accounts").filter({ tombstone: false }).select("*")),
    actualApi.runQuery(actualApi.q("categories").filter({ tombstone: false }).select("*")),
    actualApi.runQuery(actualApi.q("category_groups").filter({ tombstone: false }).select("*")),
    actualApi.runQuery(actualApi.q("payees").filter({ tombstone: false }).select("*")),
  ]);

  const accounts = extractQueryData(accountsResult);
  const categories = extractQueryData(categoriesResult);
  const categoryGroups = extractQueryData(categoryGroupsResult);
  const payees = extractQueryData(payeesResult);

  return buildMetadata({ accounts, categories, categoryGroups, payees });
}

async function fetchTransactions({ start = null, end = null, splitMode = "inline" } = {}) {
  const actualApi = await getActualApi();
  const query = actualApi
    .q("transactions")
    .filter({ tombstone: false })
    .select("*")
    .options({ splits: splitMode });
  const transactions = extractQueryData(await actualApi.runQuery(query)).map(normalizeTransaction);
  return transactions.filter((transaction) => {
    if (start && transaction.date < start) {
      return false;
    }
    if (end && transaction.date > end) {
      return false;
    }
    return true;
  });
}

async function fetchReports() {
  const actualApi = await getActualApi();
  const reports = extractQueryData(await actualApi.runQuery(
    actualApi.q("custom_reports").filter({ tombstone: false }).select("*"),
  ));
  return reports.map(normalizeReport);
}

function printTransaction(transaction, metadata, { dateFormat } = {}) {
  console.log(`  id:       ${transaction.id}`);
  console.log(`  account:  ${accountName(transaction, metadata)}`);
  console.log(`  date:     ${formatBudgetDate(transaction.date, dateFormat)}`);
  console.log(`  payee:    ${payeeName(transaction, metadata)}`);
  console.log(`  notes:    ${transaction.notes ?? ""}`);
  console.log(`  category: ${categoryName(transaction, metadata)}`);
  console.log(`  amount:   ${formatAmount(transaction.amount)}`);
}

function parseMode(value) {
  if (value !== "total" && value !== "time") {
    throw new InvalidArgumentError("--mode must be either total or time.");
  }
  return value;
}

function summarizeBudgets(budgets) {
  const summaries = new Map();

  for (const budget of budgets) {
    const key = budget.groupId ?? budget.id ?? budget.cloudFileId ?? budget.name ?? JSON.stringify(budget);
    const existing = summaries.get(key) ?? {
      name: budget.name ?? "(no name)",
      groupId: budget.groupId ?? null,
      cloudFileId: budget.cloudFileId ?? null,
      localIds: [],
      states: new Set(),
    };

    existing.name = budget.name ?? existing.name;
    existing.groupId ??= budget.groupId ?? null;
    existing.cloudFileId ??= budget.cloudFileId ?? null;
    if (budget.id && !existing.localIds.includes(budget.id)) {
      existing.localIds.push(budget.id);
    }
    existing.states.add(budget.state === "remote" ? "remote" : "local");
    summaries.set(key, existing);
  }

  return [...summaries.values()].sort((left, right) => {
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) {
      return byName;
    }
    return (left.groupId ?? left.localIds[0] ?? left.cloudFileId ?? "").localeCompare(
      right.groupId ?? right.localIds[0] ?? right.cloudFileId ?? "",
    );
  });
}

function printBudgets(budgets) {
  for (const budget of budgets) {
    const locations = [...budget.states].sort().join(", ");
    console.log(budget.name);
    console.log(`  sync id:      ${budget.groupId ?? "(none)"}`);
    console.log(`  cloud file:   ${budget.cloudFileId ?? "(none)"}`);
    console.log(`  local id:     ${budget.localIds.join(", ") || "(none)"}`);
    console.log(`  available in: ${locations}`);
    console.log("");
  }
}

function buildProgram() {
  const program = new Command();

  program
    .name("abctl")
    .description("Actual budget helper commands.")
    .showHelpAfterError()
    .addHelpText(
      "after",
      [
        "",
        "Environment:",
        "  ACTUAL_PASSWORD        Required.",
        "  ACTUAL_SYNC_ID         Optional. Budget name, groupId, or cloudFileId. Defaults to the first available budget.",
        "  ACTUAL_SERVER_URL      Optional. Defaults to http://localhost:5007",
        "  ACTUAL_DATA_DIR        Optional. Defaults to /tmp/actual",
      ].join("\n"),
    );

  program
    .command("budgets")
    .description("List budgets and their sync ids.")
    .action(async () => {
      await commandBudgets();
    });

  program
    .command("accounts")
    .description("List accounts and their current balances.")
    .action(async () => {
      await commandAccounts({ renderCliTable, withActual });
    });

  program
    .command("uncategorized")
    .description("List uncategorized transactions across all accounts.")
    .action(async () => {
      await commandUncategorized({ fetchMetadata, renderCliTable, withActual });
    });

  program
    .command("transactions")
    .alias("txns")
    .description("List transactions for an account.")
    .argument("<account>")
    .option("--start <date>", "start date (YYYY-MM-DD or budget format)")
    .option("--end <date>", "end date (YYYY-MM-DD or budget format)")
    .option("--tsv", "output tab-separated text")
    .addHelpText(
      "after",
      [
        ACCOUNT_MATCHING_HELP,
        "",
        "Date input:",
        "  --start and --end accept YYYY-MM-DD or the budget date format.",
      ].join("\n"),
    )
    .action(async (account, options) => {
      await commandTransactions(
        {
          account,
          start: options.start,
          end: options.end,
          tsv: options.tsv ?? false,
        },
        {
          fetchMetadata,
          renderCliTable,
          toTsv,
          withActual,
        },
      );
    });

  program
    .command("make-transfer")
    .alias("transfer")
    .description("Find uncategorized transfer pairs and link them.")
    .option("--dry-run", "list transfer candidates without updating transactions")
    .action(async (options) => {
      await commandMakeTransfer({
        dryRun: options.dryRun ?? false,
        fetchMetadata,
        renderCliTable,
        withActual,
      });
    });

  program
    .command("find")
    .description("Find transactions by exact payee name and date.")
    .argument("<payee>")
    .argument("<txn-date>")
    .addHelpText(
      "after",
      [
        "",
        "Date input:",
        "  <txn-date> accepts YYYY-MM-DD or the budget date format.",
      ].join("\n"),
    )
    .action(async (payee, txnDate) => {
      await commandFind({ payee, txnDate });
    });

  addSplitCommand(program, {
    fetchMetadata,
    fetchTransactions,
    printTransaction,
    withActual,
  });

  program
    .command("report")
    .description("Render a custom report by name.")
    .argument("<name>")
    .option("--mode <mode>", "report mode", parseMode)
    .option("--tsv", "output tab-separated text")
    .option("--pbcopy", "copy rich text output to the clipboard")
    .action(async (name, options) => {
      await commandReport({
        name,
        mode: options.mode ?? null,
        tsv: options.tsv ?? false,
        pbcopy: options.pbcopy ?? false,
      });
    });

  program
    .command("qif-import")
    .description("Import a QIF file into an Actual account.")
    .argument("<account>")
    .argument("<qif-path>")
    .option("--dry-run", "preview reconciliation without writing transactions")
    .option("--json", "print mapped ImportTransactionEntity objects and exit")
    .option("--import-notes", "import QIF memo fields into transaction notes")
    .option(
      "--swap-payee-and-memo",
      "use QIF memo values as payees before optional note import",
    )
    .addHelpText("after", QIF_IMPORT_HELP)
    .action(async (account, qifPath, options) => {
      await commandQifImport({
        account,
        qifPath,
        dryRun: options.dryRun ?? false,
        json: options.json ?? false,
        importNotes: options.importNotes ?? false,
        swapPayeeAndMemo: options.swapPayeeAndMemo ?? false,
      });
    });

  program
    .command("csv-import")
    .description(
      "Import a generic CSV with Date, Payee, Notes, Debit, and Credit columns into an Actual account. Balance, Category, and SubCategory are optional.",
    )
    .argument("<account>")
    .argument("<csv-path>")
    .option("--dry-run", "preview reconciliation without writing transactions")
    .option("--json", "print mapped ImportTransactionEntity objects and exit")
    .option("--no-import-id", "omit imported_id and rely on Actual fuzzy matching")
    .option("--raw-imported-payee", "send the raw CSV Payee as imported_payee")
    .option("--import-category", "map CSV Category values to existing Actual category names")
    .addHelpText("after", CSV_IMPORT_HELP)
    .action(async (account, csvPath, options) => {
      await commandCsvImport({
        account,
        csvPath,
        dryRun: options.dryRun ?? false,
        json: options.json ?? false,
        includeImportId: options.importId !== false,
        rawImportedPayee: options.rawImportedPayee ?? false,
        importCategory: options.importCategory ?? false,
      });
    });

  return program;
}

async function commandFind({ payee, txnDate }) {
  await withActual(async () => {
    const [metadata, dateFormat] = await Promise.all([
      fetchMetadata(),
      fetchBudgetDateFormat(actualApi),
    ]);
    const normalizedTxnDate = normalizeDateInput(txnDate, { dateFormat });
    const transactions = await fetchTransactions({
      start: normalizedTxnDate,
      end: normalizedTxnDate,
      splitMode: "inline",
    });
    const matches = transactions.filter(
      (transaction) => transaction.date === normalizedTxnDate && payeeName(transaction, metadata) === payee,
    );

    if (matches.length === 0) {
      console.log(`No transactions found for payee=${JSON.stringify(payee)} on ${txnDate}`);
      return;
    }

    for (const transaction of matches) {
      printTransaction(transaction, metadata, { dateFormat });
      console.log("");
    }
  });
}

async function commandBudgets() {
  await withActual(async ({ actualApi }) => {
    const budgets = summarizeBudgets(await actualApi.getBudgets());
    if (budgets.length === 0) {
      console.log(
        "No budgets found. You need to create cloud files first: https://actualbudget.org/docs/getting-started/sync/#this-file-is-not-a-cloud-file",
      );
      return;
    }
    printBudgets(budgets);
  }, { loadBudget: false });
}

async function commandReport(args) {
  await withActual(async () => {
    const [reports, metadata] = await Promise.all([fetchReports(), fetchMetadata()]);
    const report = reports.find((entry) => entry.name === args.name && !entry.tombstone);

    if (!report) {
      const available = reports
        .filter((entry) => !entry.tombstone)
        .map((entry) => entry.name ?? "?")
        .sort((left, right) => left.localeCompare(right));
      let message = `Report ${JSON.stringify(args.name)} not found.`;
      if (available.length > 0) {
        message += ` Available: ${available.join(", ")}`;
      }
      fail(message);
    }

    const [start, end] = resolveDateRange(report);
    const transactions = filterReportTransactions(
      await fetchTransactions({ start, end, splitMode: "inline" }),
      report,
      metadata,
    );

    const reportTable = buildReportTable({
      transactions,
      report,
      metadata,
      mode: args.mode ?? report.mode,
      start,
      end,
    });

    if (args.pbcopy) {
      console.log(renderCliTable(reportTable));
      await copyRtf(toHtml(reportTable));
      console.log("Copied to clipboard.");
      return;
    }

    if (args.tsv) {
      console.log(toTsv(reportTable));
      return;
    }

    console.log(renderCliTable(reportTable));
  });
}

async function fetchCsvImportCategoryData(actualApi) {
  const categoriesResult = await actualApi.runQuery(
    actualApi.q("categories").filter({ tombstone: false }).select("*"),
  );

  return {
    categories: extractQueryData(categoriesResult),
  };
}

async function commandCsvImport(args) {
  await withActual(async ({ actualApi }) => {
    const [accounts, dateFormat, csvText, categoryData] = await Promise.all([
      actualApi.getAccounts(),
      fetchBudgetDateFormat(actualApi),
      readFile(args.csvPath, "utf8"),
      args.importCategory
        ? fetchCsvImportCategoryData(actualApi)
        : Promise.resolve(null),
    ]);
    const account = resolveImportAccount(accounts, args.account);
    const transactions = parseCsvImportToImportTransactions(csvText, {
      accountId: account.id,
      dateFormat,
      includeImportId: args.includeImportId,
      rawImportedPayee: args.rawImportedPayee,
      categoryResolver: categoryData
        ? buildCsvImportCategoryResolver({
            ...categoryData,
            keepUnresolved: true,
          })
        : null,
    });

    if (args.json) {
      console.log(JSON.stringify(transactions, null, 2));
      return;
    }

    const result = await actualApi.importTransactions(account.id, transactions, {
      defaultCleared: true,
      dryRun: args.dryRun,
    });

    if (!args.dryRun) {
      await actualApi.sync();
    }

    console.log(
      renderImportResult({
        account: {
          id: account.id,
          name: account.name ?? "?",
        },
        mapped: transactions.length,
        dryRun: args.dryRun,
        result,
      }),
    );
  });
}

async function commandQifImport(args) {
  await withActual(async ({ actualApi }) => {
    const accounts = await actualApi.getAccounts();
    const account = resolveImportAccount(accounts, args.account);
    const dateFormat = await fetchBudgetDateFormat(actualApi);
    const parseResult = await actualApi.internal.send("transactions-parse-file", {
      filepath: args.qifPath,
      options: {
        importNotes: args.importNotes || args.swapPayeeAndMemo,
        swapPayeeAndMemo: args.swapPayeeAndMemo,
      },
    });

    if (parseResult?.errors?.length > 0) {
      fail(parseResult.errors.map((error) => error.message).join(" "));
    }

    const transactions = normalizeParsedQifTransactions(
      parseResult?.transactions ?? [],
      {
        dateFormat,
        amountToInteger: actualApi.internal.amountToInteger,
      },
    );

    if (args.json) {
      console.log(JSON.stringify(transactions, null, 2));
      return;
    }

    const result = await actualApi.internal.send("transactions-import", {
      accountId: account.id,
      transactions,
      isPreview: args.dryRun,
      opts: { reimportDeleted: false },
    });

    if (!args.dryRun) {
      await actualApi.sync();
    }

    console.log(
      renderImportResult({
        account: {
          id: account.id,
          name: account.name ?? "?",
        },
        mapped: transactions.length,
        dryRun: args.dryRun,
        result,
      }),
    );
  });
}

async function main() {
  const program = buildProgram();
  if (process.argv.length <= 2) {
    program.outputHelp();
    return;
  }
  await program.parseAsync(process.argv);
}

await main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
