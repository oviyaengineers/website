import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clientKey,
  isEmailShape,
  isRecoveryCodeShape,
  isRecoveryPass,
  normalizeEmail,
  passwordProblems,
  recoveryErrorKey,
} from "@/lib/staff-recovery";

test("emails are compared trimmed and lower-case", () => {
  assert.equal(normalizeEmail("  Oviya.Engineers@Gmail.com "), "oviya.engineers@gmail.com");
  assert.equal(isEmailShape("oviya.engineers@gmail.com"), true);
  for (const bad of ["", "oviya", "a@b", "a b@c.com", "@c.com", `${"a".repeat(250)}@c.com`]) {
    assert.equal(isEmailShape(bad), false, bad);
  }
});

test("a code is exactly six digits and a pass is 64 hex characters", () => {
  assert.equal(isRecoveryCodeShape("012345"), true);
  for (const bad of ["12345", "1234567", "12a456", " 123456", ""]) {
    assert.equal(isRecoveryCodeShape(bad), false, bad);
  }
  assert.equal(isRecoveryPass("a".repeat(64)), true);
  assert.equal(isRecoveryPass("A".repeat(64)), false);
  assert.equal(isRecoveryPass("a".repeat(63)), false);
});

test("passwords: at least 8, letters and numbers, not the login, confirmed", () => {
  const email = "staff.member@oviyaengineers.in";
  assert.deepEqual(passwordProblems("Workshop2026", "Workshop2026", email), []);
  assert.deepEqual(passwordProblems("abc123", "abc123", email), ["tooShort"]);
  assert.deepEqual(passwordProblems("abcdefgh", "abcdefgh", email), ["needsNumber"]);
  assert.deepEqual(passwordProblems("12345678", "12345678", email), ["needsLetter"]);
  assert.deepEqual(passwordProblems("Workshop2026", "Workshop2025", email), ["mismatch"]);
  assert.deepEqual(passwordProblems("staff.member1", "staff.member1", email), []);
  assert.ok(passwordProblems("STAFF.MEMBER@oviyaengineers.in1", "x", email).includes("mismatch"));
  assert.deepEqual(passwordProblems(email, email, email).includes("sameAsEmail"), true);
  assert.deepEqual(passwordProblems("a1" + "x".repeat(71), "a1" + "x".repeat(71), email), [
    "tooLong",
  ]);
});

test("the network key is the first forwarded address", () => {
  assert.equal(clientKey("203.0.113.9, 10.0.0.1", null), "203.0.113.9");
  assert.equal(clientKey(null, " 198.51.100.4 "), "198.51.100.4");
  assert.equal(clientKey(null, null), "unknown");
});

test("refusals map to messages that never say whether an account exists", () => {
  assert.equal(recoveryErrorKey("RECOVERY_TOO_SOON"), "auth.recoverTooSoon");
  assert.equal(recoveryErrorKey("RECOVERY_LIMIT"), "auth.recoverLimit");
  assert.equal(recoveryErrorKey("RECOVERY_BAD_EMAIL"), "auth.recoverBadEmail");
  assert.equal(recoveryErrorKey("RECOVERY_PASS_INVALID"), "auth.recoverExpired");
  assert.equal(recoveryErrorKey("anything else"), "auth.recoverError");
});
