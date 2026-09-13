import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildHistory,
  parseHistoryFilters,
  type HistoryChallan,
  type HistoryScan,
  type HistorySource,
} from "./dc-history.ts";
import type { ChainRow } from "./dc-chain-data.ts";

const CF8M = "3P DN40FB/50RB CF8M Body Casting REV 2";
const WCB = "3P DN40FB/50RB WCB Body Casting REV 2";

function challan(
  id: string,
  dc_number: string,
  dc_date: string,
  customer_id: string,
  status = "active",
  created_at = `${dc_date}T09:00:00Z`
): HistoryChallan {
  return {
    id,
    dc_number,
    dc_date,
    customer_id,
    customer_dc_number: [`REF-${dc_number}`],
    status,
    created_at,
  };
}

function line(
  id: string,
  dc: HistoryChallan,
  component: string,
  qty: { received?: number; sent?: number; mp?: number; rej?: number; parent?: string }
): ChainRow {
  return {
    id,
    dc_id: dc.id,
    dc_number: dc.dc_number,
    draft: dc.status === "draft",
    parent_item_id: qty.parent ?? null,
    component_id: null,
    component,
    material: component.includes("WCB") ? "WCB" : "CF8M",
    received_qty: qty.received ?? 0,
    sent_qty: qty.sent ?? 0,
    material_problem_qty: qty.mp ?? 0,
    rejection_qty: qty.rej ?? 0,
    total_qty: (qty.sent ?? 0) + (qty.mp ?? 0) + (qty.rej ?? 0),
    sort_order: 0,
  } as ChainRow;
}

function scan(
  id: string,
  status: string,
  customer_dc_date: string | null,
  created_at: string,
  items: { component: string; material: string; received_qty: number }[]
): HistoryScan {
  return {
    id,
    customer_id: "abc",
    customer_dc_number: `ODC/${id}`,
    customer_dc_date,
    items,
    status,
    created_at,
  };
}

// An original CF8M lot of 250 with two confirmed follow-ups and a draft one,
// a pending WCB challan for another customer, a completed challan on the last
// day of the range, one challan either side of it, and the scan queue.
const A = challan("A", "26-27-001", "2026-09-01", "abc");
const F1 = challan("F1", "26-27-002", "2026-09-03", "abc");
const F2 = challan("F2", "26-27-003", "2026-09-05", "abc");
const DRAFT = challan("D", "26-27-004", "2026-09-04", "abc", "draft");
const B = challan("B", "26-27-005", "2026-09-02", "xyz");
const C = challan("C", "26-27-006", "2026-09-10", "xyz");
const BEFORE = challan("E0", "26-27-007", "2026-08-31", "abc");
const AFTER = challan("E1", "26-27-008", "2026-09-11", "abc");

const SOURCE: HistorySource = {
  challans: [AFTER, C, F2, DRAFT, F1, B, A, BEFORE],
  chainRows: [
    line("a1", A, CF8M, { received: 250, sent: 80 }),
    line("f1", F1, CF8M, { sent: 100, parent: "a1" }),
    line("f2", F2, CF8M, { sent: 40, mp: 10, parent: "a1" }),
    line("d1", DRAFT, CF8M, { sent: 20, parent: "a1" }),
    line("b1", B, WCB, { received: 100, sent: 40 }),
    line("c1", C, WCB, { received: 50, sent: 45, rej: 5 }),
    line("e0", BEFORE, CF8M, { received: 10 }),
    line("e1", AFTER, CF8M, { received: 10 }),
  ],
  scans: [
    // Scanned after challan A was made, on the same business date.
    scan("s1", "pending", "2026-09-01", "2026-09-01T12:00:00Z", [
      { component: CF8M, material: "CF8M", received_qty: 300 },
    ]),
    // No date read: filed under the day it was scanned, in India. 20:00 UTC
    // on 31 Aug is already 1 Sep there.
    scan("s3", "pending", null, "2026-08-31T20:00:00Z", [
      { component: WCB, material: "WCB", received_qty: 7 },
    ]),
    scan("s2", "converted", "2026-09-02", "2026-09-02T08:00:00Z", [
      { component: CF8M, material: "CF8M", received_qty: 250 },
    ]),
    scan("s4", "discarded", "2026-09-02", "2026-09-02T08:00:00Z", [
      { component: CF8M, material: "CF8M", received_qty: 1 },
    ]),
  ],
  customers: [
    { id: "abc", name: "ABC Industries" },
    { id: "xyz", name: "XYZ Castings" },
  ],
};

const RANGE = { from: "2026-09-01", to: "2026-09-10" };
const keys = (filters: Parameters<typeof buildHistory>[1]) =>
  buildHistory(SOURCE, filters).records.map((record) => record.key);

test("only records dated inside the range are shown, both ends included", () => {
  const { records } = buildHistory(SOURCE, RANGE);
  const dates = records.map((record) => record.date);
  assert.ok(dates.includes("2026-09-01"), "From date included");
  assert.ok(dates.includes("2026-09-10"), "To date included");
  assert.ok(!dates.includes("2026-08-31"), "day before excluded");
  assert.ok(!dates.includes("2026-09-11"), "day after excluded");
  assert.ok(dates.every((date) => date >= RANGE.from && date <= RANGE.to));
});

test("records run oldest to newest, same-day records by DC number", () => {
  assert.deepEqual(keys(RANGE), [
    "a1", // 1 Sep, 26-27-001
    "scan:s1:0", // 1 Sep, ODC/s1
    "scan:s3:0", // 1 Sep, ODC/s3 (scanned 31 Aug 20:00 UTC, 1 Sep in India)
    "b1",
    "f1",
    "f2",
    "c1",
  ]);
});

test("each record carries the right status", () => {
  const kindOf = new Map(buildHistory(SOURCE, RANGE).records.map((r) => [r.key, r.kind]));
  assert.equal(kindOf.get("scan:s1:0"), "scanned");
  assert.equal(kindOf.get("scan:s3:0"), "scanned");
  // 250 - 80 - 100 - 40 - 10 = 20 still owed; the draft does not count.
  assert.equal(kindOf.get("a1"), "dispatched-pending");
  assert.equal(kindOf.get("f1"), "dispatched-pending");
  assert.equal(kindOf.get("f2"), "dispatched-pending");
  assert.equal(kindOf.get("b1"), "dispatched-pending");
  // 50 - 45 - 5 = 0 exactly.
  assert.equal(kindOf.get("c1"), "completed");
});

test("converted and discarded scans, and draft challans, are not in the history", () => {
  const all = keys({});
  assert.ok(!all.some((key) => key.startsWith("scan:s2")), "converted scan is its challan's row");
  assert.ok(!all.some((key) => key.startsWith("scan:s4")), "discarded scan");
  assert.ok(!all.includes("d1"), "draft follow-up");
});

test("the date used is the business date, and says which one", () => {
  const byKey = new Map(buildHistory(SOURCE, {}).records.map((r) => [r.key, r]));
  assert.equal(byKey.get("a1")?.dateSource, "dc-date");
  assert.equal(byKey.get("scan:s1:0")?.dateSource, "customer-dc-date");
  assert.equal(byKey.get("scan:s3:0")?.dateSource, "scanned-at");
  assert.equal(byKey.get("scan:s3:0")?.date, "2026-09-01");
});

test("search reaches our DC number, customer DC number, customer, component and material", () => {
  assert.deepEqual(keys({ ...RANGE, q: "26-27-005" }), ["b1"]);
  assert.deepEqual(keys({ ...RANGE, q: "ODC/s1" }), ["scan:s1:0"]);
  assert.deepEqual(keys({ ...RANGE, q: "xyz" }), ["b1", "c1"]);
  assert.deepEqual(keys({ ...RANGE, q: "wcb" }), ["scan:s3:0", "b1", "c1"]);
  // An original's number brings its follow-ups with it.
  assert.deepEqual(keys({ ...RANGE, q: "26-27-001" }), ["a1", "f1", "f2"]);
});

test("search and the date range narrow together", () => {
  assert.deepEqual(keys({ from: "2026-09-04", to: "2026-09-10", q: "26-27-001" }), ["f2"]);
});

test("the component filter keeps every status of that part and nothing else", () => {
  const records = buildHistory(SOURCE, { ...RANGE, component: CF8M }).records;
  assert.deepEqual(
    records.map((r) => r.key),
    ["a1", "scan:s1:0", "f1", "f2"]
  );
  assert.ok(records.every((r) => r.component === CF8M));
  // The same part named without its revision is the same part.
  assert.deepEqual(keys({ ...RANGE, component: "3P DN40FB/50RB CF8M Body Casting" }), [
    "a1",
    "scan:s1:0",
    "f1",
    "f2",
  ]);
});

test("the customer filter keeps only that customer's records", () => {
  assert.deepEqual(keys({ ...RANGE, customer: "XYZ Castings" }), ["b1", "c1"]);
  assert.deepEqual(keys({ ...RANGE, customer: "ABC Industries", component: WCB }), ["scan:s3:0"]);
});

test("every follow-up is its own row, however many an original has", () => {
  const followUps = buildHistory(SOURCE, RANGE).records.filter((r) => r.followUpOf);
  assert.deepEqual(
    followUps.map((r) => [r.dcNumber, r.followUpOf?.dcNumber]),
    [
      ["26-27-002", "26-27-001"],
      ["26-27-003", "26-27-001"],
    ]
  );
  assert.ok(
    followUps.every((r) => r.received === null),
    "a follow-up received nothing"
  );
});

test("balances come from the shared chain calculation", () => {
  const byKey = new Map(buildHistory(SOURCE, RANGE).records.map((r) => [r.key, r]));
  assert.equal(byKey.get("a1")?.balance, 20);
  assert.equal(byKey.get("a1")?.sent, 80, "a row shows its own despatch");
  assert.equal(byKey.get("a1")?.sentOnFollowUps, 140);
  // Left on the original once each follow-up counts.
  assert.equal(byKey.get("f1")?.balance, 20);
  assert.equal(byKey.get("f2")?.balance, 20);
  assert.equal(byKey.get("b1")?.balance, 60);
  assert.equal(byKey.get("c1")?.balance, 0);
  assert.equal(byKey.get("scan:s1:0")?.balance, 300);
});

test("the summary counts each record and each quantity once", () => {
  const { summary } = buildHistory(SOURCE, RANGE);
  assert.deepEqual(summary, {
    totalRecords: 7,
    scannedPending: 2,
    dispatchedPending: 4,
    completed: 1,
    // 250 + 100 + 50 on our challans, 300 + 7 scanned.
    received: 707,
    // 80 + 100 + 40 + 40 + 45: each despatch on the challan that made it.
    sent: 305,
    materialProblem: 10,
    rejection: 5,
    // The CF8M lot's 20 once for all three of its rows, 60 + 0 on WCB, and
    // the 307 scanned that has not gone back yet.
    balance: 387,
  });
});

test("no record appears twice", () => {
  const all = keys({});
  assert.equal(new Set(all).size, all.length);
  const lines = SOURCE.chainRows.filter((row) => !row.draft).length;
  const scanned = 2;
  assert.equal(all.length, lines + scanned);
});

test("View opens the exact record", () => {
  const byKey = new Map(buildHistory(SOURCE, RANGE).records.map((r) => [r.key, r]));
  assert.equal(byKey.get("f2")?.href, "/dashboard/dc/F2");
  assert.equal(byKey.get("f2")?.followUpOf?.dcId, "A");
  assert.equal(byKey.get("scan:s1:0")?.href, "/dashboard/dc/scanned/s1");
});

test("a range that runs backwards shows nothing and says why", () => {
  const result = buildHistory(SOURCE, { from: "2026-09-10", to: "2026-09-01" });
  assert.deepEqual(result.records, []);
  assert.match(result.error ?? "", /after/);
});

test("the same URL gives the same answer, so a refresh changes nothing", () => {
  const params = { from: "2026-09-01", to: "2026-09-10", q: " cf8m ", component: "", bad: "x" };
  const filters = parseHistoryFilters(params);
  assert.deepEqual(filters, {
    from: "2026-09-01",
    to: "2026-09-10",
    q: "cf8m",
    component: undefined,
    customer: undefined,
  });
  assert.deepEqual(
    buildHistory(SOURCE, filters),
    buildHistory(SOURCE, parseHistoryFilters(params))
  );
  assert.equal(parseHistoryFilters({ from: "10/09/2026" }).from, undefined);
  // Reading the history leaves the source exactly as it was.
  const before = JSON.stringify(SOURCE);
  buildHistory(SOURCE, filters);
  assert.equal(JSON.stringify(SOURCE), before);
});
