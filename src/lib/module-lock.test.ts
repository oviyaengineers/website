import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterUnlockPath,
  isObviousPin,
  isOtpShape,
  isPinShape,
  maskEmail,
  moduleForPath,
  unlockPathFor,
} from "@/lib/module-lock";

test("every Billing screen belongs to Billing", () => {
  for (const path of [
    "/dashboard/invoices",
    "/dashboard/invoices/new",
    "/dashboard/invoices/unbilled",
    "/dashboard/invoices/3fd1ef36-be64-4aeb-bf38-9f28df091a1f",
    "/dashboard/invoices/3fd1ef36-be64-4aeb-bf38-9f28df091a1f/print",
    "/dashboard/reports/outstanding",
    "/dashboard/settings/billing",
    "/dashboard/settings/invoice-numbers",
    "/dashboard/settings/rates",
    "/dashboard/invoices/",
  ]) {
    assert.equal(moduleForPath(path), "billing", path);
  }
});

test("Weight / Scrap screens belong to Weight", () => {
  assert.equal(moduleForPath("/dashboard/weight"), "weight");
  assert.equal(moduleForPath("/dashboard/weight/70d41569-e5d2-4939-9abd-26eebb412aa4"), "weight");
});

test("everything else stays open", () => {
  for (const path of [
    "/dashboard",
    "/dashboard/dc",
    "/dashboard/dc/new",
    "/dashboard/completed",
    "/dashboard/stock",
    "/dashboard/costs",
    "/dashboard/customers",
    "/dashboard/settings/dc-numbers",
    "/dashboard/settings/components",
    "/dashboard/settings/security",
    "/dashboard/unlock/billing",
    "/dashboard/invoicesx",
    "/dashboard/weightings",
  ]) {
    assert.equal(moduleForPath(path), null, path);
  }
});

test("after unlocking, only a page of that same module is followed", () => {
  assert.equal(
    afterUnlockPath("billing", "/dashboard/invoices/new?month=2026-09"),
    "/dashboard/invoices/new?month=2026-09"
  );
  assert.equal(afterUnlockPath("billing", "/dashboard/weight"), "/dashboard/invoices");
  assert.equal(afterUnlockPath("weight", "/dashboard/invoices"), "/dashboard/weight");
  assert.equal(
    afterUnlockPath("billing", "https://evil.example/dashboard/invoices"),
    "/dashboard/invoices"
  );
  assert.equal(
    afterUnlockPath("billing", "//evil.example/dashboard/invoices"),
    "/dashboard/invoices"
  );
  assert.equal(afterUnlockPath("billing", "/\\evil.example"), "/dashboard/invoices");
  assert.equal(afterUnlockPath("billing", null), "/dashboard/invoices");
  assert.equal(
    unlockPathFor("weight", "/dashboard/weight?dc=all"),
    "/dashboard/unlock/weight?next=%2Fdashboard%2Fweight%3Fdc%3Dall"
  );
});

test("PIN and code shapes", () => {
  for (const good of ["5831", "0472", "9030"]) assert.equal(isPinShape(good), true, good);
  for (const bad of ["", "123", "12345", "12a4", " 123", "1 23", "１２３４", "-123"]) {
    assert.equal(isPinShape(bad), false, JSON.stringify(bad));
  }
  assert.equal(isOtpShape("048213"), true);
  assert.equal(isOtpShape("48213"), false);
  assert.equal(isOtpShape("0482130"), false);
});

test("obvious PINs are refused, as the database refuses them", () => {
  for (const pin of [
    "0000",
    "1111",
    "1234",
    "0123",
    "6789",
    "9876",
    "3210",
    "1212",
    "1122",
    "2580",
    "1998",
  ]) {
    assert.equal(isObviousPin(pin), true, pin);
  }
  for (const pin of ["5831", "7294", "4816", "0472"]) assert.equal(isObviousPin(pin), false, pin);
});

test("email is shown masked", () => {
  assert.equal(maskEmail("oviya.engineers@gmail.com"), "ov•••••••••••••@gmail.com");
  assert.equal(maskEmail("ab@x.in"), "a••@x.in".replace("a••", "a••"));
  assert.equal(maskEmail(null), "");
});
