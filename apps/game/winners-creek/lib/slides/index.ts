import type { SlideContent } from "@/lib/domain/types";
import { Errors } from "@/lib/errors";
import { parsePdf } from "./pdf";
import { parsePptx } from "./pptx";
import { convertPptxToPdf } from "./convert";
import { renderPdfPagesToPng } from "./render";
import { renderPptxToVisualSlideSvgs } from "./visual-renderer";

export { parsePdf } from "./pdf";
export { parsePptx } from "./pptx";
export { convertPptxToPdf, LibreOfficeUnavailableError } from "./convert";
export { renderPdfPagesToPng } from "./render";

export function parseSlideText(filename: string, bytes: Uint8Array): Promise<SlideContent[]> | SlideContent[] {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return parsePdf(bytes);
    case "pptx":
      return parsePptx(bytes);
    default:
      throw Errors.unprocessable(`Unsupported format: ${ext ?? "(none)"}`, "UNSUPPORTED_FORMAT");
  }
}

export interface ParsedPresentation {
  slides: SlideContent[];
  slideImages: Uint8Array[]; // Guaranteed real images (PNG from LibreOffice/pdftoppm, or SVG fallback if LibreOffice genuinely fails)
  isSvg?: boolean;
  renderWarning: string | null;
}

/**
 * Full presentation parsing and visual rendering pipeline:
 * - PDFs render directly via pdftoppm to high-resolution PNGs.
 * - PPTX primary pipeline: LibreOffice headless (soffice.com) -> PDF -> pdftoppm -> PNG.
 * - PPTX fallback pipeline: If LibreOffice fails, generates visual SVG layouts preserving
 *   structure, tables, bullets, and design.
 * Under NO circumstances does the visual canvas ever display plain unstyled extracted text.
 */
export async function parsePresentation(filename: string, bytes: Uint8Array): Promise<ParsedPresentation> {
  const ext = filename.toLowerCase().split(".").pop();
  const slides = await parseSlideText(filename, bytes);

  let slideImages: Uint8Array[] | null = null;
  let isSvg = false;
  let renderWarning: string | null = null;

  if (ext === "pdf") {
    try {
      console.log(`[parsePresentation] Rendering PDF pages to PNG for ${filename}...`);
      slideImages = await renderPdfPagesToPng(bytes);
    } catch (err) {
      console.error("[parsePresentation] PDF rasterization error:", err);
      renderWarning = "PDF page rendering failed.";
    }
  } else if (ext === "pptx") {
    // 1. Primary Pipeline: LibreOffice headless -> PDF -> pdftoppm -> PNG
    try {
      console.log(`[parsePresentation] Converting PPTX to PDF via LibreOffice headless for ${filename}...`);
      const pdfBytes = await convertPptxToPdf(bytes, { filename });
      console.log(`[parsePresentation] Rasterizing converted PDF to PNGs...`);
      slideImages = await renderPdfPagesToPng(pdfBytes);
      console.log(`[parsePresentation] Primary pipeline succeeded: ${slideImages.length} PNG slides rendered.`);
    } catch (e) {
      console.warn("[parsePresentation] Primary LibreOffice pipeline failed, using visual slide renderer fallback:", e);
      // 2. Fallback Pipeline: visual SVG slide renderer
      try {
        slideImages = renderPptxToVisualSlideSvgs(bytes);
        isSvg = true;
        renderWarning = "Rendered using visual slide layout fallback.";
        console.log(`[parsePresentation] Fallback SVG pipeline succeeded: ${slideImages.length} SVG slides rendered.`);
      } catch (fallbackErr) {
        console.error("[parsePresentation] Visual fallback rendering failed:", fallbackErr);
      }
    }
  }

  return {
    slides,
    slideImages: slideImages ?? [],
    isSvg,
    renderWarning,
  };
}
