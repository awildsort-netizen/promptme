import { useState, useEffect, useRef, useCallback } from 'react';
import type { BookText } from '../data/content';
import { getTextUrl } from '../data/content';
import type { WordBunch } from '../utils/parser';
import { parseMarkdown, parsePoetryMode, splitIntoWordBunches } from '../utils/parser';
import {
  getTextSettings,
  togglePoetryMode,
  addTrainingRun,
  getAveragedTimings,
  clearTrainingData,
} from '../utils/storage';
import {
  ArrowLeft,
  Play,
  Pause,
  GraduationCap,
  BookOpen,
  Feather,
  Trash2,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';

interface ReaderProps {
  text: BookText;
  onBack: () => void;
}

type Mode = 'read' | 'training';

const DEFAULT_WPM = 180;
const MS_PER_WORD = 60000 / DEFAULT_WPM;
const MIN_AUTO_DELAY = 400;

export default function Reader({ text, onBack }: ReaderProps) {
  const [bunches, setBunches] = useState<WordBunch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<Mode>('read');
  const [wpm, setWpm] = useState(DEFAULT_WPM);
  const [poetry, setPoetry] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trainingIntervals, setTrainingIntervals] = useState<number[]>([]);
  const [lastTapTime, setLastTapTime] = useState<number>(0);
  const [hasTrainedTiming, setHasTrainedTiming] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bunchRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isPlayingRef = useRef(false);
  const currentIndexRef = useRef(-1);
  const bunchesRef = useRef<WordBunch[]>([]);
  const wpmRef = useRef(DEFAULT_WPM);
  const modeRef = useRef<Mode>('read');
  const textIdRef = useRef(text.id);

  // Keep refs in sync
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { bunchesRef.current = bunches; }, [bunches]);
  useEffect(() => { wpmRef.current = wpm; }, [wpm]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { textIdRef.current = text.id; }, [text.id]);

  // Load content
  useEffect(() => {
    setLoading(true);
    const settings = getTextSettings(text.id);
    setPoetry(settings.poetryMode);
    setHasTrainedTiming(settings.trainingRuns.length > 0);

    fetch(getTextUrl(text.book, text.filename))
      .then((r) => r.text())
      .then((md) => {
        const segments = settings.poetryMode ? parsePoetryMode(md) : parseMarkdown(md);
        const b = splitIntoWordBunches(segments, settings.poetryMode);
        setBunches(b);
        bunchesRef.current = b;
        setCurrentIndex(-1);
        currentIndexRef.current = -1;
        setIsPlaying(false);
        isPlayingRef.current = false;
        setTrainingIntervals([]);
        setLastTapTime(0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [text]);

  // Recursive auto-advance timer — completely self-scheduling
  const scheduleNext = useCallback(() => {
    if (!isPlayingRef.current || modeRef.current !== 'read') return;

    const idx = currentIndexRef.current;
    const all = bunchesRef.current;
    if (idx >= all.length - 1) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      return;
    }

    // Compute delay for the CURRENT bunch (the one we're about to leave)
    const trained = getAveragedTimings(textIdRef.current);
    let delay: number;
    if (trained && idx >= 0 && idx < trained.length) {
      delay = trained[idx];
    } else {
      const bunch = all[Math.max(0, idx)];
      const wordCount = bunch?.words.length || 4;
      delay = (MS_PER_WORD / (wpmRef.current / DEFAULT_WPM)) * wordCount;
    }
    delay = Math.max(delay, MIN_AUTO_DELAY);

    setTimeout(() => {
      if (!isPlayingRef.current || modeRef.current !== 'read') return;
      const nextIdx = currentIndexRef.current + 1;
      if (nextIdx >= bunchesRef.current.length) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        return;
      }
      setCurrentIndex(nextIdx);
      currentIndexRef.current = nextIdx;
      scheduleNext();
    }, delay);
  }, []);

  // Start/stop the recursive timer
  useEffect(() => {
    if (isPlaying && mode === 'read') {
      // If starting from before beginning, jump to 0 immediately
      if (currentIndex < 0) {
        setCurrentIndex(0);
        currentIndexRef.current = 0;
      }
      scheduleNext();
    }
    // We intentionally don't stop the timer here — the timer callback checks isPlayingRef
  }, [isPlaying, mode, scheduleNext, currentIndex]);

  // Scroll current bunch into view
  useEffect(() => {
    if (currentIndex < 0) return;
    const el = bunchRefs.current[currentIndex];
    const container = scrollRef.current;
    if (!el || !container) return;

    const containerHeight = container.clientHeight;
    const elTop = el.offsetTop;
    const elHeight = el.offsetHeight;
    const targetY = elTop - containerHeight / 2 + elHeight / 2;

    container.scrollTo({
      top: Math.max(0, targetY),
      behavior: 'smooth',
    });
  }, [currentIndex]);

  // Toggle poetry mode
  const handleTogglePoetry = useCallback(() => {
    const newPoetry = togglePoetryMode(text.id);
    setPoetry(newPoetry);
    setIsPlaying(false);
    isPlayingRef.current = false;

    fetch(getTextUrl(text.book, text.filename))
      .then((r) => r.text())
      .then((md) => {
        const segments = newPoetry ? parsePoetryMode(md) : parseMarkdown(md);
        const b = splitIntoWordBunches(segments, newPoetry);
        setBunches(b);
        bunchesRef.current = b;
        setCurrentIndex(-1);
        currentIndexRef.current = -1;
        setTrainingIntervals([]);
        setLastTapTime(0);
      });
  }, [text]);

  // Handle tap
  const handleTap = useCallback(() => {
    if (modeRef.current === 'training') {
      const now = Date.now();

      if (currentIndexRef.current < 0) {
        setLastTapTime(now);
        setCurrentIndex(0);
        currentIndexRef.current = 0;
        return;
      }

      const interval = now - lastTapTime;
      const newIntervals = [...trainingIntervals, interval];
      setTrainingIntervals(newIntervals);
      setLastTapTime(now);

      const next = currentIndexRef.current + 1;
      if (next < bunchesRef.current.length) {
        setCurrentIndex(next);
        currentIndexRef.current = next;
      } else {
        addTrainingRun(textIdRef.current, newIntervals);
        setHasTrainedTiming(true);
      }
    } else {
      // Read mode: toggle play/pause
      setIsPlaying((prev) => {
        const next = !prev;
        isPlayingRef.current = next;
        return next;
      });
    }
  }, [lastTapTime, trainingIntervals]);

  // Switch mode
  const switchMode = useCallback((newMode: Mode) => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setMode(newMode);
    modeRef.current = newMode;
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
    setTrainingIntervals([]);
    setLastTapTime(0);
  }, []);

  // Restart training
  const restartTraining = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
    setTrainingIntervals([]);
    setLastTapTime(0);
  }, []);

  // Clear training
  const handleClearTraining = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    clearTrainingData(text.id);
    setHasTrainedTiming(false);
  }, [text.id]);

  const handleBack = useCallback(() => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    onBack();
  }, [onBack]);

  if (loading) {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm animate-pulse">loading...</div>
      </div>
    );
  }

  const effectiveIndex = Math.max(0, currentIndex);
  const progress = bunches.length > 1 ? (effectiveIndex / (bunches.length - 1)) * 100 : 0;

  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden select-none">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-3 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/50 z-20">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg active:bg-zinc-800/60 transition-colors"
        >
          <ArrowLeft size={18} className="text-zinc-400" />
          <span className="text-zinc-400 text-xs font-medium">back</span>
        </button>

        <div className="flex-1 mx-2 text-center min-w-0">
          <h2 className="text-zinc-200 text-sm font-semibold truncate">{text.title}</h2>
          <p className="text-zinc-600 text-[10px] uppercase tracking-wider">{text.book}</p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleTogglePoetry(); }}
            className={`p-2 rounded-lg active:bg-zinc-800/60 transition-colors relative ${
              poetry ? 'text-amber-400' : 'text-zinc-500'
            }`}
            title={poetry ? 'Poetry mode on' : 'Poetry mode off'}
          >
            <Feather size={16} />
            {poetry && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full" />
            )}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setShowInfo(!showInfo); }}
            className="p-2 rounded-lg active:bg-zinc-800/60 transition-colors text-zinc-500"
          >
            {mode === 'training' ? (
              <RotateCcw size={16} />
            ) : (
              <ChevronRight size={16} className={`transition-transform ${showInfo ? 'rotate-90' : ''}`} />
            )}
          </button>
        </div>
      </div>

      {/* Info panel */}
      {showInfo && (
        <div className="flex-shrink-0 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800/50 px-4 py-3 z-10 space-y-2">
          {mode === 'read' && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-xs">Speed</span>
                <span className="text-zinc-300 text-xs font-mono">
                  {hasTrainedTiming ? 'trained' : `${wpm} WPM`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-600 text-[10px]">60</span>
                <input
                  type="range"
                  min="60"
                  max="400"
                  step="20"
                  value={wpm}
                  onChange={(e) => setWpm(Number(e.target.value))}
                  className="flex-1 accent-amber-400 h-1"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-zinc-600 text-[10px]">400</span>
              </div>
            </>
          )}
          {hasTrainedTiming && (
            <button
              onClick={handleClearTraining}
              className="flex items-center gap-2 text-red-400/70 text-xs mt-2 active:text-red-400"
            >
              <Trash2 size={12} />
              Clear training data
            </button>
          )}
        </div>
      )}

      {/* Mode tabs */}
      <div className="flex-shrink-0 flex bg-zinc-900/50 border-b border-zinc-800/30">
        <button
          onClick={() => switchMode('read')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all ${
            mode === 'read'
              ? 'text-amber-400 border-b-2 border-amber-400 bg-zinc-800/30'
              : 'text-zinc-500 border-b-2 border-transparent'
          }`}
        >
          <BookOpen size={14} />
          Read
          {hasTrainedTiming && (
            <span className="ml-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full" />
          )}
        </button>
        <button
          onClick={() => switchMode('training')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all ${
            mode === 'training'
              ? 'text-amber-400 border-b-2 border-amber-400 bg-zinc-800/30'
              : 'text-zinc-500 border-b-2 border-transparent'
          }`}
        >
          <GraduationCap size={14} />
          Training
        </button>
      </div>

      {/* Main reading area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-none"
        onClick={handleTap}
      >
        {/* Top spacer */}
        <div className="h-[40vh]" />

        {/* Partitions */}
        <div className="px-5">
          {bunches.map((bunch, i) => {
            const isCurrent = i === effectiveIndex;
            const isPast = i < effectiveIndex;
            const distance = Math.abs(i - effectiveIndex);

            const opacity = isCurrent
              ? 1
              : isPast
              ? 0.12
              : Math.max(0.06, 1 - distance * 0.12);

            const brightness = isCurrent
              ? 'brightness(110%)'
              : isPast
              ? 'brightness(35%)'
              : `brightness(${Math.max(25, 100 - distance * 7)}%)`;

            return (
              <div
                key={i}
                ref={(el) => { bunchRefs.current[i] = el; }}
                className={`transition-all duration-300 ease-out ${
                  isCurrent ? 'scale-[1.04]' : ''
                }`}
                style={{
                  opacity,
                  filter: brightness,
                  marginBottom: bunch.type === 'header' ? '1.5rem' : '0.25rem',
                }}
              >
                <div
                  className={`py-5 px-4 rounded-xl transition-colors duration-300 ${
                    isCurrent ? 'bg-zinc-800/40' : 'bg-transparent'
                  }`}
                >
                  {bunch.type === 'header' ? (
                    <h3
                      className={`font-bold text-zinc-100 text-center ${
                        bunch.level === 1
                          ? 'text-xl'
                          : bunch.level === 2
                          ? 'text-lg'
                          : 'text-base'
                      }`}
                    >
                      {bunch.text}
                    </h3>
                  ) : (
                    <p
                      className={`text-center leading-relaxed ${
                        isCurrent
                          ? 'text-[18px] font-semibold text-amber-100'
                          : 'text-[16px] text-zinc-300'
                      }`}
                    >
                      {bunch.text}
                    </p>
                  )}
                </div>

                {i < bunches.length - 1 && bunch.type !== 'header' && (
                  <div className="h-px bg-zinc-800/30 mx-8" />
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom spacer */}
        <div className="h-[40vh]" />
      </div>

      {/* Bottom controls */}
      <div className="flex-shrink-0 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800/50 px-4 py-3 z-20">
        <div className="flex items-center justify-between gap-3">
          {/* Progress */}
          <div className="flex-1 min-w-0">
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400/80 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-zinc-500 text-[10px]">
                {effectiveIndex + 1} / {bunches.length}
              </span>
              <span className="text-zinc-500 text-[10px]">
                {mode === 'read'
                  ? isPlaying
                    ? hasTrainedTiming
                      ? 'trained pace'
                      : `${wpm} wpm`
                    : 'tap to play'
                  : currentIndex < 0
                  ? 'tap to start'
                  : effectiveIndex >= bunches.length - 1
                  ? 'complete!'
                  : `${trainingIntervals.length} recorded`}
              </span>
            </div>
          </div>

          {/* Action button */}
          {mode === 'read' ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const next = !isPlaying;
                setIsPlaying(next);
                isPlayingRef.current = next;
              }}
              className="w-10 h-10 rounded-full bg-amber-400/10 border border-amber-400/30
                         flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
            >
              {isPlaying ? (
                <Pause size={16} className="text-amber-400" />
              ) : (
                <Play size={16} className="text-amber-400 ml-0.5" />
              )}
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                restartTraining(e);
              }}
              className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700
                         flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
            >
              <RotateCcw size={16} className="text-zinc-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
