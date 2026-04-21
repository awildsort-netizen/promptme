import { useState } from 'react';
import type { Book, BookText } from '../data/content';
import { BOOKS } from '../data/content';
import { FolderOpen, Folder, ChevronRight, FileText } from 'lucide-react';

interface BookListProps {
  onSelectText: (text: BookText) => void;
}

function BookFolder({ book, onSelectText }: { book: Book; onSelectText: (t: BookText) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3.5 bg-zinc-900/80 backdrop-blur-sm 
                   rounded-xl border border-zinc-800/60 active:scale-[0.98] transition-all duration-150
                   hover:bg-zinc-800/80 hover:border-zinc-700/60"
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
          isOpen ? 'max-h-[2000px] opacity-100 mt-1' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="pl-3 pr-1 space-y-0.5">
          {book.texts.map((text) => (
            <button
              key={text.id}
              onClick={() => onSelectText(text)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg 
                         text-left active:bg-zinc-800/60 transition-colors duration-100
                         hover:bg-zinc-800/40"
            >
              <FileText size={16} className="text-zinc-500 flex-shrink-0" />
              <span className="text-zinc-300 text-sm font-medium truncate">{text.title}</span>
              <ChevronRight size={14} className="text-zinc-600 flex-shrink-0 ml-auto" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BookList({ onSelectText }: BookListProps) {
  const totalTexts = BOOKS.reduce((sum, b) => sum + b.texts.length, 0);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/50">
        <div className="px-4 py-4">
          <h1 className="text-zinc-100 text-xl font-bold tracking-tight">promptme</h1>
          <p className="text-zinc-500 text-xs mt-1">{BOOKS.length} collections &middot; {totalTexts} texts</p>
        </div>
      </div>

      {/* Book folders */}
      <div className="px-3 py-3 pb-24">
        {BOOKS.map((book) => (
          <BookFolder key={book.key} book={book} onSelectText={onSelectText} />
        ))}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-zinc-700 text-[11px]">
            poems & essays by awildsort
          </p>
        </div>
      </div>
    </div>
  );
}
