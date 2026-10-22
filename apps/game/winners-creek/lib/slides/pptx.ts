import type { SlideContent } from "@/lib/domain/types";
import { strFromU8, unzipSync } from "fflate";

export interface CanonicalTable {
  headers: string[];
  rows: string[][];
}

export interface CanonicalSlideContent extends SlideContent {
  title: string;
  textBlocks: string[];
  bullets: string[];
  tables: CanonicalTable[];
}

export interface PresentationContent {
  title: string;
  slides: CanonicalSlideContent[];
  totalSlideCount: number;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Collects text runs `<a:t>` inside an XML block */
function extractRuns(xml: string): string {
  const out: string[] = [];
  const re = /<a:t(?:[^>]*)>([\s\S]*?)<\/a:t>/g;
  let m: RegExpExecArray | null = re.exec(xml);
  while (m !== null) {
    out.push(decodeXmlEntities(m[1] ?? ""));
    m = re.exec(xml);
  }
  return out.join("").replace(/\s+/g, " ").trim();
}

function slideNumber(key: string): number {
  return Number(key.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
}

function resolvePath(baseDir: string, target: string): string {
  const stack: string[] = [];
  for (const part of `${baseDir}/${target}`.split("/")) {
    if (part === "..") stack.pop();
    else if (part !== "." && part !== "") stack.push(part);
  }
  return stack.join("/");
}

function readNotes(files: Record<string, Uint8Array>, slideKey: string): string | null {
  const n = slideNumber(slideKey);
  const rels = files[`ppt/slides/_rels/slide${n}.xml.rels`];
  if (!rels) return null;
  const target = strFromU8(rels).match(/Target="([^"]*notesSlide[^"]*)"/)?.[1];
  if (!target) return null;
  const notesData = files[resolvePath("ppt/slides", target)];
  if (!notesData) return null;
  const text = extractRuns(strFromU8(notesData));
  return text.length > 0 ? text : null;
}

/**
 * Extracts tables from slide XML (<a:tbl>)
 */
function extractTables(slideXml: string): CanonicalTable[] {
  const tables: CanonicalTable[] = [];
  const tblRegex = /<a:tbl(?:[\s\S]*?)<\/a:tbl>/g;
  let tblMatch: RegExpExecArray | null = tblRegex.exec(slideXml);

  while (tblMatch !== null) {
    const tblXml = tblMatch[0];
    const trRegex = /<a:tr(?:[\s\S]*?)<\/a:tr>/g;
    const rows: string[][] = [];
    let trMatch: RegExpExecArray | null = trRegex.exec(tblXml);

    while (trMatch !== null) {
      const trXml = trMatch[0];
      const tcRegex = /<a:tc(?:[\s\S]*?)<\/a:tc>/g;
      const cellValues: string[] = [];
      let tcMatch: RegExpExecArray | null = tcRegex.exec(trXml);

      while (tcMatch !== null) {
        const cellText = extractRuns(tcMatch[0]);
        cellValues.push(cellText);
        tcMatch = tcRegex.exec(trXml);
      }

      if (cellValues.some((c) => c.length > 0)) {
        rows.push(cellValues);
      }
      trMatch = trRegex.exec(tblXml);
    }

    if (rows.length > 0) {
      const headers = rows[0];
      const dataRows = rows.slice(1);
      tables.push({ headers, rows: dataRows });
    }

    tblMatch = tblRegex.exec(slideXml);
  }

  return tables;
}

/**
 * Parses slide XML extracting shapes, titles, paragraphs, bullets, and tables.
 */
function parseSlideXml(slideXml: string, index: number, notes: string | null): CanonicalSlideContent {
  let title = "";
  const textBlocks: string[] = [];
  const bullets: string[] = [];
  const tables = extractTables(slideXml);

  // Split slide by shape (<p:sp>...</p:sp>)
  const spRegex = /<p:sp(?:[\s\S]*?)<\/p:sp>/g;
  let spMatch: RegExpExecArray | null = spRegex.exec(slideXml);

  while (spMatch !== null) {
    const spXml = spMatch[0];
    const isTitleShape = /<p:ph[^>]*type="(?:title|ctrTitle)"/i.test(spXml);

    // Extract paragraphs inside shape
    const pRegex = /<a:p(?:[\s\S]*?)<\/a:p>/g;
    let pMatch: RegExpExecArray | null = pRegex.exec(spXml);

    while (pMatch !== null) {
      const pXml = pMatch[0];
      const pText = extractRuns(pXml);

      if (pText.length > 0) {
        if (isTitleShape && !title) {
          title = pText;
        }

        // Bullet detection: indent level > 0, bullet character, or bullet marker
        const hasBulletTag = /<a:pPr[^>]*(?:lvl="[1-9]"|<a:buChar|<a:buAutoNum)/.test(pXml);
        const startsWithBulletChar = /^[-•*–—]\s+/.test(pText) || /^\d+\.\s+/.test(pText);

        if (hasBulletTag || startsWithBulletChar) {
          bullets.push(pText.replace(/^[-•*–—]\s*/, ""));
        }

        textBlocks.push(pText);
      }

      pMatch = pRegex.exec(spXml);
    }

    spMatch = spRegex.exec(slideXml);
  }

  // Fallback title to first non-empty text block
  if (!title && textBlocks.length > 0) {
    title = textBlocks[0];
  }
  if (!title) {
    title = `Slide ${index + 1}`;
  }

  const textContent = textBlocks.join("\n");

  return {
    index,
    title,
    textContent,
    textBlocks,
    bullets,
    tables,
    notes,
  };
}

export function parsePptx(bytes: Uint8Array): CanonicalSlideContent[] {
  const files = unzipSync(bytes);
  const slideKeys = Object.keys(files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  return slideKeys.map((key, index) => {
    const data = files[key];
    const notes = readNotes(files, key);
    if (!data) {
      return {
        index,
        title: `Slide ${index + 1}`,
        textContent: "",
        textBlocks: [],
        bullets: [],
        tables: [],
        notes,
      };
    }

    const slideXml = strFromU8(data);
    return parseSlideXml(slideXml, index, notes);
  });
}
