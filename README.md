# actual budget cli

CLI for working with [Actual Budget](actual.md).

## Install

Install globally with npm:

```bash
npm install -g abctl
```

Or run it without installing:

```bash
npx abctl --help
```

## Usage

```bash
Usage: abctl [options] [command]

Actual budget helper commands.

Options:
  -h, --help                    display help for command

Commands:
  budgets                       List budgets and their sync ids.
  accounts                      List accounts and their current balances.
  uncategorized                 List uncategorized transactions across all accounts.
  transactions|txns [options] <account>
                                List transactions for an account.
  make-transfer|transfer [options]
                                Find uncategorized transfer pairs and link them.
  find <payee> <txn-date>       Find transactions by exact payee name and date.
  split [options] <entries...>  Split a transaction into sub-transactions.
  report [options] <name>       Render a custom report by name.
  qif-import [options] <account> <qif-path>
                                Import a QIF file into an Actual account.
  csv-import [options] <account> <csv-path>
                                Import a generic CSV into an Actual account.
  help [command]                display help for command

Environment:
  ACTUAL_PASSWORD        Required.
  ACTUAL_SYNC_ID         Optional. Budget name, groupId, or cloudFileId. Defaults to the first available budget.
  ACTUAL_SERVER_URL      Optional. Defaults to http://localhost:5007
  ACTUAL_DATA_DIR        Optional. Defaults to /tmp/actual
```

For `split`, express `<entries...>` as repeated triplets:

```bash
<notes> <category> <amount> [<notes> <category> <amount> ...]
```

Example:

```bash
abctl split --transaction-id abc123 "Groceries run" "Food" -45.60 "Petrol" "Transport" -30
```

If the split amounts do not add up, you can append the exact remainder as one extra split using the parent transaction category:

```bash
abctl split --add-remainder-split --transaction-id abc123 "Agent fees" "Expenses" -90
```

## Transactions

List all transactions for an account:

```bash
abctl transactions "Everyday Checking"
# or
abctl txns "Everyday Checking"
```

Limit the listing to a date range:

```bash
abctl transactions "Everyday Checking" --start 2026-04-01 --end 2026-04-30
# or using the budget date format
abctl txns "Everyday Checking" --start 01/04/2026 --end 30/04/2026
```

`--start` and `--end` accept either `YYYY-MM-DD` or your budget date format.

Output tab-separated text instead of the terminal table:

```bash
abctl transactions "Everyday Checking" --tsv
```

`<account>` may be either the Actual account id or account name. Matching prefers exact id, then exact name, then unique case-insensitive name, then a unique case-insensitive substring match.

## Make Transfer

Preview uncategorized transfer candidates without writing:

```bash
abctl make-transfer --dry-run
```

Link all unambiguous uncategorized transfer pairs:

```bash
abctl make-transfer
```

The command only links pairs when there is exactly one uncategorized inflow and one uncategorized outflow with the same date and absolute amount in two different accounts. Ambiguous groups are reported and skipped.

## Split

Split by transaction id:

```bash
abctl split --transaction-id abc123 "Groceries run" "Food" -45.60 "Petrol" "Transport" -30
```

Split by exact payee and date:

```bash
abctl split --payee "Example Store" --txn-date 2026-04-05 "Groceries run" "Food" -45.60
```

`--txn-date` accepts either `YYYY-MM-DD` or your budget date format.

Each split entry is a repeated `<notes> <category> <amount>` triplet. Quote notes or category names when they contain spaces.

`find <payee> <txn-date>` also accepts either `YYYY-MM-DD` or your budget date format.

Use `--add-remainder-split` to append one extra split for any remaining difference. The extra split uses the parent transaction category, so it only works when the original transaction is already categorized.

## CSV Import

```bash
# Preview the mapped ImportTransactionEntity objects
abctl csv-import <account> path/to/import.csv --json

# Preview reconciliation without writing
abctl csv-import <account> path/to/import.csv --dry-run

# Preview/import without imported_id so Actual relies on fuzzy matching
abctl csv-import <account> path/to/import.csv --dry-run --no-import-id

# Preview/import categories from the Category column when they match Actual categories
abctl csv-import <account> path/to/import.csv --dry-run --import-category

# Import the CSV into an account
abctl csv-import <account> path/to/import.csv
```

The CSV must contain these headers:

- `Date`
- `Payee`
- `Notes`
- `Debit`
- `Credit`

Optional headers:

- `Balance`
- `Category`
- `SubCategory`

`Date` accepts either `YYYY-MM-DD` or your budget date format. `Debit` and `Credit` must be non-negative amounts without signs. `Notes` are imported into transaction notes, but are not included in `imported_id`. When `Balance` is present, it is used to strengthen row uniqueness and `imported_id` stability.

Use `--no-import-id` to omit `imported_id` entirely and rely on Actual's fuzzy matching instead. This mimics how imports via the UI work.

Use `--import-category` to map `Category` values to existing Actual category names and include the matched category id in reconciliation. `SubCategory` is accepted as a CSV column but ignored, category matching is exact and case-sensitive, and category ids are not resolved. Unresolved category text is sent as-is in both previews and real imports so CLI final import follows the same category behavior as CLI dry-run. Categories are not created automatically.

`<account>` may be either the Actual account id or account name. Matching prefers exact id, then exact name, then unique case-insensitive name, then a unique case-insensitive substring match. If the match is ambiguous, the command fails and asks you to use the id.

## QIF Import

Preview the parsed transactions returned by Actual:

```bash
abctl qif-import <account> path/to/file.qif --json
```

Preview reconciliation without writing:

```bash
abctl qif-import <account> path/to/file.qif --dry-run
```

Import the QIF into an account:

```bash
abctl qif-import <account> path/to/file.qif
```

Optional flags:

- `--import-notes` keeps the QIF memo field as Actual notes.
- `--swap-payee-and-memo` uses the QIF memo field as the payee before optional note import.

`<account>` may be either the Actual account id or account name. Matching prefers exact id, then exact name, then unique case-insensitive name, then a unique case-insensitive substring match. If the match is ambiguous, the command fails and asks you to use the id.
