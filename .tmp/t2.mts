import { parseInwardDc } from "../src/lib/ocr/parse-inward-dc.ts";
const known = [
  "3P DN25FB/32RB CF8M Body Casting REV 2",
  "3P DN40FB/50RB CF8M Body Casting REV 2",
  "3P DN50RB CF8M #150 Flg Connector Casting",
];
const text = [
  "MOREIND AUTOMATION PRIVATE LIMITED",
  "D.C. No.",
  "Date",
  "MOR/2526/0123",
  "10/09/2026",
  "Sl No. Product Description Quantity",
  "| 1 3P DN40FB/50RB CF8M Body Casting REV 2",
  "| 2 3P DNSORB CF8M #150 Fig Connector Casting",
  "200.000 EA",
  "400.000 EA",
].join("\n");
const r = parseInwardDc(text, { customers: [], components: known, materials: ["CF8M"] });
console.log("dcNumber:", r.customerDcNumber, "date:", r.customerDcDate);
console.log("items:", r.items.map((i) => `${i.component} x${i.received_qty}`));
console.log("newComponents:", r.newComponents.map((c) => c.name));
console.log("unmatched:", r.unmatchedLines);
