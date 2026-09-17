import assert from "node:assert/strict";
import { test } from "node:test";
import { weightSaveErrorMessage } from "@/lib/weight-save-errors";

test("a non-admin is told only an admin can change weights", () => {
  assert.match(
    weightSaveErrorMessage("WEIGHT_ADMIN_ONLY: only an admin", "42501"),
    /Only an admin/
  );
  assert.match(
    weightSaveErrorMessage('new row violates row-level security policy for table "weight_master"'),
    /Only an admin/
  );
});

test("a line with no master names the component and says what to do", () => {
  assert.equal(
    weightSaveErrorMessage("WEIGHT_NOT_CONFIGURED:3P DN40FB/50RB WCB Body Casting REV 2"),
    "3P DN40FB/50RB WCB Body Casting REV 2: Weight not configured for this Component/Material. Add it in the Weight/Scrap Master first. Nothing was saved."
  );
  assert.match(weightSaveErrorMessage("WEIGHT_RATE_MISSING:Shaft"), /^Shaft: enter the scrap rate/);
  assert.match(
    weightSaveErrorMessage("WEIGHT_NEGATIVE:Shaft"),
    /^Shaft: the scrap rate cannot be negative/
  );
  assert.match(weightSaveErrorMessage("WEIGHT_NOT_RECORDED:Shaft"), /^Shaft: not recorded yet/);
});

test("master refusals", () => {
  assert.match(
    weightSaveErrorMessage("WEIGHT_MASTER_IN_USE: this master"),
    /Make it inactive instead/
  );
  assert.match(
    weightSaveErrorMessage(
      'duplicate key value violates unique constraint "weight_master_one_per_pair"'
    ),
    /already exists/
  );
  assert.match(weightSaveErrorMessage("WEIGHT_MASTER_BAD_MATERIAL"), /Choose a material/);
  assert.match(
    weightSaveErrorMessage('violates check constraint "weight_master_finished_within_rough"'),
    /Finished weight cannot be more than rough/
  );
  assert.match(weightSaveErrorMessage("WEIGHT_RECORD_FIXED: recorded"), /cannot be changed/);
});

test("anything else keeps its detail", () => {
  assert.match(weightSaveErrorMessage("something odd"), /something odd/);
  assert.match(weightSaveErrorMessage(""), /Nothing was changed/);
});
