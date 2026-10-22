export interface SlideCard {
  emoji: string;
  caption: string;
}

/**
 * The passage column holds the mystery slide as "emoji | caption". The emoji
 * part is optional: with no emoji the whole passage is the caption. The site
 * uses random photos; a plugin cannot ship or fetch them, so the picture is an
 * emoji with a caption.
 */
export function parseSlideCard(passage: string | null | undefined): SlideCard {
  const parts = (passage ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length >= 2 && !/[\p{L}\p{N}]/u.test(parts[0])) {
    return { emoji: parts[0], caption: parts.slice(1).join(' | ') };
  }
  return { emoji: '', caption: parts.join(' | ') };
}
