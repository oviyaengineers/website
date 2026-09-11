import assert from "node:assert/strict";
import { test } from "node:test";
import { componentNameIndex, componentNameOf } from "./dc-components.ts";

const LIST = [
  { id: "a", kind: "component", name: "3P DN50RB CF8M #150 Flg Connector Casting" },
  { id: "b", kind: "material", name: "Cf8m" },
];
const NAMES = componentNameIndex(LIST);

test("a row with an id takes its name from the master list", () => {
  // The point of the id: the row still stores the old spelling, and the
  // rename in Settings reaches it without anything rewriting the row.
  const item = { component_id: "a", component: "3P DNSORB CF8M #150 Fig Connector Casting" };
  assert.equal(componentNameOf(item, NAMES), "3P DN50RB CF8M #150 Flg Connector Casting");
});

test("a row with no id keeps the name it stored", () => {
  const item = { component_id: null, component: "Some older part" };
  assert.equal(componentNameOf(item, NAMES), "Some older part");
});

test("a row whose component was deleted falls back rather than blanking", () => {
  // on delete set null leaves the id empty, but the line recorded real
  // pieces and has to stay readable.
  const item = { component_id: "gone", component: "3P DN25FB/32RB CF8M Body Casting REV 2" };
  assert.equal(componentNameOf(item, NAMES), "3P DN25FB/32RB CF8M Body Casting REV 2");
});

test("materials are not indexed as components", () => {
  assert.equal(NAMES.has("b"), false);
});
