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
  showBack?: boolean;
}

type Mode = 'read' | 'training';

const DEFAULT_WPM = 140;
const MS_PER_WORD = 60000 / DEFAULT_WPM;
const MIN_AUTO_DELAY = 400;
// How long to suppress scroll-sync after a programmatic smooth scroll (ms)
const AUTO_SCROLL_SUPPRESS_MS = 700;

export default function Reader({ text, onBack, showBack = true }: ReaderProps) {
  const initialSettings = getTextSettings(text.id);
  const [bunches, setBunches] = useState<WordBunch[]>([]);

  // FIX 5: Single activeIndex replaces the dual currentIndex/scrollIndex design.
  // -1 = nothing active yet.
  const [activeIndex, setActiveIndex] = useState(-1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<Mode>('read');
  const [wpm, setWpm] = useState(DEFAULT_WPM);
  const [poetry, setPoetry] = useState(initialSettings.poetryMode);
  const [loading, setLoading] = useState(true);
  const [trainingIntervals, setTrainingIntervals] = useState<number[]>([]);
  const [lastTapTime, setLastTapTime] = useState<number>(0);
  const [hasTrainedTiming, setHasTrainedTiming] = useState(
    initialSettings.trainingRuns.length > 0
  );
  const [showInfo, setShowInfo] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bunchRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Refs that mirror state for use inside callbacks/timers without stale closures
  const isPlayingRef = useRef(false);
  const activeIndexRef = useRef(-1);
  const bunchesRef = useRef<WordBunch[]>([]);
  const wpmRef = useRef(DEFAULT_WPM);
  const modeRef = useRef<Mode>('read');
  const textIdRef = useRef(text.id);

  // Timer ref
  const timeoutRef = useRef<number | null>(null);
  // Stable ref to scheduleNext so the timer callback can call it without capturing a stale closure
  const scheduleNextRef = useRef<() => void>(() => {});
  // rAF ref for scroll debounce
  const scrollSyncFrameRef = useRef<number | null>(null);

  // FIX 2: Guard that suppresses scroll-sync while a programmatic smooth scroll is in flight,
  // preventing the feedback loop where auto-scroll fires onScroll → re-syncs index → re-schedules.
  const isAutoScrollingRef = useRef(false);
  const autoScrollSuppressTimerRef = useRef<number | null>(null);

  // FIX 1: Flag that marks whether the most recent activeIndex change was timer-driven.
  // The scroll-into-view effect only fires when this is true.
  const scrollCausedByTimerRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { bunchesRef.current = bunches; }, [bunches]);
  useEffect(() => { wpmRef.current = wpm; }, [wpm]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { textIdRef.current = text.id; }, [text.id]);

  // Load content
  useEffect(() => {
    setLoading(true);
    fetch(getTextUrl(text.book, text.filename))
      .then((r) => r.text())
      .then((md) => {
        const segments = poetry ? parsePoetryMode(md) : parseMarkdown(md);
        const b = splitIntoWordBunches(segments, poetry);
        setBunches(b);
        bunchesRef.current = b;
        setActiveIndex(-1);
        activeIndexRef.current = -1;
        setIsPlaying(false);
        isPlayingRef.current = false;
        setTrainingIntervals([]);
        setLastTapTime(0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [poetry, text]);

  // FIX 3 + FIX 4: scheduleNext clears any existing timer before setting a new one,
  // and captures the index it was scheduled from so stale timer fires can be discarded.
  const scheduleNext = useCallback(() => {
    if (!isPlayingRef.current || modeRef.current !== 'read') return;

    // FIX 3: Always clear before scheduling to prevent duplicate timers
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const idx = activeIndexRef.current;
    const all = bunchesRef.current;
    if (idx >= all.length - 1) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      return;
    }

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

    // FIX 4: Capture the index this timer was scheduled from
    const scheduledFromIndex = idx;

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      if (!isPlayingRef.current || modeRef.current !== 'read') return;

      // FIX 4: Discard stale timer if the user scrolled away since this was scheduled
      if (activeIndexRef.current !== scheduledFromIndex) {
        scheduleNextRef.current();
        return;
      }

      const nextIdx = activeIndexRef.current + 1;
      if (nextIdx >= bunchesRef.current.length) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        return;
      }

      // FIX 1: Mark this as a timer-driven change so scroll-into-view fires
      scrollCausedByTimerRef.current = true;
      setActiveIndex(nextIdx);
      activeIndexRef.current = nextIdx;
      scheduleNextRef.current();
    }, delay);
  }, []);

  useEffect(() => { scheduleNextRef.current = scheduleNext; }, [scheduleNext]);

  useEffect(() => {
    if (isPlaying && mode === 'read') {
      scheduleNextRef.current();
      return;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [isPlaying, mode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      if (scrollSyncFrameRef.current !== null) window.cancelAnimationFrame(scrollSyncFrameRef.current);
      if (autoScrollSuppressTimerRef.current !== null) window.clearTimeout(autoScrollSuppressTimerRef.current);
    };
  }, []);

  // Sync scroll position → activeIndex (when not playing, or when user scrolls while playing)
  const syncScrollToActiveIndex = useCallback(() => {
    const container = scrollRef.current;
    if (!container || modeRef.current !== 'read') return;

    // FIX 2: Ignore scroll events that we triggered ourselves
    if (isAutoScrollingRef.current) return;

    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;

    bunchRefs.current.forEach((el, index) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const elementCenter = rect.top + rect.height / 2;
      const distance = Math.abs(elementCenter - containerCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex < 0 || closestIndex === activeIndexRef.current) return;

    // User-driven scroll: update index without triggering auto-scroll back
    scrollCausedByTimerRef.current = false;
    setActiveIndex(closestIndex);
    activeIndexRef.current = closestIndex;

    // If playing, cancel the pending timer and restart from the new position
    if (isPlayingRef.current) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      scheduleNextRef.current();
    }
  }, []);

  const handleReaderScroll = useCallback(() => {
    if (scrollSyncFrameRef.current !== null) window.cancelAnimationFrame(scrollSyncFrameRef.current);
    scrollSyncFrameRef.current = window.requestAnimationFrame(() => {
      scrollSyncFrameRef.current = null;
      syncScrollToActiveIndex();
    });
  }, [syncScrollToActiveIndex]);

  // Initial scroll sync after content loads or mode changes
  useEffect(() => {
    if (mode !== 'read' || bunches.length === 0) return;
    const frameId = window.requestAnimationFrame(() => syncScrollToActiveIndex());
    return () => window.cancelAnimationFrame(frameId);
  }, [bunches, mode, syncScrollToActiveIndex, text.id]);

  // FIX 1: Scroll the active bunch into view ONLY when the change was timer-driven
  useEffect(() => {
    if (activeIndex < 0) return;
    if (!scrollCausedByTimerRef.current) return;
    scrollCausedByTimerRef.current = false;

    const el = bunchRefs.current[activeIndex];
    const container = scrollRef.current;
    if (!el || !container) return;

    // FIX 2: Mark that we're auto-scrolling so the scroll handler ignores these events
    if (autoScrollSuppressTimerRef.current !== null) {
      window.clearTimeout(autoScrollSuppressTimerRef.current);
    }
    isAutoScrollingRef.current = true;
    autoScrollSuppressTimerRef.current = window.setTimeout(() => {
      isAutoScrollingRef.current = false;
      autoScrollSuppressTimerRef.current = null;
    }, AUTO_SCROLL_SUPPRESS_MS);

    const frameId = window.requestAnimationFrame(() => {
      const containerHeight = container.clientHeight;
      const elTop = el.offsetTop;
      const elHeight = el.offsetHeight;
      const targetY = elTop - containerHeight / 2 + elHeight / 2;
      container.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeIndex]);

  const handleTogglePoetry = useCallback(() => {
    const newPoetry = togglePoetryMode(text.id);
    setPoetry(newPoetry);
    setIsPlaying(false);
    isPlayingRef.current = false;
    setLoading(true);
    setActiveIndex(-1);
    activeIndexRef.current = -1;
    setTrainingIntervals([]);
    setLastTapTime(0);
  }, [text]);

  const togglePlayback = useCallback(() => {
    const next = !isPlayingRef.current;
    if (next) {
      const current = activeIndexRef.current;
      const lastIndex = bunchesRef.current.length - 1;
      const startIndex = current < 0 || current >= lastIndex ? 0 : current;
      scrollCausedByTimerRef.current = true;
      setActiveIndex(startIndex);
      activeIndexRef.current = startIndex;
    }
    setIsPlaying(next);
    isPlayingRef.current = next;
  }, []);

  const handleTap = useCallback(() => {
    if (modeRef.current === 'training') {
      const now = Date.now();
      if (activeIndexRef.current < 0) {
        setLastTapTime(now);
        scrollCausedByTimerRef.current = true;
        setActiveIndex(0);
        activeIndexRef.current = 0;
        return;
      }
      const interval = now - lastTapTime;
      const newIntervals = [...trainingIntervals, interval];
      setTrainingIntervals(newIntervals);
      setLastTapTime(now);
      const next = activeIndexRef.current + 1;
      if (next < bunchesRef.current.length) {
        scrollCausedByTimerRef.current = true;
        setActiveIndex(next);
        activeIndexRef.current = next;
      } else {
        addTrainingRun(textIdRef.current, newIntervals);
        setHasTrainedTiming(true);
      }
    } else {
      togglePlayback();
    }
  }, [lastTapTime, togglePlayback, trainingIntervals]);

  const switchMode = useCallback((newMode: Mode) => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setMode(newMode);
    modeRef.current = newMode;
    setActiveIndex(-1);
    activeIndexRef.current = -1;
    setTrainingIntervals([]);
    setLastTapTime(0);
  }, []);

  const restartTraining = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex(-1);
    activeIndexRef.current = -1;
    setTrainingIntervals([]);
    setLastTapTime(0);
  }, []);

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
        <div className="flex gap-1.5 items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    );
  }

  // FIX 5: Single activeIndex drives all rendering — no more dual-index logic
  const displayIndex = activeIndex >= 0 ? activeIndex : null;
  const progress = displayIndex !== null && bunches.length > 1
    ? (displayIndex / (bunches.length - 1)) * 100
    : 0;

  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden select-none">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-3 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/50 z-20">
        {showBack ? (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg active:bg-zinc-800/60 transition-colors"
          >
            <ArrowLeft size={18} className="text-zinc-400" />
            <span className="text-zinc-400 text-xs font-medium">back</span>
          </button>
        ) : (
          <div className="w-[60px]" />
        )}

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
              <ChevronRight size={16} className={`transition-transform duration-200 ${showInfo ? 'rotate-90' : ''}`} />
            )}
          </button>
        </div>
      </div>

      {/* Info panel */}
      <div
        className={`flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out ${
          showInfo ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800/50 px-4 py-3 space-y-2">
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
      </div>

      {/* Mode tabs */}
      <div className="flex-shrink-0 flex bg-zinc-900/50 border-b border-zinc-800/30">
        <button
          onClick={() => switchMode('read')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all duration-200 ${
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
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all duration-200 ${
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
        onScroll={handleReaderScroll}
      >
        {/* Top spacer */}
        <div className="h-[40vh]" />

        <div className="px-5">
          {bunches.map((bunch, i) => {
            const isCurrent = displayIndex === i;
            const isPast = displayIndex !== null && i < displayIndex;
            const distance = displayIndex === null ? null : Math.abs(i - displayIndex);

            const opacity = isCurrent
              ? 1
              : isPast
              ? 0.12
              : distance === null
              ? 0.92
              : Math.max(0.06, 1 - distance * 0.12);

            const brightness = isCurrent
              ? 'brightness(115%)'
              : isPast
              ? 'brightness(35%)'
              : distance === null
              ? 'brightness(100%)'
              : `brightness(${Math.max(25, 100 - distance * 7)}%)`;

            return (
              <div
                key={i}
                ref={(el) => { bunchRefs.current[i] = el; }}
                className="transition-all duration-500 ease-out"
                style={{
                  opacity,
                  filter: brightness,
                  transform: isCurrent ? 'scale(1.04)' : 'scale(1)',
                  marginBottom: bunch.type === 'header' ? '1.5rem' : '0.25rem',
                  transitionProperty: 'opacity, filter, transform',
                  transitionTimingFunction: isCurrent
                    ? 'cubic-bezier(0.34, 1.56, 0.64, 1)'
                    : 'cubic-bezier(0.4, 0, 0.2, 1)',
                  transitionDuration: isCurrent ? '400ms' : '500ms',
                }}
              >
                <div
                  className="py-5 px-4 rounded-xl transition-colors duration-400"
                  style={{
                    backgroundColor: isCurrent ? 'rgba(39,39,42,0.4)' : 'transparent',
                    transition: 'background-color 400ms ease',
                  }}
                >
                  {bunch.type === 'header' ? (
                    <h3
                      className={`bunch-text font-bold text-zinc-100 text-center ${
                        bunch.level === 1
                          ? 'text-xl'
                          : bunch.level === 2
                          ? 'text-lg'
                          : 'text-base'
                      }`}
                      dangerouslySetInnerHTML={{ __html: bunch.html }}
                    />
                  ) : (
                    <p
                      className={`bunch-text text-center leading-relaxed transition-all duration-400 ${
                        isCurrent
                          ? 'bunch-active text-[18px] font-semibold text-amber-100'
                          : 'text-[16px] text-zinc-300'
                      }`}
                      dangerouslySetInnerHTML={{ __html: bunch.html }}
                    />
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
                className="h-full bg-amber-400/80 rounded-full"
                style={{
                  width: `${progress}%`,
                  transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-zinc-500 text-[10px]">
                {displayIndex === null ? 0 : displayIndex + 1} / {bunches.length}
              </span>
              <span className="text-zinc-500 text-[10px]">
                {mode === 'read'
                  ? isPlaying
                    ? hasTrainedTiming
                      ? 'trained pace'
                      : `${wpm} wpm`
                    : 'tap to play'
                  : displayIndex === null
                  ? 'tap to start'
                  : displayIndex >= bunches.length - 1
                  ? 'complete!'
                  : `${trainingIntervals.length} recorded`}
              </span>
            </div>
          </div>

          {/* Action button */}
          {mode === 'read' ? (
            <button
              onClick={(e) => { e.stopPropagation(); togglePlayback(); }}
              className="w-10 h-10 rounded-full bg-amber-400/10 border border-amber-400/30
                         flex items-center justify-center active:scale-90 transition-transform duration-150 flex-shrink-0"
            >
              {isPlaying ? (
                <Pause size={16} className="text-amber-400" />
              ) : (
                <Play size={16} className="text-amber-400 ml-0.5" />
              )}
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); restartTraining(e); }}
              className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700
                         flex items-center justify-center active:scale-90 transition-transform duration-150 flex-shrink-0"
            >
              <RotateCcw size={16} className="text-zinc-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
