/**
 * Image preparation for reading a photographed customer challan.
 *
 * Pure functions over greyscale pixel buffers, so the same code runs in the
 * browser's background worker and in tests. Nothing here touches the original
 * photograph: every step returns a new buffer.
 *
 * The pipeline (prepareForOcr):
 *   1. greyscale, capped to a working size;
 *   2. find the paper against its background and straighten its perspective;
 *   3. turn a sideways page upright, then remove small skew;
 *   4. flatten uneven lighting and shadows (divide by the estimated paper);
 *   5. stretch contrast so faint print separates from the paper;
 *   6. light noise removal, then sharpening, enlarged for small or soft text;
 *   7. a second, black-and-white version thresholded locally (Sauvola),
 *      which survives shadows a single page-wide threshold does not.
 * A third, more strongly sharpened version is added for blurred photos.
 */

export type Gray = { width: number; height: number; data: Uint8ClampedArray };

export function makeGray(width: number, height: number, fill = 255): Gray {
  const data = new Uint8ClampedArray(width * height);
  if (fill) data.fill(fill);
  return { width, height, data };
}

/** RGBA pixels (canvas ImageData) to luminance. */
export function rgbaToGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const out = makeGray(width, height, 0);
  for (let i = 0, p = 0; p < out.data.length; i += 4, p += 1) {
    out.data[p] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return out;
}

/** Greyscale back to opaque RGBA, for a canvas. */
export function grayToRgba(g: Gray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(g.width * g.height * 4);
  for (let p = 0, i = 0; p < g.data.length; p += 1, i += 4) {
    out[i] = out[i + 1] = out[i + 2] = g.data[p];
    out[i + 3] = 255;
  }
  return out;
}

function sample(g: Gray, x: number, y: number, fill = 255): number {
  if (x < 0 || y < 0 || x > g.width - 1 || y > g.height - 1) return fill;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, g.width - 1);
  const y1 = Math.min(y0 + 1, g.height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const w = g.width;
  const top = g.data[y0 * w + x0] * (1 - fx) + g.data[y0 * w + x1] * fx;
  const bottom = g.data[y1 * w + x0] * (1 - fx) + g.data[y1 * w + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Bilinear resize; area-averaged first when shrinking a lot, so thin strokes survive. */
export function resize(g: Gray, width: number, height: number): Gray {
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  if (width === g.width && height === g.height) return { ...g, data: g.data.slice() };
  let src = g;
  // Halve by averaging while more than twice too big.
  while (src.width >= width * 2 && src.height >= height * 2) {
    const hw = Math.floor(src.width / 2);
    const hh = Math.floor(src.height / 2);
    const half = makeGray(hw, hh, 0);
    for (let y = 0; y < hh; y += 1) {
      for (let x = 0; x < hw; x += 1) {
        const i = y * 2 * src.width + x * 2;
        half.data[y * hw + x] =
          (src.data[i] + src.data[i + 1] + src.data[i + src.width] + src.data[i + src.width + 1]) /
          4;
      }
    }
    src = half;
  }
  const out = makeGray(width, height, 0);
  const sx = src.width / width;
  const sy = src.height / height;
  for (let y = 0; y < height; y += 1) {
    const yy = (y + 0.5) * sy - 0.5;
    for (let x = 0; x < width; x += 1) {
      out.data[y * width + x] = sample(src, (x + 0.5) * sx - 0.5, yy);
    }
  }
  return out;
}

export function scaleToLongEdge(g: Gray, longEdge: number): Gray {
  const scale = longEdge / Math.max(g.width, g.height);
  if (Math.abs(scale - 1) < 0.01) return g;
  return resize(g, g.width * scale, g.height * scale);
}

/** Summed-area table, one row and column larger than the image. */
function integral(g: Gray, squared = false): Float64Array {
  const w = g.width + 1;
  const table = new Float64Array(w * (g.height + 1));
  for (let y = 1; y <= g.height; y += 1) {
    let row = 0;
    for (let x = 1; x <= g.width; x += 1) {
      const v = g.data[(y - 1) * g.width + (x - 1)];
      row += squared ? v * v : v;
      table[y * w + x] = table[(y - 1) * w + x] + row;
    }
  }
  return table;
}

function areaSum(
  table: Float64Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
) {
  const w = width + 1;
  return table[y1 * w + x1] - table[y0 * w + x1] - table[y1 * w + x0] + table[y0 * w + x0];
}

/**
 * Mean of a (2r+1)² box around every pixel, as two running-sum passes so a
 * full-size photo needs no more memory than one extra copy of itself.
 */
export function boxBlur(g: Gray, radius: number): Gray {
  if (radius <= 0) return { ...g, data: g.data.slice() };
  const { width: w, height: h } = g;
  const mid = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    let sum = 0;
    let lo = 0;
    let hi = -1;
    for (let x = 0; x < w; x += 1) {
      const want1 = Math.min(w - 1, x + radius);
      const want0 = Math.max(0, x - radius);
      while (hi < want1) sum += g.data[row + ++hi];
      while (lo < want0) sum -= g.data[row + lo++];
      mid[row + x] = sum / (hi - lo + 1);
    }
  }
  const out = makeGray(w, h, 0);
  for (let x = 0; x < w; x += 1) {
    let sum = 0;
    let lo = 0;
    let hi = -1;
    for (let y = 0; y < h; y += 1) {
      const want1 = Math.min(h - 1, y + radius);
      const want0 = Math.max(0, y - radius);
      while (hi < want1) sum += mid[++hi * w + x];
      while (lo < want0) sum -= mid[lo++ * w + x];
      out.data[y * w + x] = sum / (hi - lo + 1);
    }
  }
  return out;
}

/** Brightest value in a (2r+1) window, rows then columns (a greyscale dilation). */
export function maxFilter(g: Gray, radius: number): Gray {
  const pass = (src: Gray, horizontal: boolean): Gray => {
    const out = makeGray(src.width, src.height, 0);
    const outer = horizontal ? src.height : src.width;
    const inner = horizontal ? src.width : src.height;
    const at = (o: number, i: number) => (horizontal ? o * src.width + i : i * src.width + o);
    const line = new Uint8ClampedArray(inner);
    for (let o = 0; o < outer; o += 1) {
      for (let i = 0; i < inner; i += 1) line[i] = src.data[at(o, i)];
      // Monotonic deque of indices.
      const deque = new Int32Array(inner);
      let head = 0;
      let tail = 0;
      for (let i = 0; i < inner + radius; i += 1) {
        if (i < inner) {
          while (tail > head && line[deque[tail - 1]] <= line[i]) tail -= 1;
          deque[tail++] = i;
        }
        const centre = i - radius;
        if (centre >= 0) {
          while (deque[head] < centre - radius) head += 1;
          out.data[at(o, centre)] = line[deque[head]];
        }
      }
    }
    return out;
  };
  return pass(pass(g, true), false);
}

/** 3×3 median, for speckle from a noisy phone sensor. */
export function median3(g: Gray): Gray {
  const out = makeGray(g.width, g.height, 0);
  const w = g.width;
  const window = new Uint8Array(9);
  for (let y = 0; y < g.height; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = Math.min(g.height - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          window[n++] = g.data[yy * w + xx];
        }
      }
      window.sort();
      out.data[y * w + x] = window[4];
    }
  }
  return out;
}

/** Unsharp mask: the image plus `amount` times its detail at `radius`. */
export function unsharp(g: Gray, radius: number, amount: number): Gray {
  const blurred = boxBlur(g, radius);
  const out = makeGray(g.width, g.height, 0);
  for (let i = 0; i < g.data.length; i += 1) {
    out.data[i] = g.data[i] + amount * (g.data[i] - blurred.data[i]);
  }
  return out;
}

function histogram(g: Gray): Uint32Array {
  const h = new Uint32Array(256);
  for (let i = 0; i < g.data.length; i += 1) h[g.data[i]] += 1;
  return h;
}

function percentile(h: Uint32Array, total: number, fraction: number): number {
  const target = total * fraction;
  let seen = 0;
  for (let v = 0; v < 256; v += 1) {
    seen += h[v];
    if (seen >= target) return v;
  }
  return 255;
}

/** Linear stretch between two percentiles, skipped when there is no real spread. */
export function stretchContrast(g: Gray, low = 0.01, high = 0.995): Gray {
  const h = histogram(g);
  const lo = percentile(h, g.data.length, low);
  const hi = percentile(h, g.data.length, high);
  if (hi - lo < 24) return { ...g, data: g.data.slice() };
  const out = makeGray(g.width, g.height, 0);
  const span = hi - lo;
  for (let i = 0; i < g.data.length; i += 1) out.data[i] = ((g.data[i] - lo) * 255) / span;
  return out;
}

/**
 * Divides out the paper's own brightness, which removes shadows, a darker
 * corner and uneven lamp light. The paper is estimated by dilating (so ink
 * disappears into the paper around it) and blurring.
 */
export function flattenIllumination(g: Gray): Gray {
  const radius = Math.max(4, Math.round(Math.min(g.width, g.height) / 160));
  const small = scaleToLongEdge(g, Math.min(800, Math.max(g.width, g.height)));
  const factor = small.width / g.width;
  const paperSmall = boxBlur(
    maxFilter(small, Math.max(2, Math.round(radius * factor))),
    Math.max(4, Math.round(radius * 3 * factor))
  );
  const paper = resize(paperSmall, g.width, g.height);
  const out = makeGray(g.width, g.height, 0);
  for (let i = 0; i < g.data.length; i += 1) {
    const bg = Math.max(24, paper.data[i]);
    out.data[i] = Math.min(255, (g.data[i] * 255) / bg);
  }
  return out;
}

/** Otsu's global threshold. */
export function otsu(g: Gray): number {
  const h = histogram(g);
  const total = g.data.length;
  let sum = 0;
  for (let v = 0; v < 256; v += 1) sum += v * h[v];
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 128;
  for (let v = 0; v < 256; v += 1) {
    weightB += h[v];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += v * h[v];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) * (meanB - meanF);
    if (between > best) {
      best = between;
      threshold = v;
    }
  }
  return threshold;
}

/**
 * Sauvola local threshold: black where a pixel is darker than its
 * neighbourhood's mean adjusted by its contrast. Faint print in a shadow stays
 * black and a bright glare patch stays white.
 */
export function sauvola(g: Gray, window: number, k = 0.2, dynamicRange = 128): Gray {
  // The window is tens of pixels wide, so its mean and spread are measured on
  // a copy at most a quarter the size and the threshold map is enlarged back.
  // Summed-area tables of a full-size photo would need hundreds of megabytes.
  const factor = window >= 24 && g.width * g.height > 400_000 ? 4 : 1;
  const small = factor > 1 ? resize(g, g.width / factor, g.height / factor) : g;
  const sums = integral(small);
  const squares = integral(small, true);
  const r = Math.max(1, Math.floor(window / 2 / factor));
  const thresholds = makeGray(small.width, small.height, 0);
  for (let y = 0; y < small.height; y += 1) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(small.height, y + r + 1);
    for (let x = 0; x < small.width; x += 1) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(small.width, x + r + 1);
      const n = (x1 - x0) * (y1 - y0);
      const mean = areaSum(sums, small.width, x0, y0, x1, y1) / n;
      const variance = Math.max(0, areaSum(squares, small.width, x0, y0, x1, y1) / n - mean * mean);
      thresholds.data[y * small.width + x] =
        mean * (1 + k * (Math.sqrt(variance) / dynamicRange - 1));
    }
  }
  const map = factor > 1 ? resize(thresholds, g.width, g.height) : thresholds;
  const out = makeGray(g.width, g.height, 0);
  for (let i = 0; i < g.data.length; i += 1) out.data[i] = g.data[i] > map.data[i] ? 255 : 0;
  return out;
}

/** Variance of the Laplacian on a normalised copy: low means a soft, blurred photo. */
export function sharpness(g: Gray): number {
  const s = scaleToLongEdge(g, Math.min(1200, Math.max(g.width, g.height)));
  const w = s.width;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < s.height - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const lap = 4 * s.data[i] - s.data[i - 1] - s.data[i + 1] - s.data[i - w] - s.data[i + w];
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Rotate by a quarter turn k times, clockwise. */
export function rotate90(g: Gray, k: number): Gray {
  const turns = ((k % 4) + 4) % 4;
  if (turns === 0) return g;
  const { width: w, height: h } = g;
  const out = turns === 2 ? makeGray(w, h, 0) : makeGray(h, w, 0);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = g.data[y * w + x];
      if (turns === 1) out.data[x * h + (h - 1 - y)] = v;
      else if (turns === 2) out.data[(h - 1 - y) * w + (w - 1 - x)] = v;
      else out.data[(w - 1 - x) * h + y] = v;
    }
  }
  return out;
}

/** Rotate by an angle in degrees (positive is clockwise), growing the canvas, white fill. */
export function rotateDegrees(g: Gray, degrees: number): Gray {
  if (Math.abs(degrees) < 0.05) return g;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const w = Math.ceil(Math.abs(g.width * cos) + Math.abs(g.height * sin));
  const h = Math.ceil(Math.abs(g.width * sin) + Math.abs(g.height * cos));
  const out = makeGray(w, h, 255);
  const cx = g.width / 2;
  const cy = g.height / 2;
  for (let y = 0; y < h; y += 1) {
    const dy = y - h / 2;
    for (let x = 0; x < w; x += 1) {
      const dx = x - w / 2;
      out.data[y * w + x] = sample(g, cos * dx + sin * dy + cx, -sin * dx + cos * dy + cy);
    }
  }
  return out;
}

/** Dark pixels of a small binarised copy, for the angle searches. */
function inkPoints(
  g: Gray,
  longEdge = 900
): { xs: Float64Array; ys: Float64Array; w: number; h: number } {
  const small = scaleToLongEdge(g, Math.min(longEdge, Math.max(g.width, g.height)));
  const bin = sauvola(flattenIllumination(small), Math.max(15, Math.round(small.width / 40)), 0.3);
  let count = 0;
  for (let i = 0; i < bin.data.length; i += 1) if (bin.data[i] === 0) count += 1;
  // Sample so the search stays quick on a dense page.
  const step = Math.max(1, Math.floor(count / 60000));
  const xs = new Float64Array(Math.ceil(count / step));
  const ys = new Float64Array(Math.ceil(count / step));
  let seen = 0;
  let n = 0;
  for (let y = 0; y < bin.height; y += 1) {
    for (let x = 0; x < bin.width; x += 1) {
      if (bin.data[y * bin.width + x] !== 0) continue;
      if (seen++ % step === 0 && n < xs.length) {
        xs[n] = x;
        ys[n] = y;
        n += 1;
      }
    }
  }
  return { xs: xs.subarray(0, n), ys: ys.subarray(0, n), w: bin.width, h: bin.height };
}

/** How strongly the ink lines up in horizontal rows when turned by `degrees`. */
function rowScore(
  points: { xs: Float64Array; ys: Float64Array; w: number; h: number },
  degrees: number
): number {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const size = Math.ceil(points.w + points.h) + 2;
  const bins = new Float64Array(size);
  const offset = points.w;
  for (let i = 0; i < points.xs.length; i += 1) {
    const yy = Math.round(points.ys[i] * cos - points.xs[i] * sin) + offset;
    if (yy >= 0 && yy < size) bins[yy] += 1;
  }
  let score = 0;
  for (let i = 0; i < size; i += 1) score += bins[i] * bins[i];
  return score;
}

/**
 * The page's skew in degrees (clockwise positive) and whether its text runs
 * down the page rather than across, from how well the ink forms rows.
 */
export function detectOrientation(g: Gray): { sideways: boolean; skewDegrees: number } {
  const points = inkPoints(g);
  if (points.xs.length < 200) return { sideways: false, skewDegrees: 0 };
  let best = 0;
  let bestScore = -1;
  for (let a = -12; a <= 12; a += 1) {
    const s = rowScore(points, a);
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  for (let a = best - 1; a <= best + 1; a += 0.2) {
    const s = rowScore(points, a);
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  // Columns instead of rows: compare against the same search turned 90°.
  let sideScore = -1;
  let sideAngle = 0;
  for (let a = 78; a <= 102; a += 1) {
    const s = rowScore(points, a);
    if (s > sideScore) {
      sideScore = s;
      sideAngle = a;
    }
  }
  if (sideScore > bestScore * 1.35) {
    return { sideways: true, skewDegrees: Math.round((sideAngle - 90) * 10) / 10 };
  }
  return { sideways: false, skewDegrees: Math.round(best * 10) / 10 };
}

export type Point = { x: number; y: number };

/**
 * The corners of the paper when it is photographed against a darker
 * background, or null when the page fills the picture or cannot be told apart.
 * Corners are in the given image's pixels: top-left, top-right, bottom-right,
 * bottom-left.
 */
export function findPageQuad(g: Gray): Point[] | null {
  const small = scaleToLongEdge(g, Math.min(500, Math.max(g.width, g.height)));
  const blurred = boxBlur(small, 2);
  const t = otsu(blurred);
  const w = small.width;
  const h = small.height;
  const bright = new Uint8Array(w * h);
  let brightCount = 0;
  for (let i = 0; i < bright.length; i += 1) {
    if (blurred.data[i] > t) {
      bright[i] = 1;
      brightCount += 1;
    }
  }
  const fraction = brightCount / bright.length;
  if (fraction < 0.2 || fraction > 0.97) return null;

  // Largest bright connected region.
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let bestLabel = 0;
  let bestSize = 0;
  let next = 1;
  for (let start = 0; start < bright.length; start += 1) {
    if (!bright[start] || label[start]) continue;
    let top = 0;
    stack[top++] = start;
    label[start] = next;
    let size = 0;
    while (top > 0) {
      const p = stack[--top];
      size += 1;
      const x = p % w;
      const y = (p - x) / w;
      for (const q of [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ]) {
        if (q < 0 || !bright[q] || label[q]) continue;
        label[q] = next;
        stack[top++] = q;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = next;
    }
    next += 1;
  }
  if (bestSize < w * h * 0.25) return null;

  let tl = { x: 0, y: 0, v: Infinity };
  let br = { x: 0, y: 0, v: -Infinity };
  let tr = { x: 0, y: 0, v: -Infinity };
  let bl = { x: 0, y: 0, v: Infinity };
  let touches = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (label[y * w + x] !== bestLabel) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches += 1;
      const sum = x + y;
      const diff = x - y;
      if (sum < tl.v) tl = { x, y, v: sum };
      if (sum > br.v) br = { x, y, v: sum };
      if (diff > tr.v) tr = { x, y, v: diff };
      if (diff < bl.v) bl = { x, y, v: diff };
    }
  }
  const quad = [tl, tr, br, bl].map((p) => ({ x: p.x, y: p.y }));
  const area =
    Math.abs(
      quad.reduce((acc, p, i) => {
        const q = quad[(i + 1) % 4];
        return acc + p.x * q.y - q.x * p.y;
      }, 0)
    ) / 2;
  // Nearly the whole frame, or a region hugging the borders all round: the page
  // already fills the photo, so there is nothing worth cutting away.
  if (area > w * h * 0.9 || touches > 2 * (w + h) * 0.5) return null;
  if (area < w * h * 0.25) return null;

  const scale = g.width / w;
  return quad.map((p) => ({ x: (p.x + 0.5) * scale, y: (p.y + 0.5) * scale }));
}

/** Solves the 3×3 homography taking `from` corners onto `to` corners. */
function homography(from: Point[], to: Point[]): number[] {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 8; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    const div = a[col][col] || 1e-12;
    for (let row = 0; row < 8; row += 1) {
      if (row === col) continue;
      const f = a[row][col] / div;
      if (f === 0) continue;
      for (let c = col; c < 8; c += 1) a[row][c] -= f * a[col][c];
      b[row] -= f * b[col];
    }
  }
  return [...b.map((v, i) => v / (a[i][i] || 1e-12)), 1];
}

/** The page straightened: `quad` mapped onto an upright rectangle. */
export function warpQuad(g: Gray, quad: Point[]): Gray {
  const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
  const width = Math.round(Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2])));
  const height = Math.round(Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2])));
  const rect = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  // Output pixel → source pixel.
  const m = homography(rect, quad);
  const out = makeGray(width, height, 255);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const z = m[6] * x + m[7] * y + m[8];
      out.data[y * width + x] = sample(
        g,
        (m[0] * x + m[1] * y + m[2]) / z,
        (m[3] * x + m[4] * y + m[5]) / z
      );
    }
  }
  return out;
}

/**
 * Where the ruled lines of a boxed form are.
 *
 * Challans are tables, and Tesseract treats a cell border touching a word as
 * part of it or drops the cell altogether: on a clean test challan it lost a
 * whole description and every serial number to the borders beside them. Runs
 * of dark pixels far longer than any letter are lines, not text. The mask
 * includes a pixel of margin for a line's soft edge.
 */
export function ruledLineMask(g: Gray, darkBelow = 128): Uint8Array {
  const { width: w, height: h } = g;
  const minH = Math.max(40, Math.round(w / 20));
  const minV = Math.max(40, Math.round(h / 25));
  const line = new Uint8Array(w * h);
  // A printed or photographed line breaks up here and there, so runs may
  // bridge gaps of up to MAX_GAP light pixels.
  const MAX_GAP = 3;
  for (let y = 0; y < h; y += 1) {
    let start = -1;
    let lastDark = -1;
    for (let x = 0; x <= w; x += 1) {
      const dark = x < w && g.data[y * w + x] < darkBelow;
      if (dark) {
        if (start < 0 || x - lastDark > MAX_GAP + 1) {
          if (start >= 0 && lastDark - start + 1 >= minH)
            line.fill(1, y * w + start, y * w + lastDark + 1);
          start = x;
        }
        lastDark = x;
      }
      if (x === w && start >= 0 && lastDark - start + 1 >= minH) {
        line.fill(1, y * w + start, y * w + lastDark + 1);
      }
    }
  }
  for (let x = 0; x < w; x += 1) {
    let start = -1;
    let lastDark = -1;
    const mark = (from: number, to: number) => {
      for (let i = from; i <= to; i += 1) line[i * w + x] = 1;
    };
    for (let y = 0; y <= h; y += 1) {
      const dark = y < h && g.data[y * w + x] < darkBelow;
      if (dark) {
        if (start < 0 || y - lastDark > MAX_GAP + 1) {
          if (start >= 0 && lastDark - start + 1 >= minV) mark(start, lastDark);
          start = y;
        }
        lastDark = y;
      }
      if (y === h && start >= 0 && lastDark - start + 1 >= minV) mark(start, lastDark);
    }
  }
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!line[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx >= 0 && xx < w) mask[yy * w + xx] = 1;
        }
      }
    }
  }
  return mask;
}

/** The image with every masked pixel painted white. */
export function whiteOut(g: Gray, mask: Uint8Array): Gray {
  const out = { ...g, data: g.data.slice() };
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) out.data[i] = 255;
  return out;
}

export type OcrVariantName = "enhanced" | "binary" | "sharpened";

export type PreparedForOcr = {
  variants: { name: OcrVariantName; image: Gray }[];
  /** What was done, for the review screen and for tests. */
  report: {
    pageFound: boolean;
    quarterTurns: number;
    skewDegrees: number;
    sharpness: number;
    blurred: boolean;
    workingLongEdge: number;
  };
};

/** Below this Laplacian variance a photo is treated as blurred. */
export const BLUR_THRESHOLD = 180;

/**
 * Everything above, from a greyscale photo. `thorough` adds the sharpened
 * variant even when the photo does not measure as blurred (Try OCR again).
 */
export function prepareForOcr(
  input: Gray,
  options: { thorough?: boolean; quarterTurns?: number } = {}
): PreparedForOcr {
  // A working size: large enough for small table text, bounded for speed.
  let g = scaleToLongEdge(input, Math.min(2600, Math.max(input.width, input.height)));

  const quad = findPageQuad(g);
  if (quad) g = warpQuad(g, quad);

  const orientation = detectOrientation(g);
  let turns = orientation.sideways ? 1 : 0;
  if (options.quarterTurns !== undefined) turns += options.quarterTurns;
  g = rotate90(g, turns);
  const skew = orientation.skewDegrees;
  if (Math.abs(skew) >= 0.3) {
    // Rows line up when the ink is turned by `skew`; the page itself turns back.
    g = rotateDegrees(g, -skew);
  }

  const flat = flattenIllumination(g);
  const contrast = stretchContrast(flat);
  const sharp = sharpness(contrast);
  const blurred = sharp < BLUR_THRESHOLD;

  // Small text: enlarge so letters are tall enough for the recogniser.
  const longEdge = Math.max(contrast.width, contrast.height);
  const target = blurred || options.thorough ? 3200 : 2800;
  const base = longEdge < target ? scaleToLongEdge(contrast, target) : contrast;

  // A light blur takes sensor speckle out before sharpening brings edges back.
  const denoised = boxBlur(base, 1);
  const sharpened = unsharp(denoised, 2, 1.0);
  const window = Math.max(25, Math.round(Math.max(base.width, base.height) / 60)) | 1;
  const thresholded = sauvola(sharpened, window, 0.25);
  // Table borders out of every version, found once on the black-and-white one.
  const lines = ruledLineMask(thresholded);
  const enhanced = whiteOut(sharpened, lines);
  const binary = whiteOut(thresholded, lines);

  const variants: PreparedForOcr["variants"] = [
    { name: "enhanced", image: enhanced },
    { name: "binary", image: binary },
  ];
  if (blurred || options.thorough) {
    variants.push({
      name: "sharpened",
      image: whiteOut(unsharp(unsharp(denoised, 3, 1.4), 1, 0.8), lines),
    });
  }

  return {
    variants,
    report: {
      pageFound: quad !== null,
      quarterTurns: ((turns % 4) + 4) % 4,
      skewDegrees: skew,
      sharpness: Math.round(sharp),
      blurred,
      workingLongEdge: Math.max(base.width, base.height),
    },
  };
}
