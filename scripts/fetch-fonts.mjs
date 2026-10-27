// One-off: download the self-hosted Latin webfonts (Nunito for UI, Patrick Hand
// for handwriting models) plus their OFL licences.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'fonts');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const families = [
  {
    name: 'Nunito',
    query: 'family=Nunito:wght@400;600;700;800',
    weights: ['400', '600', '700', '800'],
    slug: 'nunito',
    variable: true,
  },
  {
    name: 'Patrick Hand',
    query: 'family=Patrick+Hand',
    weights: ['400'],
    slug: 'patrick',
    variable: false,
  },
];

await fs.mkdir(OUT, { recursive: true });

for (const family of families) {
  const url = `https://fonts.googleapis.com/css2?${family.query}&display=swap`;
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  const blocks = css.split('/*').map((part) => `/*${part}`);
  for (const block of blocks) {
    const subset = block.startsWith('/* latin */')
      ? 'latin'
      : block.startsWith('/* latin-ext */')
        ? 'latin-ext'
        : null;
    if (!subset) continue;
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
    const src = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (!weight || !src || !family.weights.includes(weight)) continue;
    if (family.variable && weight !== '400') continue;
    const file = path.join(
      OUT,
      family.variable
        ? `${family.slug}-${subset}.woff2`
        : `${family.slug}-${weight}-${subset}.woff2`,
    );
    const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
    await fs.writeFile(file, buf);
    console.log(path.basename(file), `${(buf.length / 1024).toFixed(1)} KB`);
  }
}

const licences = [
  ['OFL-Nunito.txt', 'https://raw.githubusercontent.com/googlefonts/nunito/main/OFL.txt'],
  ['OFL-PatrickHand.txt', 'https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/OFL.txt'],
];
for (const [name, url] of licences) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    await fs.writeFile(path.join(OUT, name), await res.text());
    console.log(name);
  } catch (err) {
    console.warn(`could not fetch ${name}: ${err.message}`);
  }
}
