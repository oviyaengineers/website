import assert from "node:assert/strict";
import { test } from "node:test";
import { financialYearLabel, previewDcNumber } from "./dc-numbering.ts";

test("the financial year turns over in April, not January", () => {
  assert.equal(financialYearLabel(new Date("2026-04-01")), "26-27");
  assert.equal(financialYearLabel(new Date("2026-09-11")), "26-27");
  assert.equal(financialYearLabel(new Date("2027-03-31")), "26-27");
  // A challan raised on 1 April belongs to the new year, the day before to the old.
  assert.equal(financialYearLabel(new Date("2026-03-31")), "25-26");
  assert.equal(financialYearLabel(new Date("2027-04-01")), "27-28");
});

test("a number prints as the year and a padded serial", () => {
  assert.equal(
    previewDcNumber({ prefix: "", fy_label: "26-27", padding: 3, next_serial: 1 }),
    "26-27-001"
  );
  assert.equal(
    previewDcNumber({ prefix: "", fy_label: "26-27", padding: 3, next_serial: 142 }),
    "26-27-142"
  );
});

test("a serial wider than the padding is not truncated", () => {
  // Losing a digit would issue a duplicate number, so padding only ever pads.
  assert.equal(
    previewDcNumber({ prefix: "", fy_label: "26-27", padding: 3, next_serial: 1234 }),
    "26-27-1234"
  );
});

test("a prefix goes before the year", () => {
  assert.equal(
    previewDcNumber({ prefix: "OE/", fy_label: "26-27", padding: 3, next_serial: 7 }),
    "OE/26-27-007"
  );
});
