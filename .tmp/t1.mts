import { parseInwardDc } from "../src/lib/ocr/parse-inward-dc.ts";
const text = [
  "MOREIND AUTOMATION PRIVATE LIMITED",
  "D.C. No.",
  "Date",
  "MOR/2526/0123",
  "10/09/2026",
].join("\n");
const r = parseInwardDc(text, { customers: [], components: [], materials: [] });
console.log("dcNumber:", JSON.stringify(r.customerDcNumber), " date:", r.customerDcDate);
