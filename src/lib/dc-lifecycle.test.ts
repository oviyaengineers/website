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

test("the stored spelling is one every version of the type accepts", () => {
  // 'active' exists only after migration 0016, which has repeatedly reported
  // success without the type gaining it. Writing it would fail the save.
  assert.equal(storedStatusFor("draft"), "draft");
  assert.equal(storedStatusFor("active"), "dispatched");
  // And what is written must read back as the lifecycle that was asked for.
  assert.equal(normalizeDcStatus(storedStatusFor("active")), "active");
  assert.equal(normalizeDcStatus(storedStatusFor("draft")), "draft");
});
