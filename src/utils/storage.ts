const STORAGE_KEY = 'promptme_settings';

export interface TrainingRun {
  timestamp: number;
  intervals: number[]; // ms between taps for each bunch
}

export interface TextSettings {
  poetryMode: boolean;
  trainingRuns: TrainingRun[];
}

function getAllSettings(): Record<string, TextSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveAllSettings(all: Record<string, TextSettings>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getTextSettings(textId: string): TextSettings {
  const all = getAllSettings();
  return all[textId] || { poetryMode: false, trainingRuns: [] };
}

export function saveTextSettings(textId: string, settings: TextSettings) {
  const all = getAllSettings();
  all[textId] = settings;
  saveAllSettings(all);
}

export function togglePoetryMode(textId: string): boolean {
  const settings = getTextSettings(textId);
  settings.poetryMode = !settings.poetryMode;
  saveTextSettings(textId, settings);
  return settings.poetryMode;
}

export function addTrainingRun(textId: string, intervals: number[]) {
  const settings = getTextSettings(textId);
  settings.trainingRuns.push({
    timestamp: Date.now(),
    intervals
  });
  // Keep last 10 runs
  if (settings.trainingRuns.length > 10) {
    settings.trainingRuns = settings.trainingRuns.slice(-10);
  }
  saveTextSettings(textId, settings);
}

/** Get averaged intervals across all training runs for this text */
export function getAveragedTimings(textId: string): number[] | null {
  const settings = getTextSettings(textId);
  if (settings.trainingRuns.length === 0) return null;

  // Find the max bunch count across runs
  const maxBunches = Math.max(...settings.trainingRuns.map(r => r.intervals.length));
  if (maxBunches === 0) return null;

  const averaged: number[] = [];
  for (let i = 0; i < maxBunches; i++) {
    let sum = 0;
    let count = 0;
    for (const run of settings.trainingRuns) {
      if (i < run.intervals.length) {
        sum += run.intervals[i];
        count++;
      }
    }
    averaged.push(count > 0 ? Math.round(sum / count) : 1200);
  }
  return averaged;
}

export function clearTrainingData(textId: string) {
  const settings = getTextSettings(textId);
  settings.trainingRuns = [];
  saveTextSettings(textId, settings);
}
