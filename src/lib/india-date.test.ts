import assert from "node:assert/strict";
import { test } from "node:test";
import { indiaToday } from "./india-date.ts";

test("just after midnight in India is already the next day", () => {
  // 00:34 IST on 14 Sep is still 13 Sep in UTC.
  assert.equal(indiaToday(new Date("2026-09-13T19:04:00Z")), "2026-09-14");
});

test("from 05:30 IST onwards India and UTC agree", () => {
  assert.equal(indiaToday(new Date("2026-09-14T00:30:00Z")), "2026-09-14");
});

test("late evening in India is still the same day", () => {
  assert.equal(indiaToday(new Date("2026-09-14T18:00:00Z")), "2026-09-14");
});
