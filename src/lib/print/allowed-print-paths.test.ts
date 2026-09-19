import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedPrintPage, pdfFileName } from "@/lib/print/allowed-print-paths";

const ID = "70d41569-e5d2-4939-9abd-26eebb412aa4";
const ID2 = "40ca88cb-e596-4830-a49d-e345a8f7d54c";

test("every ERP print page is accepted", () => {
  assert.deepEqual(allowedPrintPage(`/dashboard/dc/${ID}/print`), {
    path: `/dashboard/dc/${ID}/print`,
    kind: "DC",
  });
  assert.equal(
    allowedPrintPage(`/dashboard/dc/combined-print/print?ids=${ID},${ID2}&layout=full`)?.path,
    `/dashboard/dc/combined-print/print?ids=${ID}%2C${ID2}&layout=full`
  );
  assert.equal(allowedPrintPage(`/dashboard/invoices/${ID}/print`)?.kind, "Invoice");
  assert.equal(
    allowedPrintPage("/dashboard/dc/history/print?from=2026-09-01&to=2026-09-30&q=DN40FB/50RB")
      ?.kind,
    "DC-History"
  );
  assert.equal(allowedPrintPage("/dashboard/dc/print-list")?.kind, "DC-List");
  assert.equal(allowedPrintPage("/dashboard/completed/print")?.kind, "Completed-DCs");
  assert.equal(allowedPrintPage("/dashboard/stock/print?customer=Moreind")?.kind, "Stock-Balance");
});

test("anything else is refused, so the server browser cannot be sent elsewhere", () => {
  const refused = [
    "",
    "https://evil.example/",
    "//evil.example/dashboard/dc/print-list",
    "/\\evil.example",
    "/dashboard",
    "/dashboard/settings/security",
    "/api/print/pdf?path=/dashboard/dc/print-list",
    `/dashboard/dc/${ID}`,
    `/dashboard/dc/${ID}/print/../../settings`,
    "/dashboard/dc/not-an-id/print",
    `/dashboard/dc/${ID}/print?x=1`,
    `/dashboard/dc/combined-print/print?ids=${ID}&layout=wide`,
    "/dashboard/dc/combined-print/print?ids=abc",
    "/dashboard/dc/history/print?q=<script>",
    "/dashboard/dc/history/print?q=https://evil.example",
    `/dashboard/dc/${ID}/print#top`,
  ];
  for (const path of refused) assert.equal(allowedPrintPage(path), null, path);
});

test("file names are plain and come from the page title", () => {
  assert.equal(
    pdfFileName("DC", "Delivery Challan 26-27-006 | Oviya Engineers"),
    "Delivery-Challan-26-27-006.pdf"
  );
  assert.equal(pdfFileName("Invoice", "BILL/26-27/001 | Oviya"), "BILL-26-27-001.pdf");
  assert.equal(pdfFileName("DC", ""), "DC.pdf");
  assert.equal(pdfFileName("DC", '"; rm -rf /'), "rm-rf.pdf");
});
