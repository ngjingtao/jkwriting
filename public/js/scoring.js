// Pure geometry + scoring helpers. No DOM here, so this file can be unit tested
// and reused by the browser.

export const TOLERANCE = { lenient: 1.3, normal: 1, strict: 0.82 };

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i += 1) len += dist(points[i - 1], points[i]);
  return len;
}

/** Resample a polyline into `n` points spaced evenly by arc length. */
export function resample(points, n = 32) {
  if (!points?.length) return [];
  if (points.length === 1) return Array.from({ length: n }, () => [points[0][0], points[0][1]]);

  const cum = [0];
  for (let i = 1; i < points.length; i += 1) cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  const total = cum[cum.length - 1];
  if (total < 1e-9) return Array.from({ length: n }, () => [points[0][0], points[0][1]]);

  const out = [];
  let seg = 1;
  for (let i = 0; i < n; i += 1) {
    const target = (total * i) / (n - 1);
    while (seg < cum.length - 1 && cum[seg] < target) seg += 1;
    const a = points[seg - 1];
    const b = points[seg];
    const span = cum[seg] - cum[seg - 1] || 1;
    const t = Math.min(1, Math.max(0, (target - cum[seg - 1]) / span));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

function meanDistance(A, B) {
  let sum = 0;
  for (let i = 0; i < A.length; i += 1) sum += dist(A[i], B[i]);
  return sum / A.length;
}

/** Shape similarity ignoring position and overall size. */
function shapeSimilarity(A, B) {
  const cen = (pts) => {
    const c = [0, 0];
    for (const p of pts) {
      c[0] += p[0];
      c[1] += p[1];
    }
    return [c[0] / pts.length, c[1] / pts.length];
  };
  const rms = (pts, c) => {
    let s = 0;
    for (const p of pts) s += (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2;
    return Math.sqrt(s / pts.length);
  };

  const ca = cen(A);
  const cb = cen(B);
  const ra = rms(A, ca);
  const rb = rms(B, cb);
  if (ra < 1e-6 || rb < 1e-6) return 0;

  const scale = Math.min(2, Math.max(0.5, rb / ra));
  let sum = 0;
  for (let i = 0; i < A.length; i += 1) {
    const px = cb[0] + (A[i][0] - ca[0]) * scale;
    const py = cb[1] + (A[i][1] - ca[1]) * scale;
    sum += Math.hypot(px - B[i][0], py - B[i][1]);
  }
  const d = sum / A.length;
  return 1 / (1 + (d / 0.055) ** 1.4);
}

const chord = (pts) => {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return len < 1e-6 ? [0, 0, 0] : [(b[0] - a[0]) / len, (b[1] - a[1]) / len, len];
};

/** A dot target: a single point, or a stroke so short it is a tap. */
export function isDotStroke(stroke) {
  if (!Array.isArray(stroke) || !stroke.length) return false;
  return stroke.length === 1 || pathLength(stroke) < 0.02;
}

/** Score a tap against a dot: near the point, and small enough to be a dot. */
function compareDotStroke(user, ref, tolerance = 1) {
  const [dx, dy] = ref[0];
  const n = user.length || 1;
  let cx = 0;
  let cy = 0;
  for (const p of user) {
    cx += p[0];
    cy += p[1];
  }
  cx /= n;
  cy /= n;
  let spread = 0;
  for (const p of user) spread = Math.max(spread, Math.hypot(p[0] - cx, p[1] - cy));
  const d = Math.hypot(cx - dx, cy - dy);
  const abs = 1 / (1 + (d / (0.06 * tolerance)) ** 1.5);
  const compact = spread <= 0.07 ? 1 : Math.max(0.2, 1 - (spread - 0.07) / 0.16);
  const score = clamp01(abs * (0.7 + 0.3 * compact));
  return {
    score,
    abs,
    shape: compact,
    start: abs,
    end: abs,
    dir: 1,
    reversed: false,
    lenRatio: 1,
    dMean: d,
    dot: true,
  };
}

/**
 * Compare one user stroke with one reference stroke.
 * All coordinates are normalised to the practice square (0..1).
 */
export function compareStroke(user, ref, tolerance = 1) {
  if (isDotStroke(ref)) return compareDotStroke(user, ref, tolerance);

  const B = resample(ref, 32);
  const A = resample(user, 32);
  if (!A.length || !B.length) {
    return { score: 0, abs: 0, shape: 0, start: 0, dir: 0, end: 0, reversed: false, lenRatio: 0, dMean: 9 };
  }

  const refLen = pathLength(ref);
  const userLen = pathLength(user);
  const dMean = meanDistance(A, B);

  const abs = 1 / (1 + (dMean / (0.075 * tolerance)) ** 1.35);
  const shape = shapeSimilarity(A, B);
  const start = 1 / (1 + (dist(A[0], B[0]) / (0.085 * tolerance)) ** 1.6);
  const end = 1 / (1 + (dist(A[31], B[31]) / (0.1 * tolerance)) ** 1.6);

  const [ux, uy, uLen] = chord(A);
  const [rx, ry, rLen] = chord(B);
  let dir = 0.5;
  if (uLen > 0.02 && rLen > 0.02) {
    const cos = ux * rx + uy * ry;
    dir = clamp01((cos + 0.15) / 1.15);
  }

  const reversed =
    refLen > 0.06 && dist(A[0], B[31]) + 0.008 < dist(A[0], B[0]) && dist(A[31], B[0]) < 0.15;

  const dot = refLen < 0.055;
  const weights = dot
    ? { abs: 0.5, shape: 0.16, start: 0.28, dir: 0.06 }
    : { abs: 0.44, shape: 0.22, start: 0.18, dir: 0.16 };

  const wSum = weights.abs + weights.shape + weights.start + weights.dir;
  let score =
    (weights.abs * abs + weights.shape * shape + weights.start * start + weights.dir * dir) / wSum;

  let lenRatio = 1;
  if (refLen > 0.05) {
    lenRatio = userLen / refLen;
    score *= Math.min(1, Math.max(0.6, 1 - Math.abs(Math.log(lenRatio)) * 0.35));
  }
  if (reversed) score *= 0.45;

  return {
    score: clamp01(score),
    abs,
    shape,
    start,
    end,
    dir,
    reversed,
    lenRatio,
    dMean,
  };
}

/** Human-readable problem keys for a stroke comparison, most important first. */
export function strokeIssues(cmp) {
  const issues = [];
  if (cmp.dot) {
    if (cmp.abs < 0.5) issues.push('position');
    return issues;
  }
  if (cmp.reversed) issues.push('reversed');
  if (cmp.start < 0.42) issues.push('start');
  if (cmp.dir < 0.45) issues.push('direction');
  if (cmp.shape < 0.5) issues.push('shape');
  else if (cmp.abs < 0.48) issues.push('position');
  if (cmp.lenRatio < 0.55) issues.push('tooShort');
  else if (cmp.lenRatio > 1.8) issues.push('tooLong');
  return issues;
}

export function starsFor(pct) {
  if (pct >= 90) return 5;
  if (pct >= 76) return 4;
  if (pct >= 60) return 3;
  if (pct >= 40) return 2;
  return 1;
}

/**
 * Score a whole character/letter.
 * refStrokes / userStrokes are arrays of point arrays.
 */
export function scoreUnit(refStrokes, userStrokes, tolerance = 1) {
  const n = refStrokes.length;
  const m = userStrokes.length;
  if (!n) return { score: 0, pct: 0, stars: 1, strokes: [], missing: [], extra: [] };
  if (!m) {
    return {
      score: 0,
      pct: 0,
      stars: 1,
      strokes: [],
      missing: refStrokes.map((_, i) => i),
      extra: [],
    };
  }

  const weights = refStrokes.map((s) => 0.45 + Math.min(1.1, pathLength(s) * 1.4));
  const totalW = weights.reduce((a, b) => a + b, 0);

  const pair = refStrokes.map((ref) => userStrokes.map((user) => compareStroke(user, ref, tolerance)));

  const NEG = -1e9;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(NEG));
  const back = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
  dp[0][0] = 0;

  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= m; j += 1) {
      if (i === 0 && j === 0) continue;
      let best = NEG;
      let arg = 0;
      if (i > 0 && dp[i - 1][j] > best) {
        best = dp[i - 1][j];
        arg = 2;
      }
      if (j > 0 && dp[i][j - 1] - 0.1 > best) {
        best = dp[i][j - 1] - 0.1;
        arg = 3;
      }
      if (i > 0 && j > 0) {
        const v = dp[i - 1][j - 1] + pair[i - 1][j - 1].score * weights[i - 1];
        if (v > best) {
          best = v;
          arg = 1;
        }
      }
      dp[i][j] = best;
      back[i][j] = arg;
    }
  }

  const matched = [];
  const missing = [];
  const used = new Set();
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const step = back[i][j];
    if (step === 1) {
      matched.push({ refIndex: i - 1, userIndex: j - 1, ...pair[i - 1][j - 1] });
      used.add(j - 1);
      i -= 1;
      j -= 1;
    } else if (step === 2) {
      missing.push(i - 1);
      i -= 1;
    } else if (step === 3) {
      j -= 1;
    } else {
      break;
    }
  }
  matched.sort((a, b) => a.refIndex - b.refIndex);
  missing.sort((a, b) => a - b);

  const extra = [];
  for (let k = 0; k < m; k += 1) if (!used.has(k)) extra.push(k);

  const score = clamp01(dp[n][m] / totalW);
  const pct = Math.round(score * 100);

  return {
    score,
    pct,
    stars: starsFor(pct),
    strokes: matched,
    missing,
    extra,
  };
}

/** Small helper for the practice screen: overall tips for a unit result. */
export function unitTips(result, max = 2) {
  const tips = [];
  for (const s of result.strokes) {
    for (const issue of strokeIssues(s)) {
      tips.push({ stroke: s.refIndex + 1, issue });
      if (tips.length >= max) return tips;
    }
  }
  if (result.missing.length) tips.push({ stroke: result.missing[0] + 1, issue: 'missing' });
  if (result.extra.length && tips.length < max) tips.push({ stroke: 0, issue: 'extra' });
  return tips.slice(0, max);
}
