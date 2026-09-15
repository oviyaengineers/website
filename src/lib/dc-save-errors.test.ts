import assert from "node:assert/strict";
import { test } from "node:test";
import { saveErrorMessage } from "./dc-save-errors.ts";

test("a scan already converted names the challan it became", () => {
  assert.match(saveErrorMessage("SCAN_NOT_PENDING:26-27-019"), /already been created.*26-27-019/);
  assert.match(saveErrorMessage("SCAN_NOT_PENDING:discarded"), /discarded/);
});

test("an over-dispatch reads the database's figures as plain numbers", () => {
  const text = saveErrorMessage("OVER_DISPATCH:3P DN40FB/50RB CF8M Body Casting REV 2|100.00|101");
  assert.match(text, /CF8M Body Casting REV 2 has 100 left to despatch but 101 is entered/);
  assert.match(text, /Nothing was saved/);
});

test("cutting an original below its follow-ups is explained", () => {
  assert.match(saveErrorMessage("BELOW_FOLLOW_UPS:WCB Casting|170.00"), /account for 170/);
});

test("removing a line with follow-ups is explained", () => {
  assert.match(
    saveErrorMessage('violates foreign key constraint "x"', "23503"),
    /follow-up DCs raised against it/
  );
});

test("anything else still says nothing was kept", () => {
  assert.match(saveErrorMessage("network down"), /nothing was kept.*network down/);
});

test("billed quantity protects a DC line", () => {
  assert.match(saveErrorMessage("BELOW_BILLED:WCB Casting|250.00"), /250 is already billed/);
  assert.match(
    saveErrorMessage("BILLED_LINE_REMOVED:WCB Casting"),
    /billed on an invoice, so it cannot be removed/
  );
  assert.match(
    saveErrorMessage("DC_BILLED_CANNOT_REOPEN: 26-27-001 is billed"),
    /cannot be reopened/
  );
});

test("Tamil messages keep the component, DC number and quantities unchanged", () => {
  const text = saveErrorMessage("OVER_DISPATCH:WCB Casting REV 2|100.00|101", null, "ta");
  assert.match(text, /WCB Casting REV 2/);
  assert.match(text, /100/);
  assert.match(text, /101/);
  assert.match(text, /[஀-௿]/);
  assert.match(saveErrorMessage("SCAN_NOT_PENDING:26-27-019", null, "ta"), /26-27-019/);
  assert.match(saveErrorMessage("network down", null, "ta"), /network down/);
  assert.doesNotMatch(saveErrorMessage("DC_NO_ITEMS", null, "ta"), /Add at least/);
});

test("a billed DC keeps its month and customer", () => {
  assert.match(
    saveErrorMessage(
      "DC_BILLED_MONTH_LOCKED: 26-27-001 is billed for September 2026, so its date cannot move"
    ),
    /26-27-001 is billed for September 2026/
  );
  assert.match(
    saveErrorMessage("DC_BILLED_CUSTOMER_LOCKED: 26-27-001 is billed"),
    /customer cannot change/
  );
});
