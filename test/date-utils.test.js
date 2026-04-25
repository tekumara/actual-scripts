import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDateInput } from "../src/date-utils.js";

test("normalizeDateInput accepts ISO dates unchanged", () => {
  assert.equal(normalizeDateInput("2026-04-05", { dateFormat: "DD/MM/YYYY" }), "2026-04-05");
});

test("normalizeDateInput parses dates using the budget date format", () => {
  assert.equal(normalizeDateInput("05/04/2026", { dateFormat: "DD/MM/YYYY" }), "2026-04-05");
  assert.equal(normalizeDateInput("04/05/2026", { dateFormat: "MM/DD/YYYY" }), "2026-04-05");
  assert.equal(normalizeDateInput("05.04.2026", { dateFormat: "DD.MM.YYYY" }), "2026-04-05");
});

test("normalizeDateInput rejects values that match neither ISO nor budget date format", () => {
  assert.throws(
    () => normalizeDateInput("20260405", { dateFormat: "DD/MM/YYYY" }),
    /Expected YYYY-MM-DD or DD\/MM\/YYYY\./,
  );
});
