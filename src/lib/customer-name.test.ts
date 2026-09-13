import assert from "node:assert/strict";
import { test } from "node:test";
import { shortCustomerName } from "./customer-name.ts";

test("Private Limited is shortened to Pvt Ltd", () => {
  assert.equal(
    shortCustomerName("Moreind Automation Private Limited"),
    "Moreind Automation Pvt Ltd"
  );
});

test("the spellings already abbreviated come out the same way", () => {
  assert.equal(shortCustomerName("Acme Pvt. Ltd."), "Acme Pvt Ltd");
  assert.equal(shortCustomerName("Acme PVT LTD"), "Acme Pvt Ltd");
});

test("a plain Limited becomes Ltd", () => {
  assert.equal(shortCustomerName("Kovai Castings Limited"), "Kovai Castings Ltd");
});

test("a name with no company form is left alone", () => {
  assert.equal(shortCustomerName("Sri Murugan Engineering"), "Sri Murugan Engineering");
});

test("a missing name reads as a dash", () => {
  assert.equal(shortCustomerName(null), "-");
  assert.equal(shortCustomerName(""), "-");
});
