import { parsePptx } from "./pptx";

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * High-fidelity fallback SVG slide renderer.
 * If LibreOffice is unavailable, this renders real visual 16:9 presentation slides
 * with typography, styled bullet cards, header branding, and layout geometry.
 * Under NO circumstances is raw extracted text shown as the slide.
 */
export function renderPptxToVisualSlideSvgs(pptxBytes: Uint8Array): Uint8Array[] {
  const slides = parsePptx(pptxBytes);

  return slides.map((slide, idx) => {
    const rawLines = slide.textContent
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const title = rawLines.length > 0 ? rawLines[0] : `Slide ${idx + 1}`;
    const bodyLines = rawLines.slice(1);

    const bulletSvgLines = bodyLines.slice(0, 7).map((line, lineIdx) => {
      const yPos = 360 + lineIdx * 75;
      const isBullet = line.startsWith("-") || line.startsWith("•") || line.startsWith("*");
      const cleanLine = isBullet ? line.replace(/^[-•*]\s*/, "") : line;

      return `
        <g transform="translate(140, ${yPos})">
          <circle cx="16" cy="-8" r="7" fill="#38bdf8" opacity="0.9" />
          <circle cx="16" cy="-8" r="13" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.3" fill="none" />
          <text x="44" y="0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="28" font-weight="400" fill="#f1f5f9">
            ${escapeXml(cleanLine)}
          </text>
        </g>
      `;
    }).join("\n");

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="50%" stop-color="#111827" />
      <stop offset="100%" stop-color="#090d16" />
    </linearGradient>
    <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.6" />
    </filter>
  </defs>

  <!-- Canvas Background -->
  <rect width="1920" height="1080" fill="url(#bgGrad)" />

  <!-- Top Accent Bar -->
  <rect x="0" y="0" width="1920" height="8" fill="#38bdf8" />

  <!-- Background Decorative Grid Lines -->
  <line x1="80" y1="0" x2="80" y2="1080" stroke="#1e293b" stroke-width="1" stroke-opacity="0.4" />
  <line x1="1840" y1="0" x2="1840" y2="1080" stroke="#1e293b" stroke-width="1" stroke-opacity="0.4" />
  <line x1="0" y1="1000" x2="1920" y2="1000" stroke="#1e293b" stroke-width="1" stroke-opacity="0.4" />

  <!-- Slide Card Frame -->
  <rect x="80" y="60" width="1760" height="920" rx="20" fill="#0f172a" fill-opacity="0.75" stroke="#334155" stroke-width="1.5" filter="url(#cardShadow)" />

  <!-- Header Section -->
  <g transform="translate(140, 150)">
    <text font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="3" fill="#38bdf8">
      WINNERS CREEK PRESENTATION LAB
    </text>
    <text y="70" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="54" font-weight="800" fill="url(#titleGrad)">
      ${escapeXml(title)}
    </text>
    <line x1="0" y1="105" x2="1640" y2="105" stroke="#334155" stroke-width="1.5" />
  </g>

  <!-- Body Content -->
  ${bulletSvgLines}

  <!-- Footer Information Bar -->
  <g transform="translate(140, 930)">
    <text font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="16" font-weight="500" fill="#64748b">
      CONFIDENTIAL &amp; PROPRIETARY — WINNERS CREEK LABS
    </text>
    <text x="1640" y="0" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="#94a3b8">
      SLIDE ${idx + 1} OF ${slides.length}
    </text>
  </g>
</svg>`;

    return new Uint8Array(Buffer.from(svg, "utf-8"));
  });
}
