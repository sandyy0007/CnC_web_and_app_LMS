export interface ChatMessage {
  /** Display name. Empty when a line has no "Name:" prefix. */
  speaker: string;
  text: string;
  /** True for lines written as "Me: ..." (the player's own earlier messages). */
  mine: boolean;
}

/**
 * Parses the CSV `passage` column. Format: `Name: text | Name: text`.
 * Messages are separated by `|`; the first `:` in a message splits the name
 * from the text. A `Me:` prefix marks the player's own earlier message.
 */
export function parseThread(passage: string | null | undefined): ChatMessage[] {
  return (passage ?? '')
    .split('|')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const split = chunk.indexOf(':');
      if (split <= 0 || split > 24) return { speaker: '', text: chunk, mine: false };
      const speaker = chunk.slice(0, split).trim();
      const text = chunk.slice(split + 1).trim();
      return { speaker, text, mine: speaker.toLowerCase() === 'me' };
    });
}

/** The name of whoever is waiting for the reply: the speaker of the last message that is not the player's. */
export function waitingOn(messages: readonly ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message.mine && message.speaker) return message.speaker;
  }
  return '';
}

export function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}
