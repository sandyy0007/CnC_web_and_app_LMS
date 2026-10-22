/**
 * Marks likely filler words in the raw answer so the feedback can show what
 * the clean version dropped. Display only: the server decides what is correct.
 * A plain word list, not language analysis, so a legitimate "like" or "just"
 * can be highlighted too. That is acceptable for a teaching hint.
 */
export interface Segment {
  text: string;
  filler: boolean;
}

const FILLER_PATTERN =
  /\b(?:um+|uh+|erm+|er|you know|i mean|sort of|kind of|basically|actually|literally|like|just)\b/gi;

export function splitFillers(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(FILLER_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ text: text.slice(last, start), filler: false });
    segments.push({ text: match[0], filler: true });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), filler: false });
  return segments;
}

export function countFillers(segments: Segment[]): number {
  return segments.filter((segment) => segment.filler).length;
}
