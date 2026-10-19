/**
 * Win probability (0-100) from a centipawn evaluation, using the logistic
 * model popularized by Lichess: 50 + 50 * (2 / (1 + e^(-0.00368208 cp)) - 1).
 * Mate evaluations (±MATE_CP) map to ~100 / ~0.
 */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
