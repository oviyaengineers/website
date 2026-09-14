import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amountInWords,
  billingStatus,
  computeInvoiceTotals,
  formatInvoiceNumber,
  indianNumberInWords,
  isIntraState,
  roundMoney,
} from "./billing.ts";

test("billing status follows billed against Sent", () => {
  assert.equal(billingStatus(250, 0), "unbilled");
  assert.equal(billingStatus(250, 100), "partial");
  assert.equal(billingStatus(250, 250), "billed");
  assert.equal(billingStatus(0, 0), "not-billable");
});

test("partial billing 100 then 150 reaches Billed", () => {
  assert.equal(billingStatus(250, 100), "partial");
  assert.equal(billingStatus(250, 100 + 150), "billed");
});

test("tax type: same state is intra, another state is inter, missing state is not intra", () => {
  assert.equal(isIntraState("Tamil Nadu", " tamil  nadu "), true);
  assert.equal(isIntraState("Tamil Nadu", "Karnataka"), false);
  assert.equal(isIntraState("Tamil Nadu", ""), false);
  assert.equal(isIntraState("", ""), false);
});

test("intra-state invoice splits GST into CGST and SGST, discount before tax", () => {
  const totals = computeInvoiceTotals({
    lines: [
      { quantity: 100, rate: 12.5 },
      { quantity: 3, rate: 33.333 },
    ],
    charges: [{ amount: 500 }],
    discount: 100,
    gstRate: 18,
    intra: true,
  });
  assert.equal(totals.work, 1350); // 1250 + 100.00 (99.999 rounds to 100.00)
  assert.equal(totals.otherCharges, 500);
  assert.equal(totals.subtotal, 1850);
  assert.equal(totals.taxable, 1750);
  assert.equal(totals.cgstRate, 9);
  assert.equal(totals.cgst, 157.5);
  assert.equal(totals.sgst, 157.5);
  assert.equal(totals.igst, 0);
  assert.equal(totals.grandTotal, 2065);
});

test("inter-state invoice charges IGST at the full rate", () => {
  const totals = computeInvoiceTotals({
    lines: [{ quantity: 250, rate: 40 }],
    charges: [],
    discount: 0,
    gstRate: 18,
    intra: false,
  });
  assert.equal(totals.igstRate, 18);
  assert.equal(totals.igst, 1800);
  assert.equal(totals.cgst + totals.sgst, 0);
  assert.equal(totals.grandTotal, 11800);
});

test("money rounds half away from zero to paise, as Postgres round() does", () => {
  assert.equal(roundMoney(0.125), 0.13);
  assert.equal(roundMoney(2.675), 2.68);
  assert.equal(roundMoney(10), 10);
});

test("amounts are written in the Indian numbering system", () => {
  assert.equal(indianNumberInWords(0), "Zero");
  assert.equal(indianNumberInWords(105), "One Hundred Five");
  assert.equal(
    indianNumberInWords(123456),
    "One Lakh Twenty Three Thousand Four Hundred Fifty Six"
  );
  assert.equal(indianNumberInWords(10000000), "One Crore");
  assert.equal(amountInWords(2065), "Rupees Two Thousand Sixty Five Only");
  assert.equal(
    amountInWords(1234.5),
    "Rupees One Thousand Two Hundred Thirty Four and Paise Fifty Only"
  );
});

test("invoice number preview is INV/26-27/001", () => {
  assert.equal(
    formatInvoiceNumber({ prefix: "INV/", fy_label: "26-27", padding: 3, next_serial: 1 }),
    "INV/26-27/001"
  );
  assert.equal(
    formatInvoiceNumber({ prefix: "INV/", fy_label: "26-27", padding: 3, next_serial: 12 }),
    "INV/26-27/012"
  );
});

test("billing months are calendar months of the business date", async () => {
  const { monthStart, monthEnd, formatBillingMonth, parseMonthInput } =
    await import("./billing.ts");
  assert.equal(monthStart("2026-09-30"), "2026-09-01");
  assert.equal(monthStart("2026-10-01"), "2026-10-01");
  assert.equal(monthEnd("2026-09-01"), "2026-09-30");
  assert.equal(monthEnd("2028-02-01"), "2028-02-29");
  assert.equal(formatBillingMonth("2026-09-01"), "September 2026");
  assert.equal(parseMonthInput("2026-09"), "2026-09-01");
  assert.equal(parseMonthInput("2026-13"), null);
});

test("default invoice date: month end once ended, otherwise today", async () => {
  const { defaultInvoiceDate } = await import("./billing.ts");
  assert.equal(defaultInvoiceDate("2026-08-01", "2026-09-14"), "2026-08-31");
  assert.equal(defaultInvoiceDate("2026-09-01", "2026-09-14"), "2026-09-14");
  assert.equal(defaultInvoiceDate("2026-10-01", "2026-09-14"), "2026-10-01");
});

test("month status follows sent, billed and unbilled totals", async () => {
  const { monthBillingStatus } = await import("./billing.ts");
  assert.equal(monthBillingStatus(0, 0, 0), "no-work");
  assert.equal(monthBillingStatus(900, 0, 900), "unbilled");
  assert.equal(monthBillingStatus(900, 700, 200), "partial");
  assert.equal(monthBillingStatus(900, 900, 0), "billed");
});

test("grouping: same component, material, rate and HSN combine and keep every source", async () => {
  const { groupInvoiceLines } = await import("./billing.ts");
  const base = { component: "Component A", componentId: "c1", material: "CF8M", hsn: "998898" };
  const groups = groupInvoiceLines([
    { ...base, dcItemId: "l1", dcNumber: "26-27-001", quantity: 100, rate: 10 },
    { ...base, dcItemId: "l4", dcNumber: "26-27-004", quantity: 150, rate: 10 },
    { ...base, dcItemId: "l5", dcNumber: "26-27-005", quantity: 200, rate: 10 },
    { ...base, dcItemId: "l6", dcNumber: "26-27-006", quantity: 20, rate: 12 },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].quantity, 450);
  assert.equal(groups[0].amount, 4500);
  assert.deepEqual(
    groups[0].sources.map((s) => [s.dcNumber, s.quantity]),
    [
      ["26-27-001", 100],
      ["26-27-004", 150],
      ["26-27-005", 200],
    ]
  );
  assert.equal(groups[1].rate, 12);
  assert.equal(groups[1].quantity, 20);
});
