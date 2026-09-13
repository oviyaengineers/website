import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookableOnLine,
  challanSettled,
  figuresFor,
  indexChain,
  isContinuationLine,
  outstandingForChallan,
  outwardPartsByOriginal,
  remainingByLine,
  remainingOnLine,
  rootLineOf,
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

/** The same line, sitting on a challan still in draft. */
function onDraft<T>(item: T, dc_id = "draft-dc") {
  return { ...item, draft: true, dc_id };
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

// --- The four cases the balance must get right -----------------------------

test("received 250, sent 80: balance 170, pending", () => {
  const items = [line("a", 250, 80)];
  assert.equal(remainingOnLine("a", items), 170);
  assert.equal(challanSettled(items, items), false);
});

test("received 250, sent 250: balance 0, completed", () => {
  const items = [line("a", 250, 250)];
  assert.equal(remainingOnLine("a", items), 0);
  assert.equal(challanSettled(items, items), true);
});

test("received 250, sent 200, problem 20, rejection 10: balance 20, pending", () => {
  const items = [line("a", 250, 200, null, 20, 10)];
  assert.equal(remainingOnLine("a", items), 20);
  assert.equal(challanSettled(items, items), false);
});

test("received 250, sent 200, problem 50: balance 0, completed", () => {
  const items = [line("a", 250, 200, null, 50, 0)];
  assert.equal(remainingOnLine("a", items), 0);
  assert.equal(challanSettled(items, items), true);
});

// --- Follow-ups, confirmed and draft ----------------------------------------

test("a confirmed follow-up reduces the original, and a second one closes it", () => {
  // 250 in; 80 on the first follow-up, then the remaining 170 on another.
  const first = [line("a", 250), line("b", 0, 80, "a")];
  assert.equal(remainingOnLine("a", first), 170);
  assert.equal(challanSettled([first[0]], first), false);

  const both = [...first, line("c", 0, 170, "a")];
  assert.equal(remainingOnLine("a", both), 0);
  assert.equal(challanSettled([both[0]], both), true);
});

test("a draft follow-up does not reduce the balance", () => {
  const items = [line("a", 250, 80), onDraft(line("b", 0, 170, "a"))];
  assert.equal(remainingOnLine("a", items), 170);
  assert.equal(challanSettled([items[0]], items), false);
});

test("confirming the draft is what closes the original", () => {
  const draft = [line("a", 250, 80), onDraft(line("b", 0, 170, "a"))];
  const confirmed = [draft[0], { ...draft[1], draft: false }];
  assert.equal(remainingOnLine("a", draft), 170);
  assert.equal(remainingOnLine("a", confirmed), 0);
});

test("the line that read 0: 80 sent, 160 on a draft, 10 confirmed", () => {
  // 26-27-006 as it stood: only the 80 and the confirmed 10 count.
  const items = [
    line("a", 250, 80),
    onDraft(line("b", 0, 160, "a"), "dc-014"),
    line("c", 0, 10, "a"),
  ];
  const index = indexChain(items);
  const figures = figuresFor(items[0], index);

  assert.equal(figures.balance, 160);
  assert.equal(figures.sent, 90, "the original shows its own 80 plus the confirmed 10");
  assert.equal(figures.ownSent, 80);
  assert.equal(figures.onDraft, 160);
  assert.equal(figures.bookable, 0, "the draft has already booked everything left");
});

test("drafts book quantity, so two cannot promise more than is left", () => {
  const items = [line("a", 250, 80), onDraft(line("b", 0, 100, "a"))];
  assert.equal(remainingOnLine("a", items), 170);
  assert.equal(bookableOnLine("a", items), 70);
});

test("a draft being edited does not book against itself", () => {
  const items = [line("a", 250, 80), onDraft(line("b", 0, 100, "a"), "dc-edit")];
  assert.equal(bookableOnLine("a", items, "dc-edit"), 170);
});

test("editing a follow-up measures its room without its own old figures", () => {
  // 26-27-001's CF8M line: 200 received, 90 on the draft being edited. With
  // the draft counted against itself the room would read 110; editing it has
  // to offer the whole 200, or its own 90 could never be saved again.
  const original = line("a", 200, 0);
  const draft = onDraft(line("b", 0, 90, "a"), "dc-016");
  const all = [original, draft];

  assert.equal(bookableOnLine("a", all), 110, "a new follow-up has 110 left");
  const others = all.filter((row) => !("dc_id" in row) || row.dc_id !== "dc-016");
  assert.equal(bookableOnLine("a", others), 200, "the draft being edited sees all 200");
});

test("a follow-up finds the original line it ultimately belongs to", () => {
  const items = [line("a", 200), line("b", 0, 50, "a"), line("c", 0, 40, "b")];
  assert.equal(rootLineOf("b", items)?.id, "a");
  assert.equal(rootLineOf("c", items)?.id, "a", "a follow-up of a follow-up still lands on a");
  assert.equal(rootLineOf("a", items)?.id, "a");
  assert.equal(rootLineOf("missing", items), undefined);
});

test("a follow-up line has no balance of its own in its figures", () => {
  const items = [line("a", 250, 80), line("b", 0, 10, "a")];
  const figures = figuresFor(items[1], indexChain(items));
  assert.equal(figures.balance, null);
  assert.equal(figures.sent, 10);
  assert.equal(figures.received, 0);
});

// --- Several components on one challan --------------------------------------

test("each component keeps its own balance", () => {
  // One challan, two parts. A follow-up on the second never touches the first.
  const items = [
    line("body", 250, 250),
    line("connector", 250, 100),
    line("follow", 0, 50, "connector"),
  ];
  const index = indexChain(items);

  assert.equal(figuresFor(items[0], index).balance, 0);
  assert.equal(figuresFor(items[0], index).sent, 250);
  assert.equal(figuresFor(items[1], index).balance, 100);
  assert.equal(figuresFor(items[1], index).sent, 150);
  assert.equal(challanSettled(items.slice(0, 2), items), false);
});

test("one component short and another over do not add up to finished", () => {
  const items = [line("a", 250, 270), line("b", 250, 230)];
  assert.equal(outstandingForChallan(items, items), 0, "the sum is zero");
  assert.equal(challanSettled(items, items), false, "but neither line is");
});

test("a negative balance is never settled", () => {
  const items = [line("a", 250, 260)];
  assert.equal(remainingOnLine("a", items), -10);
  assert.equal(challanSettled(items, items), false);
});
