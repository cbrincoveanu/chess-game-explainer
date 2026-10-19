export type MoveClass =
  | "best"
  | "great"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export interface ClassificationThresholds {
  /** Win% drop below which a non-best move is "excellent". */
  excellentMax: number;
  /** Drop below "good". */
  goodMax: number;
  /** Drop below "inaccuracy". */
  inaccuracyMax: number;
  /** Drop below "mistake". Anything at or above is a "blunder". */
  mistakeMax: number;
  /** When the played move is best: how much better than the second-best line
   * (in win% points) a move must be to count as a "great" (only) move. */
  greatMargin: number;
  /** In positions this decided (mover win% at or beyond either threshold),
   * "great" is suppressed: big margins are structural, not brilliance. */
  decidedMin: number;
  decidedMax: number;
}

/** Chess.com-style defaults; tuned against example games. */
export const DEFAULT_THRESHOLDS: ClassificationThresholds = {
  excellentMax: 1,
  goodMax: 5,
  inaccuracyMax: 10,
  mistakeMax: 20,
  greatMargin: 10,
  decidedMin: 10,
  decidedMax: 90,
};

export function classifyMove(input: {
  playedIsBest: boolean;
  /** Win% points lost by the played move (mover's perspective). */
  drop: number;
  /** Win% points by which the engine's best beats its second line, if known. */
  marginOverSecond: number | null;
  /** Mover-perspective win% before the move, if known. */
  winBefore: number | null;
  /** Whether the mover was in check before playing this move. */
  inCheck: boolean;
  thresholds?: ClassificationThresholds;
}): MoveClass {
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;
  if (input.playedIsBest) {
    const decided =
      input.winBefore !== null &&
      (input.winBefore <= t.decidedMin || input.winBefore >= t.decidedMax);
    if (
      input.marginOverSecond !== null &&
      input.marginOverSecond >= t.greatMargin &&
      !decided &&
      !input.inCheck
    ) {
      return "great";
    }
    return "best";
  }
  const drop = input.drop;
  if (drop < t.excellentMax) return "excellent";
  if (drop < t.goodMax) return "good";
  if (drop < t.inaccuracyMax) return "inaccuracy";
  if (drop < t.mistakeMax) return "mistake";
  return "blunder";
}

/** Moves that get the full motif treatment. */
export function isBadMove(cls: MoveClass): boolean {
  return cls === "inaccuracy" || cls === "mistake" || cls === "blunder";
}
