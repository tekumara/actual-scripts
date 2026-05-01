import { formatAmount } from "./reporting.js";
import { renderCliTable } from "./table-rendering.js";

function makeRow(cells, { bold = false } = {}) {
  return {
    cells: cells.map((cell) => String(cell ?? "")),
    bold,
  };
}

export function buildImportSummaryTable({ account, mapped, dryRun, result }) {
  return {
    title: dryRun ? "Import preview" : "Import result",
    subtitle: `${account.name ?? "?"} (${account.id})`,
    columns: [
      { label: "Metric", align: "left" },
      { label: "Count", align: "right" },
    ],
    rows: [
      makeRow(["Mapped transactions", mapped]),
      makeRow(["Added transactions", result.added.length]),
      makeRow(["Errors", result.errors.length]),
      makeRow(["Updated", result.updated.length]),
      makeRow(["Preview matches", result.updatedPreview.length]),
    ],
  };
}

export function buildPreviewMatchesTable(result) {
  return {
    title: "Preview matches",
    columns: [
      { label: "Date", align: "left" },
      { label: "Imported payee", align: "left" },
      { label: "Amount", align: "right" },
      { label: "Ignored", align: "left" },
    ],
    rows: result.updatedPreview.map((entry) =>
      makeRow([
        entry.transaction?.date ?? "",
        entry.transaction?.imported_payee ?? entry.transaction?.payee_name ?? "",
        typeof entry.transaction?.amount === "number"
          ? formatAmount(entry.transaction.amount)
          : "",
        entry.ignored ? "true" : "false",
      ]),
    ),
  };
}

function renderErrors(errors) {
  if (!errors || errors.length === 0) {
    return "";
  }

  return ["Errors", ...errors.map((error) => `- ${error.message}`)].join("\n");
}

export function renderImportResult({ account, mapped, dryRun, result }) {
  const sections = [renderCliTable(buildImportSummaryTable({ account, mapped, dryRun, result }))];

  if (result.updatedPreview.length > 0) {
    sections.push(renderCliTable(buildPreviewMatchesTable(result)));
  }

  const errorSection = renderErrors(result.errors);
  if (errorSection) {
    sections.push(errorSection);
  }

  return sections.join("\n\n");
}
