import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isContinuationLine,
  outstandingForChallan,
  outwardPartsByOriginal,
  remainingByLine,
  remainingOnLine,
} from "./dc-chain.ts";

function line(
  id: string,
  received: number,
  sent = 0,
  parent_item_id: string | null = null,
  materialProblem = 0,
  rejection = 0
) {
  return {
    id,
    parent_item_id,
    received_qty: received,
    sent_qty: sent,
    material_problem_qty: materialProblem,
    rejection_qty: rejection,
  };
}

test("an original line on its own balances as it always did", () => {
  const items = [line("a", 500, 200)];
  assert.equal(remainingOnLine("a", items), 300);
});

test("a later despatch is subtracted from the original", () => {
  // 500 in, 200 back on the original challan, then 150 on the next one.
  const items = [line("a", 500, 200), line("b", 0, 150, "a")];
  assert.equal(remainingOnLine("a", items), 150);
});

test("several despatches settle the work", () => {
  const items = [
    line("a", 500, 200),
    line("b", 0, 150, "a"),
    line("c", 0, 125, "a"),
    line("d", 0, 25, "a"),
  ];
  assert.equal(remainingOnLine("a", items), 0);
});

test("material problem and rejection count as despatched", () => {
  const items = [line("a", 100, 0), line("b", 0, 60, "a", 30, 10)];
  assert.equal(remainingOnLine("a", items), 0);
});

test("a continuation has no balance of its own", () => {
  // Read as a standalone row it would look 150 over-delivered, which is how
  // stock would end up subtracting the same pieces twice.
  const items = [line("a", 500, 200), line("b", 0, 150, "a")];
  const remaining = remainingByLine(items);
  assert.equal(remaining.has("b"), false);
  assert.equal(isContinuationLine(items[1]), true);
});

test("a continuation of a continuation still lands on the original", () => {
  const items = [line("a", 500, 200), line("b", 0, 150, "a"), line("c", 0, 150, "b")];
  assert.equal(remainingOnLine("a", items), 0);
});

test("only the pending part of a multi-part challan still owes", () => {
  // A finished 250 and B owing 100, on one challan.
  const items = [line("a", 250, 250), line("b", 250, 150)];
  const remaining = remainingByLine(items);
  assert.equal(remaining.get("a"), 0);
  assert.equal(remaining.get("b"), 100);
  assert.equal(outstandingForChallan(items, items), 100);
});

test("a challan made only of despatches owes nothing itself", () => {
  const original = [line("a", 500, 200)];
  const next = [line("b", 0, 150, "a")];
  const all = [...original, ...next];
  assert.equal(outstandingForChallan(next, all), 0);
  assert.equal(outstandingForChallan(original, all), 150);
});

test("a looping parent link does not hang", () => {
  const items = [line("a", 100, 0, "b"), line("b", 0, 10, "a")];
  assert.doesNotThrow(() => remainingByLine(items));
});

test("the three outward columns each carry the whole chain", () => {
  // 300 received, returned as 100 good now and 150 good plus 50 scrapped later.
  const items = [line("a", 300, 100), line("b", 0, 150, "a", 0, 50)];
  const parts = outwardPartsByOriginal(items).get("a");
  assert.deepEqual(parts, { sent: 250, materialProblem: 0, rejection: 50 });
  assert.equal(remainingByLine(items).get("a"), 0);
});
