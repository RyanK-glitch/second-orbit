import sharp from "sharp";

/**
 * Synthetic "product photo": an object with hard edges, fine scratches and
 * text, so focus and exposure checks behave like they do on a real photo.
 */
export async function productPhoto(w = 1600, h = 1200, hue = 210): Promise<Buffer> {
  const lines = Array.from({ length: 40 }, (_, i) => `<line x1="${w * 0.25 + i * w * 0.012}" y1="${h * 0.3}" x2="${w * 0.3 + i * w * 0.012}" y2="${h * 0.7}" stroke="#ccc" stroke-width="2"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="hsl(${hue},12%,58%)"/>
    <rect x="${w * 0.2}" y="${h * 0.2}" width="${w * 0.6}" height="${h * 0.6}" rx="40" fill="#2b2f3a" stroke="#eee" stroke-width="6"/>
    ${lines}
    <text x="${w * 0.3}" y="${h * 0.5}" font-size="${h * 0.06}" fill="#fff" font-family="sans-serif">SERIAL 12345 ABCDEF</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}
