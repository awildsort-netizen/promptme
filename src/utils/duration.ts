/**
 * duration.ts — compute accurate per-text read durations.
 *
 * Uses the same bunch-splitting logic as the Reader, then:
 *   1. If trained timing data exists in localStorage → sum averaged intervals.
 *   2. Otherwise → estimate each bunch by its word count at the given WPM.
 *
 * Results are cached in sessionStorage so repeated calls are free.
 */

import { parseMarkdown, parsePoetryMode, splitIntoWordBunches } from './parser';
import { getAveragedTimings, getTextSettings } from './storage';
import { getTextUrl } from '../data/content';

const DEFAULT_WPM = 140;
const MIN_BUNCH_MS = 400;
const DURATION_CACHE_KEY = 'promptme_durations_v1';

function getDurationCache(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(DURATION_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function setDurationCache(cache: Record<string, number>) {
  try {
    sessionStorage.setItem(DURATION_CACHE_KEY, JSON.stringify(cache));
  } catch { /* quota */ }
}

/**
 * Format a duration in milliseconds as a human-readable string.
 * Examples: "45 sec", "1:30", "4:02"
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Compute the total read duration for a text in milliseconds.
 * Fetches and parses the markdown, then sums bunch timings.
 * Returns null if the fetch fails.
 */
export async function computeTextDuration(
  textId: string,
  book: string,
  filename: string,
  wpm = DEFAULT_WPM
): Promise<number | null> {
  // Check session cache first
  const cache = getDurationCache();
  const cacheKey = `${textId}@${wpm}`;
  if (cacheKey in cache) return cache[cacheKey];

  try {
    const url = getTextUrl(book, filename);
    const res = await fetch(url);
    if (!res.ok) return null;
    const markdown = await res.text();

    // Use poetry mode setting if the user has set it
    const settings = getTextSettings(textId);
    const segments = settings.poetryMode
      ? parsePoetryMode(markdown)
      : parseMarkdown(markdown);
    const bunches = splitIntoWordBunches(segments, settings.poetryMode);

    // Try trained timings first
    const trained = getAveragedTimings(textId);

    let totalMs = 0;
    const msPerWord = (60000 / wpm);

    for (let i = 0; i < bunches.length; i++) {
      let bunchMs: number;
      if (trained && i < trained.length) {
        bunchMs = trained[i];
      } else {
        const wordCount = bunches[i].words.length;
        bunchMs = msPerWord * wordCount;
      }
      totalMs += Math.max(bunchMs, MIN_BUNCH_MS);
    }

    // Cache the result
    cache[cacheKey] = totalMs;
    setDurationCache(cache);

    return totalMs;
  } catch {
    return null;
  }
}
