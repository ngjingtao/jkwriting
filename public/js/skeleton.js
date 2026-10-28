// Turns a rendered font glyph into a centreline, plus a distance field so the
// guide can be pulled to the true middle of thick strokes.

const CACHE = new Map();

function thin(image, width, height) {
  const at = (x, y) => y * width + x;
  let changed = true;
  let guard = 0;
  while (changed && guard < 120) {
    guard += 1;
    changed = false;
    for (let step = 0; step < 2; step += 1) {
      const remove = [];
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          if (!image[at(x, y)]) continue;
          const p2 = image[at(x, y - 1)];
          const p3 = image[at(x + 1, y - 1)];
          const p4 = image[at(x + 1, y)];
          const p5 = image[at(x + 1, y + 1)];
          const p6 = image[at(x, y + 1)];
          const p7 = image[at(x - 1, y + 1)];
          const p8 = image[at(x - 1, y)];
          const p9 = image[at(x - 1, y - 1)];
          const neighbours = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (neighbours < 2 || neighbours > 6) continue;
          const transitions =
            (!p2 && p3 ? 1 : 0) +
            (!p3 && p4 ? 1 : 0) +
            (!p4 && p5 ? 1 : 0) +
            (!p5 && p6 ? 1 : 0) +
            (!p6 && p7 ? 1 : 0) +
            (!p7 && p8 ? 1 : 0) +
            (!p8 && p9 ? 1 : 0) +
            (!p9 && p2 ? 1 : 0);
          if (transitions !== 1) continue;
          if (step === 0) {
            if (p2 && p4 && p6) continue;
            if (p4 && p6 && p8) continue;
          } else {
            if (p2 && p4 && p8) continue;
            if (p2 && p6 && p8) continue;
          }
          remove.push(at(x, y));
        }
      }
      if (remove.length) {
        changed = true;
        for (const index of remove) image[index] = 0;
      }
    }
  }
}

function distanceTransform(mask, width, height) {
  const INF = 1e9;
  const distance = new Float32Array(width * height);
  for (let i = 0; i < distance.length; i += 1) distance[i] = mask[i] ? INF : 0;
  const straight = 1;
  const diagonal = 1.4142;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!mask[i]) continue;
      let value = distance[i];
      if (x > 0) value = Math.min(value, distance[i - 1] + straight);
      if (y > 0) value = Math.min(value, distance[i - width] + straight);
      if (x > 0 && y > 0) value = Math.min(value, distance[i - width - 1] + diagonal);
      if (x < width - 1 && y > 0) value = Math.min(value, distance[i - width + 1] + diagonal);
      distance[i] = value;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      if (!mask[i]) continue;
      let value = distance[i];
      if (x < width - 1) value = Math.min(value, distance[i + 1] + straight);
      if (y < height - 1) value = Math.min(value, distance[i + width] + straight);
      if (x < width - 1 && y < height - 1) value = Math.min(value, distance[i + width + 1] + diagonal);
      if (x > 0 && y < height - 1) value = Math.min(value, distance[i + width - 1] + diagonal);
      distance[i] = value;
    }
  }
  return distance;
}

/**
 * Glyph centreline + distance field, normalised to the 0..1 practice box.
 * Uses the same size ratio, family and baseline as the ghost renderer.
 */
export function glyphField(ch, { size = 320, family, sizeRatio = 0.86, baseline = 0.765 } = {}) {
  const key = `${ch}|${family}|${sizeRatio}|${baseline}|${size}`;
  if (CACHE.has(key)) return CACHE.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.font = `400 ${size * sizeRatio}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ch, size / 2, size * baseline);

  const { data } = ctx.getImageData(0, 0, size, size);
  const mask = new Uint8Array(size * size);
  for (let i = 0; i < mask.length; i += 1) mask[i] = data[i * 4 + 3] > 110 ? 1 : 0;

  const distance = distanceTransform(mask, size, size);
  const thinned = new Uint8Array(mask);
  thin(thinned, size, size);

  const points = [];
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      if (thinned[y * size + x]) points.push([x / size, y / size]);
    }
  }

  const field = { points, dist: distance, size };
  CACHE.set(key, field);
  return field;
}

export function glyphSkeleton(ch, options) {
  return glyphField(ch, options).points;
}

export function clearSkeletonCache() {
  CACHE.clear();
}
