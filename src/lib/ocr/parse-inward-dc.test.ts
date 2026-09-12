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

test("a neighbouring column does not end up inside the part name", () => {
  // The row arrives as one line, so whatever sat beside the Product
  // Description cell — an HSN code, a quantity, a unit — comes with it.
  assert.equal(
    cleanComponentName("3P DN40FB/50RB CF8M Body Casting REV 2 84819090"),
    "3P DN40FB/50RB CF8M Body Casting REV 2"
  );
  assert.equal(
    cleanComponentName("3P DN40FB/50RB CF8M Body Casting REV 2 200.000 EA"),
    "3P DN40FB/50RB CF8M Body Casting REV 2"
  );
  assert.equal(
    cleanComponentName("| 1 3P DN40FB/50RB CF8M Body Casting REV 2 84819090 200.000 EA"),
    "3P DN40FB/50RB CF8M Body Casting REV 2"
  );
});

test("a revision number at the end of a name survives", () => {
  // The reason the stripper refuses bare integers: every one of these parts
  // ends in one, and cutting it would rename the casting.
  assert.equal(
    cleanComponentName("3P DN25FB/32RB CF8M Body Casting REV 2"),
    "3P DN25FB/32RB CF8M Body Casting REV 2"
  );
  assert.equal(
    cleanComponentName("3P DN50RB CF8M #150 Flg Connector Casting"),
    "3P DN50RB CF8M #150 Flg Connector Casting"
  );
});

test("a row with its columns run together still matches the listed part", () => {
  const result = parse([
    ...BOXED_HEADER,
    "Sl No. Product Description HSN Quantity",
    "1 3P DN40FB/50RB CF8M Body Casting REV 2 84819090 200.000 EA",
  ]);
  assert.deepEqual(
    result.items.map((item) => [item.component, item.received_qty]),
    [["3P DN40FB/50RB CF8M Body Casting REV 2", 200]]
  );
  assert.deepEqual(result.newComponents, []);
});

test("the terms printed under the table never become components", () => {
  // Both of these were offered as new component names on a real scan.
  assert.equal(
    cleanComponentName("per LT V norms 10% of Inspection Report need to be submitted"),
    null
  );
  assert.equal(
    cleanComponentName("5% of debit will be charged in non submission of inspection report"),
    null
  );
  assert.equal(cleanComponentName("Subject to Coimbatore jurisdiction"), null);
});

test("a scan of a challan with printed terms yields only the parts", () => {
  const result = parse([
    ...BOXED_HEADER,
    "Sl No. Product Description Quantity",
    "1 3P DN40FB/50RB CF8M Body Casting REV 2",
    "200.000 EA",
    "per LT V norms 10% of Inspection Report need to be submitted",
    "5% of debit will be charged in non submission of inspection report",
  ]);
  assert.deepEqual(
    result.items.map((item) => item.component),
    ["3P DN40FB/50RB CF8M Body Casting REV 2"]
  );
  assert.deepEqual(
    result.newComponents.map((c) => c.name),
    []
  );
});

test("a doubled digit folds onto the listed part", () => {
  // "DN50RB" comes back as "DN5500RB". It is the same casting.
  const result = parse([
    ...BOXED_HEADER,
    "Sl No. Product Description Quantity",
    "1 3P DN5500RB CF8M #150 Flg Connector Casting",
    "400.000 EA",
  ]);
  assert.deepEqual(
    result.items.map((item) => item.component),
    ["3P DN50RB CF8M #150 Flg Connector Casting"]
  );
  assert.deepEqual(result.newComponents, []);
});

test("collapsing digits never merges two different castings", () => {
  // The guard this could have weakened: these two differ only in their
  // numbers, and recording one as the other would be far worse than
  // failing to match at all.
  const result = parse([
    ...BOXED_HEADER,
    "Sl No. Product Description Quantity",
    "1 3P DN25FB/32RB CF8M Body Casting REV 2",
    "2 3P DN40FB/50RB CF8M Body Casting REV 2",
    "10.000 EA",
    "20.000 EA",
  ]);
  assert.deepEqual(
    result.items.map((item) => [item.component, item.received_qty]),
    [
      ["3P DN25FB/32RB CF8M Body Casting REV 2", 10],
      ["3P DN40FB/50RB CF8M Body Casting REV 2", 20],
    ]
  );
});

test("nothing that cannot be a part name is offered on the review screen", () => {
  // These all appeared as "new descriptions" on real scans. The shape test
  // used to run only when storing, so they were refused at the last moment
  // yet still shown to the operator as candidates.
  const result = parse([
    "MOREIND AUTOMATION PRIVATE LIMITED",
    "D.C. No.",
    "Date",
    "ODC26-27/1018",
    "05/09/2026",
    "Sl No. Product Description Quantity",
    "1 3P DN40FB/50RB CF8M Body Casting REV 2",
    "200.000 EA",
    "1) APPROX VALUE - 22,843",
    "Terms And Conditions 8",
    "As per LT V norms 10% of Inspection Report need to be submitted",
    "5% of debit will be charged in non submission of inspection report",
  ]);
  assert.equal(result.customerDcNumber, "ODC26-27/1018");
  assert.equal(result.customerDcDate, "2026-09-05");
  assert.deepEqual(
    result.items.map((item) => [item.component, item.received_qty]),
    [["3P DN40FB/50RB CF8M Body Casting REV 2", 200]]
  );
  assert.deepEqual(result.newComponents, []);
});
