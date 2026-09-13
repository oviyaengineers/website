import assert from "node:assert/strict";
import { test } from "node:test";
import { challanSettled, challanSettledIn, indexChain } from "./dc-chain.ts";

// Regression tests for the Stage 1 audit finding F1: a challan made only of
// follow-up lines showed Completed while the original line it despatched
// against still owed pieces.

function line(
  id: string,
  dc_id: string,
  received: number,
  sent = 0,
  parent_item_id: string | null = null,
  extra: { materialProblem?: number; rejection?: number; draft?: boolean } = {}
) {
  return {
    id,
    dc_id,
    parent_item_id,
    received_qty: received,
    sent_qty: sent,
    material_problem_qty: extra.materialProblem ?? 0,
    rejection_qty: extra.rejection ?? 0,
    draft: extra.draft ?? false,
  };
}

test("a follow-up challan is pending while its original still owes (26-27-017 case)", () => {
  // 26-27-001: 200 in, nothing out on it. 26-27-017: 90 sent, 2 rejected. 108 left.
  const original = line("o1", "dc001", 200);
  const followUp = line("f17", "dc017", 0, 90, "o1", { rejection: 2 });
  const all = [original, followUp];
  assert.equal(challanSettled([followUp], all), false);
  assert.equal(challanSettled([original], all), false);
});

test("a follow-up challan is completed once its original reaches exactly zero", () => {
  const original = line("o1", "dc001", 200);
  const first = line("f1", "dc-a", 0, 90, "o1", { rejection: 2 });
  const last = line("f2", "dc-b", 0, 108, "o1");
  const all = [original, first, last];
  assert.equal(challanSettled([first], all), true);
  assert.equal(challanSettled([last], all), true);
  assert.equal(challanSettled([original], all), true);
});

test("the original line reaches zero only through its own follow-ups", () => {
  // Two lots of the same part: finishing one never completes the other's follow-up.
  const lotA = line("a", "dc-a", 100);
  const lotB = line("b", "dc-b", 100);
  const onA = line("fa", "dc-fa", 0, 100, "a");
  const onB = line("fb", "dc-fb", 0, 40, "b");
  const all = [lotA, lotB, onA, onB];
  assert.equal(challanSettled([onA], all), true);
  assert.equal(challanSettled([onB], all), false);
});

test("a follow-up of a follow-up is judged by the root original", () => {
  const original = line("o", "dc-o", 500, 100);
  const first = line("f1", "dc-1", 0, 150, "o");
  const second = line("f2", "dc-2", 0, 200, "f1");
  const pendingAll = [original, first, second];
  assert.equal(challanSettled([second], pendingAll), false); // 50 left
  const third = line("f3", "dc-3", 0, 50, "f2");
  const doneAll = [...pendingAll, third];
  assert.equal(challanSettled([second], doneAll), true);
  assert.equal(challanSettled([third], doneAll), true);
});

test("over-despatch against the original is never completed", () => {
  const original = line("o", "dc-o", 100);
  const followUp = line("f", "dc-f", 0, 110, "o");
  assert.equal(challanSettled([followUp], [original, followUp]), false);
});

test("a draft follow-up does not complete the original or itself", () => {
  const original = line("o", "dc-o", 100);
  const draft = line("f", "dc-f", 0, 100, "o", { draft: true });
  const all = [original, draft];
  assert.equal(challanSettled([draft], all), false);
  assert.equal(challanSettled([original], all), false);
});

test("a follow-up whose original line is missing is not completed", () => {
  const orphan = line("f", "dc-f", 0, 10, "gone");
  assert.equal(challanSettled([orphan], [orphan]), false);
});

test("a challan mixing an original and a follow-up needs every line at zero", () => {
  const earlier = line("e", "dc-e", 100, 60);
  const ownLot = line("own", "dc-mix", 50, 50);
  const continuing = line("cont", "dc-mix", 0, 30, "e");
  const all = [earlier, ownLot, continuing];
  const index = indexChain(all);
  assert.equal(challanSettledIn([ownLot, continuing], index), false); // 10 left on e
  const finish = line("fin", "dc-fin", 0, 10, "e");
  assert.equal(challanSettledIn([ownLot, continuing], indexChain([...all, finish])), true);
});
