import assert from "node:assert/strict";
import { test } from "node:test";
import { weightSaveErrorMessage } from "@/lib/weight-save-errors";

test("a non-admin is told only an admin can change weights", () => {
  assert.match(
    weightSaveErrorMessage("WEIGHT_ADMIN_ONLY: only an admin", "42501"),
    /Only an admin/
  );
  assert.match(
    weightSaveErrorMessage("permission denied for function save_dc_line_weights", "42501"),
    /Only an admin/
  );
  assert.match(weightSaveErrorMessage("WEIGHT_ADMIN_ONLY", "42501", "ta"), /நிர்வாகி மட்டுமே/);
});

test("line refusals name the component exactly as stored", () => {
  assert.equal(
    weightSaveErrorMessage("WEIGHT_FINISHED_OVER_ROUGH:3P DN40FB/50RB WCB Body Casting REV 2"),
    "3P DN40FB/50RB WCB Body Casting REV 2: finished weight cannot be more than rough weight. Nothing was saved."
  );
  assert.match(
    weightSaveErrorMessage("WEIGHT_NEGATIVE:Shaft"),
    /^Shaft: weights and rate cannot be negative/
  );
  assert.match(weightSaveErrorMessage("WEIGHT_MISSING:Shaft"), /^Shaft: enter both weights/);
  assert.match(weightSaveErrorMessage("WEIGHT_BAD_UNIT:Shaft"), /^Shaft: choose g or kg/);
  assert.match(
    weightSaveErrorMessage("WEIGHT_BAD_NUMBER:Shaft"),
    /^Shaft: a weight or rate is not a number/
  );
  assert.match(
    weightSaveErrorMessage("WEIGHT_FINISHED_OVER_ROUGH:Shaft", null, "ta"),
    /^Shaft: முடிந்த எடை/
  );
});

test("challan-level refusals", () => {
  assert.match(weightSaveErrorMessage("WEIGHT_DRAFT_DC: a draft"), /draft/);
  assert.match(weightSaveErrorMessage("WEIGHT_DC_NOT_FOUND"), /no longer exists/);
  assert.match(weightSaveErrorMessage("WEIGHT_LINE_NOT_ON_DC"), /no longer belongs/);
  assert.match(weightSaveErrorMessage("WEIGHT_DUPLICATE_LINE"), /sent twice/);
});

test("anything else still says nothing was saved", () => {
  assert.match(weightSaveErrorMessage("network down"), /network down.*Nothing was saved/);
  assert.match(weightSaveErrorMessage(null), /Nothing was saved/);
});
