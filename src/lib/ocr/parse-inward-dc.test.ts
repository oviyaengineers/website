import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanComponentName, parseInwardDc } from "./parse-inward-dc.ts";

// The real master list. These are the only names a scan may ever resolve to.
const COMPONENTS = [
  "3P DN25FB/32RB CF8M Body Casting REV 2",
  "3P DN40FB/50RB CF8M Body Casting REV 2",
  "3P DN50RB CF8M #150 Flg Connector Casting",
];

function parse(lines: string[]) {
  return parseInwardDc(lines.join("\n"), {
    customers: [],
    components: COMPONENTS,
    materials: ["CF8M", "A105", "WCB"],
  });
}

/**
 * A boxed challan as Tesseract actually returns it: the captions come through
 * as one column and their values as another, so a value sits several lines
 * below its own label.
 */
const BOXED_HEADER = [
  "MOREIND AUTOMATION PRIVATE LIMITED",
  "D.C. No.",
  "Date",
  "MOR/2526/0123",
  "10/09/2026",
];

test("reads the customer DC number from the column below its label", () => {
  const result = parse(BOXED_HEADER);
  assert.equal(result.customerDcNumber, "MOR/2526/0123");
  assert.equal(result.customerDcDate, "2026-09-10");
});

test("never stores a neighbouring caption as the DC number", () => {
  // DC-2026-0001 was saved with the literal word "Date" as the customer's
  // reference, because the line after the label was the next cell's caption.
  const result = parse(["D.C. No.", "Date", "Delivery Challan"]);
  assert.equal(result.customerDcNumber, null);
});

test("a table border does not become part of the part name", () => {
  const result = parse([
    ...BOXED_HEADER,
    "Sl No. Product Description Quantity",
    "| 1 3P DN40FB/50RB CF8M Body Casting REV 2",
    "200.000 EA",
  ]);
  assert.deepEqual(
    result.items.map((item) => item.component),
    ["3P DN40FB/50RB CF8M Body Casting REV 2"]
  );
  assert.deepEqual(result.newComponents, []);
});

test("a misread resolves to the listed part rather than creating a new one", () => {
  // "DN50RB" comes back as "DNSORB" and "Flg" as "Fig" on almost every scan.
  const result = parse([
    ...BOXED_HEADER,
    "Sl No. Product Description Quantity",
    "| 2 3P DNSORB CF8M #150 Fig Connector Casting",
    "400.000 EA",
  ]);
  assert.deepEqual(
    result.items.map((item) => item.component),
    ["3P DN50RB CF8M #150 Flg Connector Casting"]
  );
  assert.deepEqual(result.newComponents, []);
});

test("two similar parts on one challan stay distinct", () => {
  const result = parse([
    ...BOXED_HEADER,
    "Sl No. Product Description Quantity",
    "1 3P DN25FB/32RB CF8M Body Casting REV 2",
    "2 3P DN40FB/50RB CF8M Body Casting REV 2",
    "284.000 EA",
    "90.000 EA",
  ]);
  assert.deepEqual(
    result.items.map((item) => [item.component, item.received_qty]),
    [
      ["3P DN25FB/32RB CF8M Body Casting REV 2", 284],
      ["3P DN40FB/50RB CF8M Body Casting REV 2", 90],
    ]
  );
});

test("cleanComponentName strips borders and refuses what is not a part name", () => {
  assert.equal(
    cleanComponentName("| 1 3P DN40FB/50RB CF8M Body Casting REV 2"),
    "3P DN40FB/50RB CF8M Body Casting REV 2"
  );
  assert.equal(cleanComponentName("Date"), null);
  assert.equal(cleanComponentName("|||"), null);
  assert.equal(cleanComponentName("200.000 EA"), null);
});
