import { useState, useCallback } from 'react';
import BookList from './components/BookList';
import Reader from './components/Reader';
import type { BookText } from './data/content';
import './App.css';

type Screen = 'list' | 'reader';

function App() {
  const [screen, setScreen] = useState<Screen>('list');
  const [selectedText, setSelectedText] = useState<BookText | null>(null);

  const handleSelectText = useCallback((text: BookText) => {
    setSelectedText(text);
    setScreen('reader');
  }, []);

  const handleBack = useCallback(() => {
    setScreen('list');
    setSelectedText(null);
  }, []);

  return (
    <div className="antialiased">
      {screen === 'list' && <BookList onSelectText={handleSelectText} />}
      {screen === 'reader' && selectedText && (
        <Reader text={selectedText} onBack={handleBack} />
      )}
    </div>
  );
}

export default App;
