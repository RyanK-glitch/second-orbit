/**
 * Holographic line-art "product shots" used for seed data, so the demo looks
 * populated without shipping stock photography. Rendered to WebP by sharp.
 */
export const SHAPES: Record<string, string> = {
  phone: '<rect x="68" y="30" width="64" height="140" rx="12"/><rect x="76" y="44" width="48" height="104" rx="4" class="f"/><path d="M92 37h16"/><circle cx="100" cy="159" r="4"/>',
  headphones: '<path d="M50 125V105a50 50 0 0 1 100 0v20"/><rect x="38" y="112" width="26" height="46" rx="10" class="f"/><rect x="136" y="112" width="26" height="46" rx="10" class="f"/>',
  camera: '<rect x="35" y="65" width="130" height="85" rx="10"/><rect x="50" y="52" width="32" height="13" rx="3"/><circle cx="105" cy="108" r="30" class="f"/><circle cx="105" cy="108" r="18"/><circle cx="148" cy="80" r="5"/>',
  laptop: '<rect x="45" y="50" width="110" height="74" rx="5"/><rect x="53" y="58" width="94" height="58" rx="2" class="f"/><path d="M28 132h144l-10 14H38z"/>',
  gamepad: '<rect x="70" y="62" width="60" height="78" rx="4" class="f"/><path d="M70 62H56a14 14 0 0 0-14 14v50a14 14 0 0 0 14 14h14z"/><path d="M130 62h14a14 14 0 0 1 14 14v50a14 14 0 0 1-14 14h-14z"/><circle cx="56" cy="84" r="5"/><circle cx="144" cy="116" r="5"/>',
  watch: '<rect x="78" y="30" width="44" height="40" rx="6"/><rect x="78" y="130" width="44" height="40" rx="6"/><circle cx="100" cy="100" r="36" class="f"/><path d="M100 100V78M100 100l14 8"/><rect x="138" y="94" width="6" height="12" rx="2"/>',
  jacket: '<path d="M80 40l-20 8-24 22-6 80 20 2 6-57 2 70h84l2-70 6 57 20-2-6-80-24-22-20-8-20 30z" class="f"/><path d="M100 70v95M80 40l20 30 20-30"/>',
  sneaker: '<path d="M30 140v-30q4-20 26-18l24-22q12-6 20 4l18 22q32 6 50 22 8 10 4 22z" class="f"/><path d="M28 140h146v10H30z"/><path d="M84 84l10 10M76 92l10 10M92 76l10 10"/>',
  boot: '<path d="M60 30h50v80q40 2 55 18 7 12 3 20H55z" class="f"/><path d="M53 148h117v12H53z"/><path d="M110 50H96M110 66H96M110 82H96"/>',
  bag: '<path d="M70 75q0-40 30-40t30 40"/><rect x="40" y="75" width="120" height="90" rx="14" class="f"/><path d="M40 105h120"/><rect x="92" y="100" width="16" height="12" rx="2"/>',
  chair: '<path d="M62 40q-14 60 18 100h70"/><path d="M62 40q30-10 34 40 4 40 34 40l20 5" class="f"/><path d="M48 160q42-10 122 0M80 140l-20 20M150 140l15 20"/>',
  sideboard: '<rect x="25" y="65" width="150" height="65" rx="4" class="f"/><path d="M75 65v65M125 65v65M80 87h40M80 108h40M40 130l-6 30M160 130l6 30"/>',
  officechair: '<path d="M70 30h60a8 8 0 0 1 8 8l-6 62H68l-6-62a8 8 0 0 1 8-8z" class="f"/><rect x="58" y="104" width="84" height="16" rx="8"/><path d="M50 95v20h12M150 95v20h-12M100 120v30l-34 16M100 150l34 16M100 150v20"/><circle cx="66" cy="170" r="4"/><circle cx="134" cy="170" r="4"/><circle cx="100" cy="174" r="4"/>',
  lamp: '<path d="M60 170V60q0-30 40-30t50 40"/><path d="M130 70h40l-8 22h-24z" class="f"/><ellipse cx="60" cy="172" rx="30" ry="8" class="f"/>',
  table: '<rect x="25" y="70" width="150" height="14" rx="3" class="f"/><path d="M40 84v76M160 84v76M55 84v66M145 84v66M40 120h120"/>',
  book: '<path d="M55 35h80a6 6 0 0 1 6 6v120a6 6 0 0 1-6 6H55z" class="f"/><path d="M55 35v132M65 35v132M80 70h45M80 84h35M141 160h10V45h-10"/>',
  books: '<rect x="40" y="40" width="22" height="125" rx="3" class="f"/><rect x="66" y="55" width="18" height="110" rx="3"/><rect x="88" y="45" width="24" height="120" rx="3" class="f"/><rect x="116" y="60" width="18" height="105" rx="3"/><path d="M138 72l20-6 24 94-20 6zM30 166h150"/>',
  coffee: '<rect x="45" y="30" width="110" height="34" rx="6" class="f"/><path d="M45 64v96h110V64M80 64v20h40V64"/><path d="M84 92h32l-4 34H88z" class="f"/><path d="M116 100h8a6 6 0 0 1 0 14h-10M60 150h80"/><circle cx="140" cy="47" r="7"/>',
  pot: '<path d="M45 85h110v55q0 20-20 20H65q-20 0-20-20z" class="f"/><path d="M40 85h120M50 78q50-23 100 0"/><rect x="92" y="58" width="16" height="10" rx="4"/><path d="M45 100H31v14h14M155 100h14v14h-14"/>',
  bike: '<circle cx="52" cy="130" r="32"/><circle cx="148" cy="130" r="32"/><path d="M52 130l30-50h52l14 50M82 80l22 50 30-50M52 130h52M76 70h16M128 66l8 14h12"/><circle cx="104" cy="130" r="6" class="f"/>',
  guitar: '<path d="M96 22h8v76h-8z"/><rect x="92" y="10" width="16" height="16" rx="3"/><path d="M100 95q-30-10-38 13-6 17 8 27-15 25 10 37 20 8 40 0 25-12 10-37 14-10 8-27-8-23-38-13z" class="f"/><rect x="86" y="140" width="28" height="6" rx="2"/><path d="M90 115h20M90 125h20"/>',
};

export type ArtVariant = "front" | "angle" | "wear";

/** 1200×1200 SVG with grid backdrop, glow floor and gradient-stroked line art. */
export function productSvg(shape: string, hue: number, variant: ArtVariant): string {
  const body = (SHAPES[shape] ?? SHAPES.book).replace(/class="f"/g, 'fill="url(#fl)"');
  const t =
    variant === "angle"
      ? "translate(600 615) rotate(-9) scale(4.05) translate(-100 -100)"
      : variant === "wear"
        ? "translate(600 600) scale(8.1) translate(-118 -112)"
        : "translate(150 150) scale(4.5)";
  const overlay =
    variant === "wear"
      ? '<circle cx="600" cy="600" r="186" fill="none" stroke="#ffd65e" stroke-width="7" stroke-dasharray="21 21"/>' +
        Array.from({ length: 9 }, (_, i) => `<path d="M${520 + i * 18} ${560 + (i % 3) * 14}l${26 + (i % 4) * 6} ${-10 - (i % 2) * 8}" stroke="#e8ecf4" stroke-opacity=".55" stroke-width="2.5"/>`).join("")
      : "";
  // Fine noise texture keeps the render from looking "too smooth" to the blur detector, like a real photo.
  const noise = Array.from({ length: 160 }, (_, i) => {
    const x = (i * 197) % 1200;
    const y = (i * 331) % 1200;
    return `<rect x="${x}" y="${y}" width="3" height="3" fill="#fff" fill-opacity="${0.04 + (i % 5) * 0.015}"/>`;
  }).join("");
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="1200" height="1200">' +
    "<defs>" +
    `<radialGradient id="bg" cx="${variant === "angle" ? 35 : 50}%" cy="40%" r="75%"><stop offset="0" stop-color="hsl(${hue},55%,24%)"/><stop offset="1" stop-color="#0a0d16"/></radialGradient>` +
    '<linearGradient id="st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ef2ff"/><stop offset=".5" stop-color="#9b8cff"/><stop offset="1" stop-color="#ff6ad5"/></linearGradient>' +
    `<linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},90%,70%)" stop-opacity=".25"/><stop offset="1" stop-color="hsl(${hue},90%,60%)" stop-opacity=".06"/></linearGradient>` +
    '<pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse"><path d="M72 0H0v72" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width="2"/></pattern>' +
    "</defs>" +
    '<rect width="1200" height="1200" fill="url(#bg)"/><rect width="1200" height="1200" fill="url(#grid)"/>' +
    noise +
    `<ellipse cx="600" cy="1005" rx="390" ry="48" fill="hsl(${hue},90%,65%)" fill-opacity=".12"/>` +
    `<g transform="${t}" fill="none" stroke="url(#st)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</g>` +
    overlay +
    "</svg>"
  );
}
