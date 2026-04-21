import { useState, useCallback, useEffect } from 'react';
import BookList from './components/BookList';
import Reader from './components/Reader';
import type { BookText } from './data/content';
import './App.css';

type Screen = 'list' | 'reader';

function App() {
  const [screen, setScreen] = useState<Screen>('list');
  const [selectedText, setSelectedText] = useState<BookText | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleSelectText = useCallback((text: BookText) => {
    setSelectedText(text);
    setScreen('reader');
  }, []);

  const handleBack = useCallback(() => {
    setScreen('list');
    setSelectedText(null);
  }, []);

  if (isDesktop) {
    return (
      <div className="antialiased h-screen bg-zinc-950 flex overflow-hidden">
        {!isFullscreen && (
          <aside className="hidden lg:block w-[320px] xl:w-[360px] shrink-0">
            <BookList
              onSelectText={handleSelectText}
              selectedTextId={selectedText?.id}
              desktopSidebar
              className="h-full"
            />
          </aside>
        )}

        <main className="flex-1 min-w-0">
          {selectedText ? (
            <Reader
              key={selectedText.id}
              text={selectedText}
              onBack={handleBack}
              showBack={isFullscreen}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-zinc-950 px-8">
              <div className="max-w-md text-center">
                <h1 className="text-zinc-100 text-3xl font-bold tracking-tight">promptme</h1>
                <p className="text-zinc-500 text-sm mt-3">
                  Pick a text from the sidebar to open the desktop reader.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="antialiased">
      {screen === 'list' && <BookList onSelectText={handleSelectText} />}
      {screen === 'reader' && selectedText && (
        <Reader key={selectedText.id} text={selectedText} onBack={handleBack} showBack />
      )}
    </div>
  );
}

export default App;
