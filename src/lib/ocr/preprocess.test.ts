import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boxBlur,
  detectOrientation,
  findPageQuad,
  flattenIllumination,
  makeGray,
  maxFilter,
  prepareForOcr,
  rotate90,
  rotateDegrees,
  sauvola,
  sharpness,
  warpQuad,
  type Gray,
} from "@/lib/ocr/preprocess";

/** A page of "text": rows of short dark dashes on white paper. */
function textPage(width = 700, height = 900): Gray {
  const g = makeGray(width, height, 245);
  for (let row = 60; row < height - 60; row += 34) {
    for (let x = 50; x < width - 50; x += 16) {
      if ((x * 7 + row) % 5 === 0) continue; // word gaps
      for (let y = row; y < row + 12; y += 1) {
        for (let dx = 0; dx < 10; dx += 1) g.data[y * width + x + dx] = 30;
      }
    }
  }
  return g;
}

function darkFraction(g: Gray, threshold = 128): number {
  let n = 0;
  for (let i = 0; i < g.data.length; i += 1) if (g.data[i] < threshold) n += 1;
  return n / g.data.length;
}

test("a straight page measures no skew and is not sideways", () => {
  const o = detectOrientation(textPage());
  assert.equal(o.sideways, false);
  assert.ok(Math.abs(o.skewDegrees) <= 0.4, `skew ${o.skewDegrees}`);
});

test("a tilted page is measured and straightened back", () => {
  for (const tilt of [3, -5, 8]) {
    const tilted = rotateDegrees(textPage(), tilt);
    const measured = detectOrientation(tilted).skewDegrees;
    assert.ok(
      Math.abs(Math.abs(measured) - Math.abs(tilt)) <= 0.6,
      `tilt ${tilt} measured ${measured}`
    );
    const straightened = rotateDegrees(tilted, -measured);
    assert.ok(
      Math.abs(detectOrientation(straightened).skewDegrees) <= 0.6,
      `after straightening ${tilt}: ${detectOrientation(straightened).skewDegrees}`
    );
  }
});

test("a sideways page is recognised as sideways", () => {
  assert.equal(detectOrientation(rotate90(textPage(), 1)).sideways, true);
  assert.equal(detectOrientation(rotate90(textPage(), 3)).sideways, true);
});

test("quarter turns round-trip exactly", () => {
  const page = textPage(120, 80);
  assert.deepEqual(rotate90(rotate90(page, 1), 3).data, page.data);
  assert.deepEqual(rotate90(rotate90(page, 2), 2).data, page.data);
});

test("a page photographed on a dark desk is found, cropped and squared up", () => {
  const photo = makeGray(900, 1100, 40);
  // A trapezoid of paper: narrower at the top, as when photographed at an angle.
  const quad = [
    { x: 220, y: 120 },
    { x: 700, y: 140 },
    { x: 800, y: 1000 },
    { x: 100, y: 980 },
  ];
  const inside = (x: number, y: number) => {
    let sign = 0;
    for (let i = 0; i < 4; i += 1) {
      const a = quad[i];
      const b = quad[(i + 1) % 4];
      const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      const s = Math.sign(cross);
      if (s !== 0 && sign !== 0 && s !== sign) return false;
      if (s !== 0) sign = s;
    }
    return true;
  };
  for (let y = 0; y < photo.height; y += 1) {
    for (let x = 0; x < photo.width; x += 1)
      if (inside(x, y)) photo.data[y * photo.width + x] = 240;
  }
  const found = findPageQuad(photo);
  assert.ok(found, "page found");
  for (let i = 0; i < 4; i += 1) {
    assert.ok(
      Math.hypot(found[i].x - quad[i].x, found[i].y - quad[i].y) < 25,
      `corner ${i}: ${JSON.stringify(found[i])} vs ${JSON.stringify(quad[i])}`
    );
  }
  const flat = warpQuad(photo, found);
  assert.ok(darkFraction(flat, 128) < 0.03, "almost no desk left after cropping");
});

test("a page that already fills the photo is left uncropped", () => {
  assert.equal(findPageQuad(textPage()), null);
});

test("a shadow across the page does not swallow the text", () => {
  const page = textPage();
  // Darken the right half heavily, as a hand or phone shadow would, with the
  // soft edge a real shadow has.
  for (let y = 0; y < page.height; y += 1) {
    for (let x = page.width / 2 - 40; x < page.width; x += 1) {
      const i = y * page.width + x;
      const depth = Math.min(1, (x - (page.width / 2 - 40)) / 80);
      page.data[i] = page.data[i] * (1 - 0.65 * depth);
    }
  }
  const flat = flattenIllumination(page);
  const binary = sauvola(flat, 41, 0.25);
  // The paper in the shadow reads as paper again, and the dashes survive.
  const right = { width: page.width / 2, height: page.height, data: new Uint8ClampedArray(0) };
  let paperWhite = 0;
  let inkBlack = 0;
  let paper = 0;
  let ink = 0;
  const original = textPage();
  for (let y = 0; y < page.height; y += 1) {
    for (let x = right.width; x < page.width; x += 1) {
      const i = y * page.width + x;
      if (original.data[i] > 128) {
        paper += 1;
        if (binary.data[i] === 255) paperWhite += 1;
      } else {
        ink += 1;
        if (binary.data[i] === 0) inkBlack += 1;
      }
    }
  }
  assert.ok(paperWhite / paper > 0.97, `paper kept white: ${(paperWhite / paper).toFixed(3)}`);
  assert.ok(inkBlack / ink > 0.9, `ink kept black: ${(inkBlack / ink).toFixed(3)}`);
});

test("blur is measured", () => {
  const page = textPage();
  assert.ok(sharpness(page) > sharpness(boxBlur(boxBlur(page, 3), 3)) * 4);
});

test("max filter removes thin dark strokes", () => {
  const page = textPage();
  assert.ok(darkFraction(maxFilter(page, 7)) < 0.001);
});

test("the full preparation keeps the original untouched and adds variants", () => {
  const photo = rotateDegrees(textPage(), 4);
  const copy = photo.data.slice();
  const prepared = prepareForOcr(photo);
  assert.deepEqual(photo.data, copy, "original pixels unchanged");
  assert.deepEqual(
    prepared.variants.map((v) => v.name),
    ["enhanced", "binary"]
  );
  assert.ok(
    Math.abs(prepared.report.skewDegrees - 4) <= 0.6 ||
      Math.abs(prepared.report.skewDegrees + 4) <= 0.6
  );
  const thorough = prepareForOcr(photo, { thorough: true });
  assert.deepEqual(
    thorough.variants.map((v) => v.name),
    ["enhanced", "binary", "sharpened"]
  );
});
