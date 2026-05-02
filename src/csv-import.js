import { normalizeDateInput } from "./date-utils.js";

const REQUIRED_HEADERS = ["Date", "Payee", "Notes", "Debit", "Credit"];
const OPTIONAL_HEADERS = ["Balance", "Category", "SubCategory"];
const CANONICAL_HEADERS = new Map(
  [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS].map((header) => [header.toLowerCase(), header]),
);

function fail(message) {
  throw new Error(message);
}

function normalizeHeader(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

function trimToUndefined(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

function trimRequired(value, lineNumber, fieldName) {
  const trimmed = trimToUndefined(value);
  if (!trimmed) {
    fail(`Missing ${fieldName} value on CSV line ${lineNumber}.`);
  }
  return trimmed;
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      row.push(current);
      current = "";

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];

      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  if (inQuotes) {
    fail("Invalid CSV: unterminated quoted field.");
  }

  return rows;
}

function parseRequiredHeaders(headers) {
  for (const requiredHeader of REQUIRED_HEADERS) {
    if (!headers.includes(requiredHeader)) {
      fail(`Missing required CSV column ${JSON.stringify(requiredHeader)}.`);
    }
  }
}

function parseCsvAmount(value, lineNumber, fieldName) {
  const raw = String(value ?? "").trim();
  if (raw === "") {
    return null;
  }

  const normalized = raw.replace(/,/g, "").replace(/^\$/, "");
  const match = /^(?:(\d+)(?:\.(\d{1,2}))?|\.(\d{1,2}))$/.exec(normalized);
  if (!match) {
    fail(
      `Invalid ${fieldName} amount ${JSON.stringify(value)} on CSV line ${lineNumber}. Use a non-negative amount without signs.`,
    );
  }

  const [, wholePart = "0", fractionPart = "", leadingDecimalFraction = ""] = match;
  const fraction = (fractionPart || leadingDecimalFraction).padEnd(2, "0");
  return Number(wholePart) * 100 + Number(fraction);
}

function parseCsvImportDate(value, lineNumber, { dateFormat } = {}) {
  try {
    return normalizeDateInput(value, { dateFormat });
  } catch {
    fail(`Invalid CSV date ${JSON.stringify(value)} on line ${lineNumber}.`);
  }
}

function transactionAmountFromRow(row) {
  const debit = parseCsvAmount(row.Debit, row.__line, "Debit");
  const credit = parseCsvAmount(row.Credit, row.__line, "Credit");

  const hasDebit = debit !== null;
  const hasCredit = credit !== null;
  const nonZeroDebit = hasDebit && debit !== 0;
  const nonZeroCredit = hasCredit && credit !== 0;

  if (nonZeroDebit && nonZeroCredit) {
    fail(`CSV line ${row.__line} has both Debit and Credit populated.`);
  }

  if (nonZeroCredit) {
    return credit;
  }
  if (nonZeroDebit) {
    return -debit;
  }
  if (hasCredit) {
    return credit;
  }
  if (hasDebit) {
    return -debit;
  }
  return 0;
}

function importedIdFingerprintParts(row, isoDate) {
  const parts = [
    "csv",
    isoDate,
    String(row.Payee ?? "").trim(),
    String(row.Debit ?? "").trim(),
    String(row.Credit ?? "").trim(),
  ];
  const balance = trimToUndefined(row.Balance);
  if (balance) {
    parts.push(balance);
  }
  return parts;
}

function buildImportedId(fingerprintParts, occurrence) {
  const parts = [...fingerprintParts];
  if (occurrence > 1) {
    parts.push(`dup:${occurrence}`);
  }
  return parts.join("|");
}

function isTombstoned(value) {
  return value === true || value === 1 || value === "1";
}

export function buildCsvImportCategoryResolver({ categories = [] } = {}) {
  const liveCategories = categories.filter((category) => !isTombstoned(category.tombstone));

  return (row) => {
    const categoryName = trimToUndefined(row.Category);
    if (!categoryName) {
      return undefined;
    }

    let match = null;
    for (const category of liveCategories) {
      // Match Actual UI import behavior: category ids are not accepted here;
      // only exact category-name matches are resolved.
      if (category.id === categoryName) {
        continue;
      }
      if (category.name === categoryName) {
        match = category.id;
      }
    }

    return match ?? undefined;
  };
}

export function parseCsvImport(text) {
  const rows = parseCsv(String(text ?? ""));
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => {
    const normalized = normalizeHeader(header);
    return CANONICAL_HEADERS.get(normalized.toLowerCase()) ?? normalized;
  });
  parseRequiredHeaders(headers);

  return rows.slice(1).map((columns, index) => {
    const row = Object.fromEntries(
      headers.map((header, columnIndex) => [header, columns[columnIndex] ?? ""]),
    );
    row.__line = index + 2;
    return row;
  });
}

export function mapCsvImportRowsToImportTransactions(
  rows,
  { accountId, dateFormat = null, includeImportId = true, categoryResolver = null } = {},
) {
  const normalizedAccountId = String(accountId ?? "").trim();
  if (!normalizedAccountId) {
    fail("accountId is required to build Actual import transactions.");
  }

  const occurrences = new Map();

  return rows.map((row) => {
    const date = parseCsvImportDate(row.Date, row.__line, { dateFormat });
    const payeeName = trimRequired(row.Payee, row.__line, "Payee");
    const notes = trimToUndefined(row.Notes);
    const amount = transactionAmountFromRow(row);
    const category = categoryResolver ? trimToUndefined(categoryResolver(row)) : undefined;
    const fingerprintParts = importedIdFingerprintParts(row, date);
    const fingerprint = fingerprintParts.join("|");
    const occurrence = (occurrences.get(fingerprint) ?? 0) + 1;
    occurrences.set(fingerprint, occurrence);

    const transaction = {
      account: normalizedAccountId,
      date,
      amount,
      payee_name: payeeName,
      imported_payee: payeeName,
    };

    if (includeImportId) {
      transaction.imported_id = buildImportedId(fingerprintParts, occurrence);
    }

    if (category) {
      transaction.category = category;
    }

    if (notes) {
      transaction.notes = notes;
    }

    return transaction;
  });
}

export function parseCsvImportToImportTransactions(text, options = {}) {
  return mapCsvImportRowsToImportTransactions(parseCsvImport(text), options);
}
