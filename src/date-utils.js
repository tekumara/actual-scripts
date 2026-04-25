function fail(message) {
  throw new Error(message);
}

export function parseIsoDate(value) {
  const raw = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    fail(`Invalid date ${JSON.stringify(value)}. Expected YYYY-MM-DD.`);
  }

  const [year, month, day] = raw.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    fail(`Invalid date ${JSON.stringify(value)}.`);
  }

  return parsed;
}

export function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(isoDate, days) {
  const parsed = parseIsoDate(isoDate);
  parsed.setDate(parsed.getDate() + days);
  return formatIsoDate(parsed);
}
