import assert from "node:assert/strict";
import { test } from "node:test";
import { dcLifecycle, normalizeDcStatus, storedStatusFor } from "./dc-lifecycle.ts";

function item(received: number, sent = 0, materialProblem = 0, rejection = 0) {
  return {
    received_qty: received,
    sent_qty: sent,
    material_problem_qty: materialProblem,
    rejection_qty: rejection,
  };
}

test("a draft stays a draft however its quantities read", () => {
  assert.equal(dcLifecycle("draft", [item(10, 10)]), "draft");
  assert.equal(dcLifecycle("draft", [item(10, 0)]), "draft");
});

test("a confirmed challan is active while anything is outstanding", () => {
  assert.equal(dcLifecycle("active", [item(200, 180)]), "active");
  assert.equal(dcLifecycle("active", [item(200, 200), item(100, 40)]), "active");
});

test("a confirmed challan is completed once every row reconciles", () => {
  // Sent, material problem and rejection all count as accounted for.
  assert.equal(dcLifecycle("active", [item(200, 180, 15, 5)]), "completed");
  assert.equal(dcLifecycle("active", [item(10, 10), item(5, 0, 5)]), "completed");
});

test("the statuses used before migration 0017 still read correctly", () => {
  // A row that has not been migrated yet must not show as a draft.
  assert.equal(normalizeDcStatus("dispatched"), "active");
  assert.equal(normalizeDcStatus("delivered"), "completed");
  assert.equal(dcLifecycle("dispatched", [item(200, 180)]), "active");
  assert.equal(dcLifecycle("dispatched", [item(200, 200)]), "completed");
});

test("a challan with no items is active, not silently complete", () => {
  assert.equal(dcLifecycle("active", []), "active");
});

test("a row with more out than in is not completed", () => {
  // Over-despatched is a keying error, and Completed would hide it.
  assert.equal(dcLifecycle("active", [item(200, 210)]), "active");
});

test("the chain's verdict decides when it is known", () => {
  // The row alone reads 250 in, 80 out; confirmed follow-ups settled the rest.
  assert.equal(dcLifecycle("active", [item(250, 80)], true), "completed");
  assert.equal(dcLifecycle("active", [item(250, 250)], false), "active");
  assert.equal(dcLifecycle("draft", [item(250, 80)], true), "draft");
});

test("what is written reads back as the lifecycle that was asked for", () => {
  // Since migration 0016 the type holds these names, so they are stored as
  // themselves rather than translated.
  assert.equal(storedStatusFor("draft"), "draft");
  assert.equal(storedStatusFor("active"), "active");
  assert.equal(normalizeDcStatus(storedStatusFor("active")), "active");
  assert.equal(normalizeDcStatus(storedStatusFor("draft")), "draft");
});
