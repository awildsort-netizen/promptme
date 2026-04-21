export interface TextSegment {
  type: 'header' | 'line';
  level?: number;
  text: string;
}

export interface WordBunch {
  type: 'header' | 'words';
  level?: number;
  text: string;
  words: string[];
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
        segments.push({
          type: 'line',
          text: currentParagraph.join(' ')
        });
        currentParagraph = [];
      }
      continue;
    }

    if (stripped.startsWith('#')) {
      if (currentParagraph.length > 0) {
        segments.push({
          type: 'line',
          text: currentParagraph.join(' ')
        });
        currentParagraph = [];
      }
      const level = stripped.length - stripped.replace(/^#+/, '').length;
      const headerText = stripped.replace(/^#+\s*/, '').trim();
      segments.push({
        type: 'header',
        level: Math.min(level, 3),
        text: headerText
      });
    } else {
      currentParagraph.push(stripped);
    }
  }

  if (currentParagraph.length > 0) {
    segments.push({
      type: 'line',
      text: currentParagraph.join(' ')
    });
  }

  return segments;
}

/** Parse markdown preserving line breaks — each non-empty non-header line is its own segment */
export function parsePoetryMode(content: string): TextSegment[] {
  const lines = content.trim().split('\n');
  const segments: TextSegment[] = [];

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) {
      // Blank line = paragraph break, represented as empty line segment
      continue;
    }

    if (stripped.startsWith('#')) {
      const level = stripped.length - stripped.replace(/^#+/, '').length;
      const headerText = stripped.replace(/^#+\s*/, '').trim();
      segments.push({
        type: 'header',
        level: Math.min(level, 3),
        text: headerText
      });
    } else {
      segments.push({
        type: 'line',
        text: stripped
      });
    }
  }

  return segments;
}

/** Target bunch size for splitting */
const TARGET_MIN = 5;
const TARGET_MAX = 12;

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

    if (remaining.length >= TARGET_MIN && remaining.length <= TARGET_MAX) {
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

/** Convert segments to word bunches, with paragraph spacing tracking */
export function splitIntoWordBunches(segments: TextSegment[]): WordBunch[] {
  const bunches: WordBunch[] = [];

  for (const seg of segments) {
    if (seg.type === 'header') {
      bunches.push({
        type: 'header',
        level: seg.level || 1,
        text: seg.text,
        words: [seg.text]
      });
      continue;
    }

    const words = seg.text.split(/\s+/).filter(w => w.length > 0);
    const chunks = splitIntoChunks(words);

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      bunches.push({
        type: 'words',
        text: chunk.join(' '),
        words: chunk
      });
    }
  }

  return bunches;
}
