import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkCombinedSelection,
  combinedQrMode,
  combinedLayoutOptions,
  combinedRows,
  MAX_FULL_LINES,
  MAX_HALF_LINES,
  NORMAL_MAX_LINES,
  QR_MAX_SOURCE_DCS,
  resolveCombinedLayout,
  type CombinedDc,
  type CombinedLine,
} from "@/lib/dc-combined-print";

const MOREIND = "c-moreind";
const OTHER = "c-other";

function dc(id: string, number: string, over: Partial<CombinedDc> = {}): CombinedDc {
  return {
    id,
    dc_number: number,
    dc_date: "2026-09-15",
    customer_id: MOREIND,
    status: "active",
    customer_dc_number: [`REF-${number}`],
    ...over,
  };
}

function line(id: string, dcId: string, over: Partial<CombinedLine> = {}): CombinedLine {
  return {
    id,
    dc_id: dcId,
    sort_order: 0,
    component: "Shaft",
    component_id: null,
    material: "SS304",
    received_qty: 100,
    sent_qty: 100,
    material_problem_qty: 0,
    rejection_qty: 0,
    total_qty: 100,
    ...over,
  };
}

test("one, two and three DCs of one customer on one date can be printed together", () => {
  const a = dc("a", "26-27-021");
  const b = dc("b", "26-27-022");
  const c = dc("c", "26-27-023");
  assert.equal(checkCombinedSelection(["a"], [a]), null);
  assert.equal(checkCombinedSelection(["a", "b"], [a, b]), null);
  assert.equal(checkCombinedSelection(["a", "b", "c"], [a, b, c]), null);
});

test("there is no fixed limit on how many DCs can be selected", () => {
  const many = Array.from({ length: 10 }, (_, i) => dc(`d${i}`, `26-27-${100 + i}`));
  assert.equal(
    checkCombinedSelection(
      many.map((d) => d.id),
      many
    ),
    null
  );
});

test("different customers are never combined", () => {
  assert.equal(
    checkCombinedSelection(
      ["a", "b"],
      [dc("a", "26-27-021"), dc("b", "26-27-022", { customer_id: OTHER })]
    ),
    "customers"
  );
});

test("the same customer on different dates is not combined", () => {
  assert.equal(
    checkCombinedSelection(
      ["a", "b"],
      [dc("a", "26-27-021"), dc("b", "26-27-022", { dc_date: "2026-09-16" })]
    ),
    "dates"
  );
});

test("draft DCs cannot be part of a combined print", () => {
  assert.equal(
    checkCombinedSelection(
      ["a", "b"],
      [dc("a", "26-27-021"), dc("b", "26-27-022", { status: "draft" })]
    ),
    "draft"
  );
});

test("an empty or partly missing selection is refused", () => {
  assert.equal(checkCombinedSelection([], []), "none");
  assert.equal(checkCombinedSelection(["a", "gone"], [dc("a", "26-27-021")]), "missing");
});

test("one row per source DC line, even when component and material are the same", () => {
  const dcs = [dc("c", "26-27-023"), dc("a", "26-27-021"), dc("b", "26-27-022")];
  const lines = [
    line("l3", "c", { sent_qty: 200, total_qty: 200 }),
    line("l1", "a", { sent_qty: 100, total_qty: 100 }),
    line("l2", "b", { sent_qty: 150, total_qty: 150 }),
  ];
  const rows = combinedRows(dcs, lines);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => [r.dcNumber, r.component, r.material, r.sent_qty]),
    [
      ["26-27-021", "Shaft", "SS304", 100],
      ["26-27-022", "Shaft", "SS304", 150],
      ["26-27-023", "Shaft", "SS304", 200],
    ]
  );
});

test("every row keeps its own source DC and customer DC number", () => {
  const dcs = [
    dc("a", "26-27-021"),
    dc("b", "26-27-022", { customer_dc_number: ["ABC002", "ABC003"] }),
  ];
  const rows = combinedRows(dcs, [line("l1", "a"), line("l2", "b")]);
  assert.deepEqual(
    rows.map((r) => [r.dcNumber, r.customerDcNumbers]),
    [
      ["26-27-021", ["REF-26-27-021"]],
      ["26-27-022", ["ABC002", "ABC003"]],
    ]
  );
});

test("lines follow DC number order, then each DC's own line order", () => {
  const dcs = [dc("b", "26-27-022"), dc("a", "26-27-021")];
  const rows = combinedRows(dcs, [
    line("b2", "b", { sort_order: 1, component: "B2" }),
    line("a1", "a", { sort_order: 0, component: "A1" }),
    line("b1", "b", { sort_order: 0, component: "B1" }),
  ]);
  assert.deepEqual(
    rows.map((r) => r.component),
    ["A1", "B1", "B2"]
  );
});

test("only lines that moved are printed, and quantities are passed through unchanged", () => {
  const rows = combinedRows(
    [dc("a", "26-27-021")],
    [
      line("moved", "a", {
        received_qty: 90,
        sent_qty: 7,
        material_problem_qty: 2,
        rejection_qty: 1,
        total_qty: 10,
      }),
      line("idle", "a", {
        received_qty: 90,
        sent_qty: 0,
        material_problem_qty: 0,
        rejection_qty: 0,
        total_qty: 0,
      }),
    ]
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(
    [
      rows[0].received_qty,
      rows[0].sent_qty,
      rows[0].material_problem_qty,
      rows[0].rejection_qty,
      rows[0].total_qty,
    ],
    [90, 7, 2, 1, 10]
  );
});

test("no balance figure is added to a printed row", () => {
  const [row] = combinedRows([dc("a", "26-27-021")], [line("l1", "a")]);
  assert.ok(!Object.keys(row).some((key) => /balance|pending|remaining/i.test(key)));
});

test("component names can be resolved to their current spelling", () => {
  const [row] = combinedRows(
    [dc("a", "26-27-021")],
    [line("l1", "a", { component: "old" })],
    () => "Current"
  );
  assert.equal(row.component, "Current");
});

test("labelled QR codes for up to three DCs, a Source DCs list for four or more", () => {
  assert.equal(QR_MAX_SOURCE_DCS, 3);
  assert.equal(combinedQrMode(1), "qr");
  assert.equal(combinedQrMode(3), "qr");
  assert.equal(combinedQrMode(4), "list");
  assert.equal(combinedQrMode(10), "list");
});

test("three or fewer source lines always use Original + Duplicate on one A4 page", () => {
  assert.equal(NORMAL_MAX_LINES, 3);
  for (const lines of [1, 2, 3]) {
    const options = combinedLayoutOptions(lines);
    assert.equal(options.choose, false);
    assert.equal(options.defaultLayout, "half");
    assert.equal(resolveCombinedLayout("full", lines), "half");
  }
});

test("more than three source lines offer a layout choice, recommending full pages", () => {
  const options = combinedLayoutOptions(4);
  assert.equal(options.choose, true);
  assert.equal(options.defaultLayout, "full");
  assert.equal(resolveCombinedLayout(undefined, 4), "full");
  assert.equal(resolveCombinedLayout("full", 4), "full");
});

test("the same-page layout is offered for long selections only while it can fit", () => {
  assert.ok(MAX_HALF_LINES > NORMAL_MAX_LINES);
  assert.equal(combinedLayoutOptions(MAX_HALF_LINES).halfFits, true);
  assert.equal(resolveCombinedLayout("half", MAX_HALF_LINES), "half");
  assert.equal(combinedLayoutOptions(MAX_HALF_LINES + 1).halfFits, false);
  // Asking for the half page when it cannot fit falls back to full pages.
  assert.equal(resolveCombinedLayout("half", MAX_HALF_LINES + 1), "full");
});

test("full pages hold far more lines, and past that the print is refused", () => {
  assert.ok(MAX_FULL_LINES > MAX_HALF_LINES);
  assert.equal(combinedLayoutOptions(MAX_FULL_LINES).fullFits, true);
  assert.equal(combinedLayoutOptions(MAX_FULL_LINES + 1).fullFits, false);
});
