export function calculateWinnings(stake: number, isCorrect: boolean, streak: number): number {
  if (!isCorrect) return -stake;
  
  // Base 2x return, streak bonus adds 0.1x per day (max 5x at 30-day streak)
  const streakBonus = Math.min(streak * 0.1, 3); // Cap at +300%
  const multiplier = 2 + streakBonus;
  return Math.floor(stake * multiplier);
}

export function canAffordStake(userKarma: number, stake: number): boolean {
  return userKarma >= stake && stake >= 100;
}

export function getStakeOptions(userKarma: number): number[] {
  const options = [100, 500, 1000];
  if (userKarma > 1000) options.push(2500);
  if (userKarma > 2500) options.push(5000);
  return options.filter(o => o <= userKarma);
}
