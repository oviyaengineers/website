import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStatement,
  statementDate,
  type StatementDc,
  type StatementItem,
} from "./customer-statement.ts";

const BODY = "c-body";
const FLG = "c-flg";
const names = new Map([
  [BODY, "3P DN40FB/50RB CF8M Body Casting REV 2"],
  [FLG, "3P DN50RB CF8M #150 Flg Connector Casting"],
]);
const rates = [
  { component_id: BODY, material: "Cf8m", rate: "18.00" },
  { component_id: FLG, material: "Cf8m", rate: 29 },
];

function dc(id: string, number: string, date: string, status: string, ref: string): StatementDc {
  return {
    id,
    dc_number: number,
    dc_date: date,
    status: status as StatementDc["status"],
    customer_dc_number: [ref],
    customer_dc_date: ["2026-08-29"],
  };
}
function line(
  id: string,
  dcId: string,
  component: string,
  received: number,
  sent: number,
  parent: string | null = null,
  material: string | null = "Cf8m"
): StatementItem {
  return {
    id,
    dc_id: dcId,
    parent_item_id: parent,
    component_id: component,
    component: "old name",
    material,
    received_qty: received,
    sent_qty: sent,
    sort_order: 0,
  };
}

// An original DC, two follow-ups of it, a draft, and one outside the period.
const dcs = [
  dc("d6", "26-27-006", "2026-09-03", "active", "ODC26-27/968"),
  dc("d15", "26-27-015", "2026-09-09", "active", "ODC26-27/968"),
  dc("d14", "26-27-014", "2026-09-12", "completed", "ODC26-27/968"),
  dc("dDraft", "26-27-099", "2026-09-10", "draft", "ODC26-27/968"),
  dc("dOld", "26-27-002", "2026-08-20", "active", "ODC26-27/800"),
];
const items = [
  line("i6", "d6", BODY, 250, 80),
  line("i15", "d15", BODY, 0, 10, "i6"),
  line("i14", "d14", BODY, 0, 160, "i6"),
  line("iDraft", "dDraft", BODY, 0, 999, "i6"),
  line("iOld", "dOld", FLG, 50, 50),
];

test("one row per issued Our DC line in the period, follow-ups kept separate", () => {
  const s = buildStatement({
    dcs,
    items,
    rates,
    componentNames: names,
    from: "2026-09-01",
    to: "2026-09-30",
  });
  assert.deepEqual(
    s.rows.map((r) => [r.dcNumber, r.received, r.followUpOf, r.completed, r.rate, r.value]),
    [
      ["26-27-006", 250, null, 80, 18, 1440],
      ["26-27-015", null, "26-27-006", 10, 18, 180],
      ["26-27-014", null, "26-27-006", 160, 18, 2880],
    ]
  );
  // The draft (999) and the August DC are not in it; nothing is counted twice.
  assert.equal(s.totalCompleted, 250);
  assert.equal(s.grandTotal, 4500);
  assert.equal(s.rows[0].component, "3P DN40FB/50RB CF8M Body Casting REV 2");
  assert.deepEqual(s.rows[0].customerDcs, [{ number: "ODC26-27/968", date: "2026-08-29" }]);
});

test("the period is inclusive at both ends, by Our DC date", () => {
  const s = buildStatement({
    dcs,
    items,
    rates,
    componentNames: names,
    from: "2026-09-03",
    to: "2026-09-09",
  });
  assert.deepEqual(
    s.rows.map((r) => r.dcNumber),
    ["26-27-006", "26-27-015"]
  );
});

test("a line with no Rate List rate shows no value and is flagged, never guessed", () => {
  const s = buildStatement({
    dcs,
    items: [line("x", "d6", BODY, 40, 40, null, "WCB")],
    rates,
    componentNames: names,
    from: "2026-09-01",
    to: "2026-09-30",
  });
  assert.equal(s.rows[0].rate, null);
  assert.equal(s.rows[0].value, null);
  assert.equal(s.totalCompleted, 40);
  assert.equal(s.grandTotal, 0);
  assert.equal(s.withoutRate, 1);
});

test("sorted by date, then customer DC number naturally, then our DC number", () => {
  const sameDay = [
    dc("a", "26-27-020", "2026-09-17", "active", "0DC26-27/1018"),
    dc("b", "26-27-021", "2026-09-17", "active", "ODC26-27/1042"),
    dc("c", "26-27-022", "2026-09-17", "active", "0DC26-27/996"),
  ];
  const s = buildStatement({
    dcs: sameDay,
    items: [line("1", "a", BODY, 1, 1), line("2", "b", BODY, 1, 1), line("3", "c", BODY, 1, 1)],
    rates,
    componentNames: names,
    from: "2026-09-17",
    to: "2026-09-17",
  });
  assert.deepEqual(
    s.rows.map((r) => r.dcNumber),
    ["26-27-022", "26-27-020", "26-27-021"]
  );
});

test("only real calendar dates are accepted as filters", () => {
  assert.equal(statementDate("2026-09-17"), "2026-09-17");
  assert.equal(statementDate("2026-02-30"), null);
  assert.equal(statementDate("17-09-2026"), null);
  assert.equal(statementDate(undefined), null);
});

test("a chosen component keeps only its lines, and the totals are for that component", () => {
  const mixed = [...items, line("f1", "d6", FLG, 400, 250), line("f2", "d15", FLG, 0, 149, "f1")];
  const s = buildStatement({
    dcs,
    items: mixed,
    rates,
    componentNames: names,
    from: "2026-09-01",
    to: "2026-09-30",
    componentId: FLG,
  });
  assert.deepEqual(
    s.rows.map((r) => [r.dcNumber, r.component, r.completed]),
    [
      ["26-27-006", "3P DN50RB CF8M #150 Flg Connector Casting", 250],
      ["26-27-015", "3P DN50RB CF8M #150 Flg Connector Casting", 149],
    ]
  );
  assert.equal(s.totalCompleted, 399);
  assert.equal(s.grandTotal, 11571);
  // No component chosen: every component, as before.
  const all = buildStatement({
    dcs,
    items: mixed,
    rates,
    componentNames: names,
    from: "2026-09-01",
    to: "2026-09-30",
  });
  assert.equal(all.rows.length, 5);
});
