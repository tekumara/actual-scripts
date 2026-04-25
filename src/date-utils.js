function fail(message) {
  throw new Error(message);
}

function expandTwoDigitYear(year) {
  return year >= 70 ? 1900 + year : 2000 + year;
}

function normalizeDateFormat(dateFormat) {
  return typeof dateFormat === "string" && dateFormat.trim() !== ""
    ? dateFormat
    : "YYYY-MM-DD";
}

function expectedDateFormats(dateFormat) {
  const normalizedDateFormat = normalizeDateFormat(dateFormat);
  if (normalizedDateFormat === "YYYY-MM-DD") {
    return "YYYY-MM-DD";
  }
  return `YYYY-MM-DD or ${normalizedDateFormat}`;
}

function inferDateOrder(dateFormat) {
  const tokens = normalizeDateFormat(dateFormat).match(/yyyy|YYYY|yy|YY|MM|M|dd|DD|d|D/g);
  if (tokens?.length === 3) {
    const order = tokens.map((token) => token[0].toUpperCase());
    if (new Set(order).size === 3) {
      return order;
    }
  }

  return ["Y", "M", "D"];
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

export function normalizeDateInput(value, { dateFormat = null } = {}) {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    parseIsoDate(raw);
    return raw;
  }

  const segments = raw.match(/\d+/g);
  if (!segments || segments.length !== 3) {
    fail(`Invalid date ${JSON.stringify(value)}. Expected ${expectedDateFormats(dateFormat)}.`);
  }

  const order = inferDateOrder(dateFormat);
  const parts = {};
  for (let index = 0; index < order.length; index += 1) {
    parts[order[index]] = Number(segments[index]);
  }

  let year = parts.Y;
  const yearIndex = order.indexOf("Y");
  if (yearIndex >= 0 && segments[yearIndex]?.length <= 2) {
    year = expandTwoDigitYear(year);
  }

  const month = parts.M;
  const day = parts.D;
  if (![year, month, day].every(Number.isInteger)) {
    fail(`Invalid date ${JSON.stringify(value)}. Expected ${expectedDateFormats(dateFormat)}.`);
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    fail(`Invalid date ${JSON.stringify(value)}.`);
  }

  return formatIsoDate(parsed);
}

export function addDays(isoDate, days) {
  const parsed = parseIsoDate(isoDate);
  parsed.setDate(parsed.getDate() + days);
  return formatIsoDate(parsed);
}
