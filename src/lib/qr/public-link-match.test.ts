import assert from "node:assert/strict";
import { test } from "node:test";
import { publicDcPathFromQr } from "@/lib/qr/public-link-match";

const TOKEN = "a".repeat(32) + "0123456789abcdef".repeat(2);

test("a printed challan link opens its public page on this site", () => {
  assert.equal(
    publicDcPathFromQr(`https://www.oviyaengineers.in/dc/view/${TOKEN}`),
    `/dc/view/${TOKEN}`
  );
  assert.equal(
    publicDcPathFromQr(`https://oviyaengineers.in/dc/view/${TOKEN}/`),
    `/dc/view/${TOKEN}`
  );
  assert.equal(
    publicDcPathFromQr(`  https://www.oviyaengineers.in/dc/view/${TOKEN.toUpperCase()}\n`),
    `/dc/view/${TOKEN}`,
    "case and stray whitespace from the reader are tolerated"
  );
  assert.equal(
    publicDcPathFromQr(`http://localhost:3000/dc/view/${TOKEN}`, "localhost:3000"),
    `/dc/view/${TOKEN}`
  );
});

test("anything that is not one of our challan links is refused", () => {
  const refused = [
    "",
    "hello",
    "26-27-019",
    "8051e753-ee98-49e1-a523-76c9986d5a6a",
    `https://evil.example/dc/view/${TOKEN}`,
    `https://www.oviyaengineers.in.evil.example/dc/view/${TOKEN}`,
    `https://user:pw@www.oviyaengineers.in/dc/view/${TOKEN}`,
    `http://www.oviyaengineers.in/dc/view/${TOKEN}`,
    `javascript:alert(1)//www.oviyaengineers.in/dc/view/${TOKEN}`,
    `https://www.oviyaengineers.in/dc/view/${TOKEN.slice(1)}`,
    `https://www.oviyaengineers.in/dc/view/${TOKEN}0`,
    `https://www.oviyaengineers.in/dashboard/dc/${TOKEN}`,
    `https://www.oviyaengineers.in/dc/view/${TOKEN}/../../dashboard`,
    `http://localhost:3000/dc/view/${TOKEN}`,
  ];
  for (const text of refused) assert.equal(publicDcPathFromQr(text), null, text);
});
