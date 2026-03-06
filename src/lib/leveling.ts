export function getLevelInfo(xpTotal: number) {
  const base = 250;
  const growth = 1.18;
  const maxLevel = 200;

  let level = 1;
  let remaining = Math.max(0, Math.floor(xpTotal || 0));

  let xpToNext = Math.round(base * Math.pow(growth, level - 1));
  while (remaining >= xpToNext && level < maxLevel) {
    remaining -= xpToNext;
    level += 1;
    xpToNext = Math.round(base * Math.pow(growth, level - 1));
  }

  const progress = xpToNext > 0 ? remaining / xpToNext : 0;

  return {
    level,
    xpInLevel: remaining,
    xpToNext,
    progress,
    progressPercent: Math.round(progress * 100),
  };
}
