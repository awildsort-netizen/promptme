import { useState, useEffect, useRef } from 'react';
import type { Book, BookText } from '../data/content';
import { FolderOpen, Folder, ChevronRight, FileText, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { computeTextDuration, formatDuration } from '../utils/duration';
import { getAveragedTimings } from '../utils/storage';

const DEFAULT_WPM = 140;

interface BookListProps {
  books: Book[];
  catalogLoading: boolean;
  catalogError: string | null;
  onSelectText: (text: BookText) => void;
  selectedTextId?: string;
  className?: string;
  desktopSidebar?: boolean;
}

interface BookFolderProps {
  book: Book;
  onSelectText: (text: BookText) => void;
  selectedTextId?: string;
  isOpen: boolean;
  onToggle: () => void;
}

// Per-text duration display — fetches lazily when the folder is open
function TextDuration({ text }: { text: BookText }) {
  const [duration, setDuration] = useState<string | null>(null);
  const [isTrained, setIsTrained] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const trained = getAveragedTimings(text.id);
    setIsTrained(trained !== null && trained.length > 0);

    computeTextDuration(text.id, text.book, text.filename, DEFAULT_WPM).then(ms => {
      if (ms !== null) setDuration(formatDuration(ms));
    });
  }, [text]);

  if (!duration) {
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <Clock size={10} className="flex-shrink-0 text-zinc-700" />
        <span className="text-[11px] text-zinc-700">…</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 mt-0.5">
      <Clock
        size={10}
        className={cn('flex-shrink-0', isTrained ? 'text-emerald-500/70' : 'text-zinc-600')}
      />
      <span className={cn('text-[11px]', isTrained ? 'text-emerald-500/70' : 'text-zinc-600')}>
        {duration}
      </span>
      {isTrained && (
        <span className="text-[9px] text-emerald-600/60 ml-0.5">trained</span>
      )}
    </div>
  );
}

function BookFolder({ book, onSelectText, selectedTextId, isOpen, onToggle }: BookFolderProps) {
  const containsSelectedText = book.texts.some((text) => text.id === selectedTextId);

  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3.5 bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-zinc-800/60 transition-all duration-150 hover:bg-zinc-800/80 hover:border-zinc-700/60',
          'active:scale-[0.98]',
          containsSelectedText && 'border-amber-400/30 bg-zinc-900'
        )}
      >
        <div className="flex-shrink-0 text-amber-400">
          {isOpen ? <FolderOpen size={22} /> : <Folder size={22} />}
        </div>
        <div className="flex-1 text-left">
          <div className="text-zinc-100 font-semibold text-[15px] tracking-tight">{book.title}</div>
          <div className="text-zinc-500 text-xs mt-0.5">{book.texts.length} texts</div>
        </div>
        <ChevronRight
          size={18}
          className={`text-zinc-600 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-90' : ''
          }`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          isOpen ? 'max-h-[4000px] opacity-100 mt-1' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="pl-3 pr-1 space-y-0.5">
          {book.texts.map((text) => {
            const isSelected = text.id === selectedTextId;

            return (
              <button
                key={text.id}
                onClick={() => onSelectText(text)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors duration-100 hover:bg-zinc-800/40',
                  isSelected
                    ? 'bg-amber-400/10 text-amber-100 ring-1 ring-amber-400/30'
                    : 'active:bg-zinc-800/60'
                )}
              >
                <FileText
                  size={16}
                  className={cn(
                    'flex-shrink-0 mt-0.5',
                    isSelected ? 'text-amber-300' : 'text-zinc-500'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      'text-sm font-medium truncate',
                      isSelected ? 'text-amber-100' : 'text-zinc-300'
                    )}
                  >
                    {text.title}
                  </div>
                  {/* Only render duration when folder is open — avoids fetching all 64 files at once */}
                  {isOpen && (
                    <div className={isSelected ? '[&_.text-zinc-600]:text-amber-400/70 [&_.text-emerald-500\\/70]:text-emerald-400/80' : ''}>
                      <TextDuration text={text} />
                    </div>
                  )}
                </div>
                <ChevronRight
                  size={14}
                  className={cn(
                    'flex-shrink-0 ml-auto',
                    isSelected ? 'text-amber-300' : 'text-zinc-600'
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function BookList({
  books,
  catalogLoading,
  catalogError,
  onSelectText,
  selectedTextId,
  className,
  desktopSidebar = false,
}: BookListProps) {
  const totalTexts = books.reduce((sum, b) => sum + b.texts.length, 0);

  // Track open state for each collection
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => {
    // Pre-open the collection that contains the selected text (if any)
    return new Set<string>();
  });

  // When books load or selectedTextId changes, ensure the right folder is open
  useEffect(() => {
    if (!selectedTextId || books.length === 0) return;
    const ownerBook = books.find(b => b.texts.some(t => t.id === selectedTextId));
    if (ownerBook) {
      setOpenKeys(prev => {
        if (prev.has(ownerBook.key)) return prev;
        return new Set([...prev, ownerBook.key]);
      });
    }
  }, [selectedTextId, books]);

  const toggleFolder = (key: string) => {
    setOpenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div
      className={cn(
        'bg-zinc-950',
        desktopSidebar ? 'h-full overflow-y-auto border-r border-zinc-800/50' : 'min-h-screen',
        className
      )}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/50">
        <div className="px-4 py-4">
          <h1 className="text-zinc-100 text-xl font-bold tracking-tight">promptme</h1>
          {catalogLoading ? (
            <p className="text-zinc-600 text-xs mt-1 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-zinc-600 animate-pulse" />
              loading catalog…
            </p>
          ) : catalogError ? (
            <p className="text-red-400/70 text-xs mt-1">could not load catalog</p>
          ) : (
            <p className="text-zinc-500 text-xs mt-1">
              {books.length} collections &middot; {totalTexts} texts
            </p>
          )}
        </div>
      </div>

      {/* Book folders */}
      <div className={cn('px-3 py-3', desktopSidebar ? 'pb-8' : 'pb-24')}>
        {catalogLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="h-[60px] rounded-xl bg-zinc-900/60 border border-zinc-800/40 animate-pulse"
              />
            ))}
          </div>
        ) : catalogError ? (
          <div className="px-4 py-6 text-center">
            <p className="text-zinc-500 text-sm">Failed to load texts.</p>
            <p className="text-zinc-700 text-xs mt-1">{catalogError}</p>
          </div>
        ) : (
          books.map((book) => (
            <BookFolder
              key={`${book.key}:${selectedTextId ?? 'none'}`}
              book={book}
              onSelectText={onSelectText}
              selectedTextId={selectedTextId}
              isOpen={openKeys.has(book.key)}
              onToggle={() => toggleFolder(book.key)}
            />
          ))
        )}

        {!catalogLoading && !catalogError && (
          <div className="mt-8 text-center">
            <p className="text-zinc-700 text-[11px]">
              poems & essays by awildsort
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
