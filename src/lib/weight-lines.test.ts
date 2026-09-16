import assert from "node:assert/strict";
import { test } from "node:test";
import { filterWeightLines, type WeightLine } from "@/lib/weight-lines";

function line(over: Partial<WeightLine>): WeightLine {
  return {
    itemId: "i1",
    dcId: "d1",
    dcNumber: "26-27-030",
    dcDate: "2026-09-10",
    customerName: "Moreind Automation Private Limited",
    customerDcNumbers: ["ODC26-27/1062"],
    component: "Shaft",
    material: "WCB",
    sentQty: 100,
    sortOrder: 0,
    followUpOf: null,
    dcLifecycle: "completed",
    weight: null,
    status: "notWeighed",
    ...over,
  };
}

// One DC with three descriptions, and a second DC.
const lines = [
  line({ itemId: "a", component: "Shaft", sentQty: 100 }),
  line({ itemId: "b", component: "Flange", sentQty: 200, material: "Cf8m" }),
  line({ itemId: "c", component: "Bracket", sentQty: 150, status: "weighed" }),
  line({
    itemId: "d",
    dcId: "d2",
    dcNumber: "26-27-031",
    dcDate: "2026-09-16",
    component: "Shaft",
    sentQty: 40,
    dcLifecycle: "active",
    customerDcNumbers: ["ODC26-27/1100"],
    followUpOf: "26-27-030",
  }),
];
const ids = (list: WeightLine[]) => list.map((l) => l.itemId).join(",");

test("completed DCs are shown by default, each line separately", () => {
  assert.equal(ids(filterWeightLines(lines, {})), "a,b,c");
  assert.equal(ids(filterWeightLines(lines, { dc: "active" })), "d");
  assert.equal(ids(filterWeightLines(lines, { dc: "all" })), "a,b,c,d");
});

test("the same component on two DCs stays two lines with their own Sent Qty", () => {
  const shafts = filterWeightLines(lines, { dc: "all", component: "Shaft" });
  assert.deepEqual(
    shafts.map((l) => [l.dcNumber, l.sentQty]),
    [
      ["26-27-030", 100],
      ["26-27-031", 40],
    ]
  );
});

test("dates are our DC dates, both ends included", () => {
  assert.equal(ids(filterWeightLines(lines, { dc: "all", from: "2026-09-16" })), "d");
  assert.equal(ids(filterWeightLines(lines, { dc: "all", to: "2026-09-10" })), "a,b,c");
  assert.equal(
    ids(filterWeightLines(lines, { dc: "all", from: "2026-09-10", to: "2026-09-16" })),
    "a,b,c,d"
  );
});

test("DC numbers, customer DC numbers, material, weight status and search", () => {
  assert.equal(ids(filterWeightLines(lines, { dc: "all", dcNo: "031" })), "d");
  assert.equal(ids(filterWeightLines(lines, { dc: "all", customerDcNo: "odc26-27/1100" })), "d");
  assert.equal(ids(filterWeightLines(lines, { material: "cf8m" })), "b");
  assert.equal(ids(filterWeightLines(lines, { weight: "weighed" })), "c");
  assert.equal(ids(filterWeightLines(lines, { weight: "nonsense" })), "a,b,c");
  assert.equal(ids(filterWeightLines(lines, { q: "flange cf8m" })), "b");
  assert.equal(
    ids(filterWeightLines(lines, { customer: "Moreind Automation Private Limited" })),
    "a,b,c"
  );
});
