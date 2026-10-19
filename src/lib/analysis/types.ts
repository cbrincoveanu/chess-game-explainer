import type { Color } from "chess.js";
import type { InfoLine } from "../engine/uci.ts";
import type { MoveClass } from "./classify.ts";
import type { SelectedMotif } from "../motif/inference.ts";
import type { LineStep } from "./continuation.ts";

export type { LineStep };

/** What the negative pool of an explanation was compared against. */
export type ComparisonTarget = "played" | "second-best";

/** A analyzed move, as consumed by the explanation renderer. */
export interface PlyAnalysis {
  /** 1-based ply index. */
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  uci: string;
  beforeFen: string;
  afterFen: string;
  bestMoveUci: string | null;
  bestLine: InfoLine | null;
  secondLine: InfoLine | null;
  /** Mover-perspective centipawns of the engine's best move. */
  bestCp: number | null;
  /** Mover-perspective centipawns after the played move. */
  playedCp: number | null;
  /** Mover-perspective win% before the move. */
  winBefore: number | null;
  /** Mover-perspective win% after the played move. */
  winAfter: number | null;
  /** Win% points lost by the played move (>= 0). */
  drop: number | null;
  /** Win% points by which the best move beats the engine's second line. */
  marginOverSecond: number | null;
  /** Search depth reached by the engine for this move's evaluation. */
  evalDepth: number | null;
  classification: MoveClass;
  ms: number;
}

export interface Explanation {
  ply: number;
  positiveCount: number;
  negativeCount: number;
  /** What the negative pool was compared against. */
  target: ComparisonTarget;
  /** The engine's primary line, starting with its preferred move. */
  positiveLine: LineStep[];
  /** SANs of additional alternatives pooled into the positive side, if any. */
  positivePooledSan: string[];
  /** The primary line after the played (or first alternative) move. */
  negativeLine: LineStep[];
  /** SANs of additional alternatives pooled into the negative side, if any. */
  negativePooledSan: string[];
  selected: SelectedMotif[];
  usedFallback: boolean;
}

export interface AnalyzedGame {
  headers: Record<string, string>;
  plies: PlyAnalysis[];
  explanations: Map<number, Explanation>;
  stoppedEarly: boolean;
  ms: number;
}
