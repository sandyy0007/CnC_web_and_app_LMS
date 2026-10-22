import type { SlideContent } from "@/lib/domain/types";
import { extractText, getDocumentProxy } from "unpdf";

/** Per-page text extraction from a PDF (pure-JS pdf.js, no native deps). */
export async function parsePdf(bytes: Uint8Array): Promise<SlideContent[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((t, index) => ({
    index,
    textContent: t.replace(/\s+/g, " ").trim(),
    notes: null,
  }));
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await getDocumentProxy(bytes);
  return pdf.numPages;
}
