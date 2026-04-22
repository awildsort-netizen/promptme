export interface TextSegment {
  type: 'header' | 'line';
  level?: number;
  text: string;
}

export interface WordBunch {
  type: 'header' | 'words';
  level?: number;
  text: string;      // raw text (may contain markdown inline syntax)
  html: string;      // rendered HTML for display
  words: string[];   // plain words for timing/count
}

// ---------------------------------------------------------------------------
// Inline markdown renderer — handles **bold**, *italic*, _italic_, --/em-dash
// ---------------------------------------------------------------------------
export function renderInlineMarkdown(text: string): string {
  return text
    // em-dash shorthand: -- → —
    .replace(/--/g, '—')
    // bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // italic: *text* or _text_  (must come after bold)
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

/** Parse markdown into segments, merging consecutive non-empty lines into paragraphs */
export function parseMarkdown(content: string): TextSegment[] {
  const lines = content.trim().split('\n');
  const segments: TextSegment[] = [];
  let currentParagraph: string[] = [];

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) {
      if (currentParagraph.length > 0) {
        segments.push({ type: 'line', text: currentParagraph.join(' ') });
        currentParagraph = [];
      }
      continue;
    }

    if (stripped.startsWith('#')) {
      if (currentParagraph.length > 0) {
        segments.push({ type: 'line', text: currentParagraph.join(' ') });
        currentParagraph = [];
      }
      const level = stripped.length - stripped.replace(/^#+/, '').length;
      const headerText = stripped.replace(/^#+\s*/, '').trim();
      segments.push({ type: 'header', level: Math.min(level, 3), text: headerText });
    } else {
      currentParagraph.push(stripped);
    }
  }

  if (currentParagraph.length > 0) {
    segments.push({ type: 'line', text: currentParagraph.join(' ') });
  }

  return segments;
}

/** Parse markdown preserving line breaks — each non-empty non-header line is its own segment */
export function parsePoetryMode(content: string): TextSegment[] {
  const lines = content.trim().split('\n');
  const segments: TextSegment[] = [];

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;

    if (stripped.startsWith('#')) {
      const level = stripped.length - stripped.replace(/^#+/, '').length;
      const headerText = stripped.replace(/^#+\s*/, '').trim();
      segments.push({ type: 'header', level: Math.min(level, 3), text: headerText });
    } else {
      segments.push({ type: 'line', text: stripped });
    }
  }

  return segments;
}

/** Target bunch size for splitting */
const TARGET_MIN = 8;
const TARGET_MAX = 15;

function splitIntoChunks(words: string[]): string[][] {
  if (words.length === 0) return [];
  if (words.length <= TARGET_MAX) return [words];

  const chunks: string[][] = [];
  let remaining = [...words];

  while (remaining.length > 0) {
    if (remaining.length <= TARGET_MAX) {
      chunks.push(remaining);
      break;
    }

    const numChunks = Math.ceil(remaining.length / TARGET_MAX);
    const idealSize = Math.ceil(remaining.length / numChunks);
    const chunkSize = Math.max(TARGET_MIN, Math.min(TARGET_MAX, idealSize));

    chunks.push(remaining.slice(0, chunkSize));
    remaining = remaining.slice(chunkSize);
  }

  return chunks;
}

// Strip markdown syntax to get plain words for timing purposes
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/--/g, '—');
}

/**
 * Convert segments to word bunches, with inline markdown preserved in html field.
 * In poetry mode, each segment is kept as a single bunch regardless of length.
 * In prose mode, long segments are split into TARGET_MIN–TARGET_MAX word chunks.
 */
export function splitIntoWordBunches(segments: TextSegment[], poetryMode = false): WordBunch[] {
  const bunches: WordBunch[] = [];

  for (const seg of segments) {
    if (seg.type === 'header') {
      bunches.push({
        type: 'header',
        level: seg.level || 1,
        text: seg.text,
        html: renderInlineMarkdown(seg.text),
        words: [seg.text],
      });
      continue;
    }

    const plainText = stripMarkdown(seg.text);
    const plainWords = plainText.split(/\s+/).filter(w => w.length > 0);
    const originalWords = seg.text.split(/\s+/).filter(w => w.length > 0);

    if (poetryMode) {
      // Keep the entire line as one bunch — never split poetry lines
      bunches.push({
        type: 'words',
        text: seg.text,
        html: renderInlineMarkdown(seg.text),
        words: plainWords,
      });
    } else {
      // Prose: split long segments into TARGET_MIN–TARGET_MAX word chunks
      const chunks = splitIntoChunks(plainWords);
      let wordOffset = 0;
      for (const chunk of chunks) {
        const originalChunk = originalWords.slice(wordOffset, wordOffset + chunk.length);
        const rawText = originalChunk.join(' ');
        bunches.push({
          type: 'words',
          text: rawText,
          html: renderInlineMarkdown(rawText),
          words: chunk,
        });
        wordOffset += chunk.length;
      }
    }
  }

  return bunches;
}
