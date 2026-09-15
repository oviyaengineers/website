import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLang, LANGUAGES } from "./config.ts";
import { formatDate } from "./dates.ts";
import {
  DICTIONARIES,
  createTranslator,
  dictionaryKeys,
  interpolate,
  messageAt,
} from "./translate.ts";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every language has exactly the English keys, none empty", () => {
  const english = dictionaryKeys(DICTIONARIES.en).sort();
  assert.ok(english.length > 50);
  for (const lang of LANGUAGES) {
    const keys = dictionaryKeys(DICTIONARIES[lang]).sort();
    assert.deepEqual(keys, english, `${lang} keys differ from English`);
    for (const key of keys) {
      const message = messageAt(DICTIONARIES[lang], key) ?? "";
      assert.ok(message.trim().length > 0, `${lang}.${key} is empty`);
    }
  }
});

test("every translation keeps the same placeholders as English", () => {
  for (const key of dictionaryKeys(DICTIONARIES.en)) {
    const english = placeholders(messageAt(DICTIONARIES.en, key) ?? "");
    for (const lang of LANGUAGES) {
      assert.deepEqual(
        placeholders(messageAt(DICTIONARIES[lang], key) ?? ""),
        english,
        `${lang}.${key} placeholders differ`
      );
    }
  }
});

test("Tamil messages are actually in Tamil where English words were translated", () => {
  const t = createTranslator("ta");
  assert.equal(t("nav.dashboard"), "முகப்பு");
  assert.match(t("nav.allDcs"), /[஀-௿]/);
  assert.equal(createTranslator("en")("nav.dashboard"), "Dashboard");
});

test("values placed into a message are never translated or altered", () => {
  const t = createTranslator("ta");
  const text = t("header.scanNotKept", {
    error: "3P DN40FB/50RB CF8M Body Casting REV 2 · 26-27-005",
  });
  assert.ok(text.includes("3P DN40FB/50RB CF8M Body Casting REV 2 · 26-27-005"));
  assert.equal(interpolate("{a} and {b}", { a: "INV/26-27/001", b: 0 }), "INV/26-27/001 and 0");
  assert.equal(interpolate("{missing}", {}), "{missing}");
});

test("an unknown language falls back to English", () => {
  assert.equal(parseLang("ta"), "ta");
  assert.equal(parseLang("en"), "en");
  assert.equal(parseLang("fr"), "en");
  assert.equal(parseLang(undefined), "en");
  assert.equal(parseLang("TA"), "en");
});

test("dates keep their digits and change only the month name", () => {
  assert.equal(formatDate("2026-09-05", "dd MMM yyyy", "en"), "05 Sep 2026");
  const tamil = formatDate("2026-09-05", "dd MMM yyyy", "ta");
  assert.ok(tamil.startsWith("05 "));
  assert.ok(tamil.endsWith(" 2026"));
  assert.match(tamil, /[஀-௿]/);
  assert.equal(formatDate("2026-09-30", "yyyy-MM-dd", "ta"), "2026-09-30");
});
