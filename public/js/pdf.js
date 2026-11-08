// Minimal PDF writer: one full-page JPEG per page (A4). No dependencies.

const encoder = new TextEncoder();

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function dataUrlToBytes(dataUrl) {
  return base64ToBytes(String(dataUrl).split(',')[1] || '');
}

/**
 * Build a PDF from JPEG pages.
 * `pages` = [{ bytes: Uint8Array, width, height }]
 */
export function buildPdf(pages, { widthPt = 595.28, heightPt = 841.89 } = {}) {
  const chunks = [];
  const offsets = [];
  let length = 0;

  const push = (data) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };

  // Object numbers: 1 = catalog, 2 = pages, then 3 objects per page.
  const pageObj = (i) => 3 + i * 3;

  push('%PDF-1.4\n');

  const startObj = (num) => {
    offsets[num] = length;
    push(`${num} 0 obj\n`);
  };
  const endObj = () => push('endobj\n');

  startObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\n');
  endObj();

  startObj(2);
  push(
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>\n`,
  );
  endObj();

  pages.forEach((page, i) => {
    const num = pageObj(i);
    const contentNum = num + 1;
    const imageNum = num + 2;

    startObj(num);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] ` +
        `/Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>\n`,
    );
    endObj();

    const content = `q ${widthPt} 0 0 ${heightPt} 0 0 cm /Im0 Do Q\n`;
    startObj(contentNum);
    push(`<< /Length ${content.length} >>\nstream\n`);
    push(content);
    push('endstream\n');
    endObj();

    startObj(imageNum);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
    );
    push(page.bytes);
    push('\nendstream\n');
    endObj();
  });

  const xrefAt = length;
  const count = 2 + pages.length * 3 + 1;
  push(`xref\n0 ${count}\n`);
  push('0000000000 65535 f \n');
  for (let n = 1; n < count; n += 1) {
    const at = offsets[n] || 0;
    push(`${String(at).padStart(10, '0')} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`,
  );

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
