/**
 * useCatalog — fetches the live mkdirbook file tree from GitHub at runtime.
 *
 * On every load it hits the GitHub tree API, parses the list of .md files,
 * groups them by top-level directory (collection), fetches each file's raw
 * content to count words, then returns a fully-populated Book[] catalog.
 *
 * Results are cached in sessionStorage so subsequent navigations within the
 * same tab are instant.
 */

import { useState, useEffect } from 'react';
import type { Book, BookText } from '../data/content';
import { estimateReadTime } from '../data/content';

const REPO = 'awildsort-netizen/mkdirbook';
const BRANCH = 'master';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const TREE_URL = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
const CACHE_KEY = 'promptme_catalog_v3';

// Directories to skip entirely
const SKIP_DIRS = new Set(['launch', 'free2move/launch']);
// Files to skip (relative paths)
const SKIP_FILES = new Set(['README.md']);

// Human-readable collection names
const COLLECTION_LABELS: Record<string, string> = {
  dtune: 'dtune',
  free2move: 'free2move',
  newsletters: 'newsletters',
  aws: 'aws',
  lifey: 'lifey',
  LA: 'LA',
};

// Preferred display order for collections
const COLLECTION_ORDER = ['dtune', 'free2move', 'newsletters', 'aws', 'lifey', 'LA'];

function titleFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, '');
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function countWords(markdown: string): number {
  // Strip markdown headings, then count whitespace-separated tokens
  return markdown
    .replace(/^#+\s*/gm, '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0).length;
}

export interface CatalogState {
  books: Book[];
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({
    books: [],
    loading: true,
    error: null,
    lastFetched: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Try cache first
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (!cancelled) {
            setState({ books: parsed.books, loading: false, error: null, lastFetched: parsed.ts });
          }
          return;
        }
      } catch {
        // ignore cache errors
      }

      try {
        // 1. Fetch the full file tree
        const treeRes = await fetch(TREE_URL);
        if (!treeRes.ok) throw new Error(`GitHub tree API returned ${treeRes.status}`);
        const treeData = await treeRes.json();

        // 2. Filter to .md files in known collections
        const mdFiles: { collection: string; filename: string; path: string }[] = [];
        for (const item of treeData.tree ?? []) {
          if (item.type !== 'blob') continue;
          if (!item.path.endsWith('.md')) continue;
          if (SKIP_FILES.has(item.path)) continue;

          const parts = item.path.split('/');
          const collection = parts[0];
          if (SKIP_DIRS.has(collection)) continue;
          // Skip nested sub-dirs (e.g. free2move/launch/recipe.md)
          if (parts.length > 2) continue;

          const filename = parts[parts.length - 1];
          mdFiles.push({ collection, filename, path: item.path });
        }

        // 3. Fetch word counts for all files in parallel (batched to avoid rate limits)
        const BATCH = 10;
        const wordCounts: Record<string, number> = {};

        for (let i = 0; i < mdFiles.length; i += BATCH) {
          const batch = mdFiles.slice(i, i + BATCH);
          await Promise.all(
            batch.map(async ({ path }) => {
              try {
                const res = await fetch(`${RAW_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`);
                if (res.ok) {
                  const text = await res.text();
                  wordCounts[path] = countWords(text);
                }
              } catch {
                wordCounts[path] = 0;
              }
            })
          );
        }

        // 4. Group into collections
        const collectionMap: Record<string, BookText[]> = {};
        for (const { collection, filename, path } of mdFiles) {
          if (!collectionMap[collection]) collectionMap[collection] = [];
          const title = titleFromFilename(filename);
          const id = `${collection}/${slugify(title)}`;
          collectionMap[collection].push({
            id,
            title,
            filename,
            book: collection,
            wordCount: wordCounts[path] ?? 0,
          });
        }

        // 5. Sort texts within each collection alphabetically
        for (const texts of Object.values(collectionMap)) {
          texts.sort((a, b) => a.title.localeCompare(b.title));
        }

        // 6. Build ordered Book[]
        const allCollections = [
          ...COLLECTION_ORDER.filter(c => collectionMap[c]),
          ...Object.keys(collectionMap).filter(c => !COLLECTION_ORDER.includes(c)).sort(),
        ];

        const books: Book[] = allCollections.map(key => ({
          key,
          title: COLLECTION_LABELS[key] ?? key,
          description: '',
          texts: collectionMap[key],
        }));

        if (!cancelled) {
          const ts = Date.now();
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ books, ts }));
          } catch { /* quota */ }
          setState({ books, loading: false, error: null, lastFetched: ts });
        }
      } catch (err) {
        if (!cancelled) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load catalog',
          }));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return state;
}

export { estimateReadTime };
