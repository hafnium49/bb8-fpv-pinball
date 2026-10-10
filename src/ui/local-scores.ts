export interface LocalScore { score: number; at: number; circuit: boolean; course?: 'reference' }

/** Storage is optional and untrusted; a malformed history must never stop play. */
export function readScores(raw: string | null): LocalScore[] {
  try {
    const value = JSON.parse(raw || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is LocalScore => v && Number.isSafeInteger(v.score) && v.score >= 0
      && Number.isSafeInteger(v.at) && v.at >= 0 && v.at <= 8640000000000000 && typeof v.circuit === 'boolean').slice(-50);
  } catch { return []; }
}

export function saveRun(history: LocalScore[], score: number, at: number, circuit: boolean, course?: 'reference') {
  if (!Number.isSafeInteger(score) || score < 0 || !Number.isSafeInteger(at) || at < 0 || at > 8640000000000000) return history;
  return [...history, { score, at, circuit, ...(course ? { course } : {}) }].slice(-50);
}

export function rankedScores(history: LocalScore[], legacyBest = 0) {
  const entries = [...history];
  if (Number.isSafeInteger(legacyBest) && legacyBest > Math.max(0, ...entries.map(v => v.score)))
    entries.push({ score: legacyBest, at: 0, circuit: false });
  return entries.sort((a, b) => b.score - a.score || b.at - a.at).slice(0, 10);
}
