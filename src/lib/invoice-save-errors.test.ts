import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceErrorMessage } from "./invoice-save-errors.ts";

test("over-billing names the line, the DC and the figures", () => {
  const text = invoiceErrorMessage(
    "OVER_BILLING:3P DN40FB/50RB CF8M Body Casting REV 2|26-27-001|150.00|151"
  );
  assert.match(
    text,
    /CF8M Body Casting REV 2 on 26-27-001 has 150 left to bill, but 151 was entered/
  );
  assert.match(text, /Nothing was saved/);
});

test("missing business details point to the screen that holds them", () => {
  assert.match(
    invoiceErrorMessage("SETTINGS_MISSING:company GSTIN"),
    /company GSTIN in Settings → Billing Details/
  );
  assert.match(
    invoiceErrorMessage("CUSTOMER_STATE_MISSING:Moreind Automation Private Limited"),
    /state for Moreind/
  );
  assert.match(invoiceErrorMessage("HSN_MISSING:WCB Casting"), /HSN\/SAC code for WCB Casting/);
});

test("DC ownership and draft refusals are explained", () => {
  assert.match(
    invoiceErrorMessage("DC_OTHER_CUSTOMER:26-27-005"),
    /26-27-005 belongs to a different customer/
  );
  assert.match(invoiceErrorMessage("DC_NOT_ISSUED:26-27-020"), /still a draft/);
});

test("issued invoices cannot be edited or deleted", () => {
  assert.match(
    invoiceErrorMessage("INVOICE_WRITE_VIA_SAVE_ONLY: x"),
    /Cancel it and issue a new one/
  );
  assert.match(invoiceErrorMessage("INVOICE_DELETE_NOT_ALLOWED: x"), /never deleted/);
});

test("anything else still says nothing was kept", () => {
  assert.match(invoiceErrorMessage("connection lost"), /nothing was kept.*connection lost/);
});

test("monthly billing refusals are explained", () => {
  assert.match(
    invoiceErrorMessage("QUANTITY_NO_LONGER_AVAILABLE:Component A|26-27-001|0.00|100"),
    /has 0 left to bill, but 100 was entered/
  );
  assert.match(invoiceErrorMessage("DC_OTHER_MONTH:26-27-020|October 2026"), /October 2026 work/);
  assert.match(invoiceErrorMessage("INVOICE_DATE_BEFORE_MONTH"), /before the billing month/);
});

test("the GST Bill choice is never assumed", () => {
  assert.match(invoiceErrorMessage("GST_BILL_CHOICE_MISSING"), /GST Bill ON or OFF/);
});
