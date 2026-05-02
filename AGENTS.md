# AGENTS.md

Guidance for coding agents working in this repository.

## Project overview

- `abctl` is a **Node.js ESM CLI** for working with **Actual Budget**.
- The executable entrypoint is `src/cli.js` and is wired through `package.json`:
  - `"bin": { "abctl": "src/cli.js" }`
- This repo is implemented in **plain JavaScript**.
  - Do **not** look for Go, Rust, or TypeScript entrypoints.

## Where to start

For most CLI changes, start here in order:

1. `src/cli.js`
   - command registration
   - option parsing
   - shared wiring into command handlers
2. `src/<feature>.js`
   - command implementation for the feature you are changing
3. `test/<feature>.test.js`
   - the fastest way to learn existing behavior and add coverage
4. `README.md`
   - user-facing usage examples and docs

## Code map

### CLI wiring

- `src/cli.js`
  - contains `buildProgram()`
  - registers Commander commands and flags
  - passes parsed options into command modules

### Command implementations

- `src/accounts.js` — accounts listing
- `src/transactions.js` — transactions listing
- `src/uncategorized.js` — uncategorized transaction listing
- `src/transfer.js` — transfer matching/linking
- `src/split.js` — split transaction workflow
- `src/qif.js` — QIF import parsing/normalization

### Shared helpers

- `src/table-rendering.js`
  - `renderCliTable(reportTable)` — terminal table output
  - `toTsv(reportTable)` — tab-separated output
  - `toHtml(reportTable)` — rich-text/clipboard HTML path
- `src/reporting.js` — report-building helpers and formatting
- `src/date-utils.js` — date normalization and parsing
- `src/preferences.js` — budget preference access, including date format
- `src/import-account.js` — account resolution by id/name/substr
- `src/transaction-data.js` — transaction normalization helpers

### Tests

- `test/*.test.js` — unit tests
- `test/*.smoke.test.js` — disposable-budget smoke/integration tests
- `test/fixtures/` — synthetic fixtures used by tests

## Common implementation patterns

### Adding or changing a CLI option

When adding a new flag to an existing command:

1. Add the option in `buildProgram()` in `src/cli.js`
2. Pass the parsed value into the command handler args
3. Reuse existing shared helpers where possible
4. Add or update tests in `test/<feature>.test.js`
5. Update `README.md`

### Adding a new table output mode

Check `src/table-rendering.js` first.

Existing output helpers:
- terminal table: `renderCliTable()`
- TSV: `toTsv()`
- HTML: `toHtml()`

Before inventing a new rendering path, look for an existing command that already does something similar and copy its pattern.

### Dates

If a command accepts user-supplied dates:
- use `normalizeDateInput()` from `src/date-utils.js`
- respect the budget date format from `src/preferences.js`
- keep CLI help text explicit about accepted formats

### Account selection

If a command accepts an account argument:
- use `resolveImportAccount()` from `src/import-account.js`
- preserve the existing matching behavior documented in help text and README

## Testing workflow

Run all unit tests:

```bash
npm test
```

Run smoke tests:

```bash
npm run smoke:transfer
npm run smoke:qif
npm run smoke:split
```

Write-enabled smoke variants:

```bash
npm run smoke:transfer:write
npm run smoke:qif:write
```

Notes:
- smoke tests may be gated by environment variables
- `smoke:split` writes to a disposable budget because split has no dry-run mode

## Documentation expectations

For user-visible CLI changes, update both:
- tests
- `README.md`

If you add a new flag, include at least one concrete command example in the README.

## Commit conventions

Use short conventional commit messages with the affected module as the scope:
- `feat(<module>): ...` for user-visible features or new CLI capabilities
- `fix(<module>): ...` for bug fixes or behavior corrections
- `docs(<module>): ...` for documentation-only changes
- `test(<module>): ...` for test-only changes
- `refactor(<module>): ...` for internal restructures without behavior changes
- `chore(<module>): ...` for maintenance tasks

Style:
- keep the summary in imperative mood
- keep it specific to the change
- prefer lowercase after the colon
- include the most relevant module in the scope, such as `transactions`, `csv-import`, `qif`, `split`, or `cli`

Examples:
- `feat(transactions): add --tsv output for transactions list`
- `fix(split): respect budget date format in split lookup`
- `docs(transactions): document --tsv output`

## Practical tips for agents

- Prefer reading `src/cli.js` before broad repo-wide searching when the task mentions a CLI command.
- Prefer reading the corresponding test file early; tests in this repo are often the clearest behavior spec.
- Reuse existing helpers instead of duplicating formatting or parsing logic.
- Keep changes small and consistent with the existing module-per-command structure.
