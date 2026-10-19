import { Chess } from "chess.js";
import type { Color, Square } from "chess.js";
import type { EngineClient } from "../engine/engine-client.ts";
import { scoreToCentipawns } from "../engine/uci.ts";
import { withTurn } from "../motif/mirror.ts";
import { winPercent } from "./win-percent.ts";
import { classifyMove, DEFAULT_THRESHOLDS } from "./classify.ts";
import type { MoveClass } from "./classify.ts";
import { generatePool, type ContinuationOptions, type LineStep } from "./continuation.ts";
import { describeMoveEffects } from "./move-effects.ts";
import { comparisonSetsV2 } from "./aggregate.ts";
import { inferMotifs } from "../motif/inference.ts";
import type { Motif } from "../motif/types.ts";
import type { SelectedMotif } from "../motif/inference.ts";
import type { ComparisonTarget } from "./types.ts";
import { sanOf } from "../chess/uci-san.ts";

export interface JitPlyInfo {
  san: string;
  uci: string;
  color: Color;
  beforeFen: string;
  afterFen: string;
  bestMoveUci: string | null;
  secondMoveUci: string | null;
  bestCp: number | null;
  playedCp: number | null;
  winBefore: number | null;
  winAfter: number | null;
  drop: number | null;
  marginOverSecond: number | null;
  evalDepth: number | null;
  classification: MoveClass;
  inCheck: boolean;
}

export interface JitExplanation {
  info: JitPlyInfo;
  /** Deterministic move-effect facts (what the move does, no engine). */
  moveEffects: string[];
  /**
   * Mating threat created by this move: if the mover could move again
   * immediately, they would have mate in `mateIn` (with `san`).
   * Null when no immediate mating threat exists.
   */
  mateThreat: { san: string; mateIn: number } | null;
  /**
   * The opponent's punishing reply to a bad played move (its best answer),
   * with whether it captures material or mates, and the move-effect facts of
   * the reply itself (why the refutation hurts: forks, pins, discovered
   * attacks). Null for good moves.
   */
  refutation:
    | { san: string; uci: string; capture: boolean; mate: boolean; effects: string[] }
    | null;
  target: ComparisonTarget;
  positiveLine: LineStep[];
  positivePooledSan: string[];
  negativeLine: LineStep[];
  negativePooledSan: string[];
  selected: SelectedMotif[];
  usedFallback: boolean;
  positiveCount: number;
  negativeCount: number;
}

export interface ExplainOptions {
  motifs: Motif[];
  continuation?: Partial<ContinuationOptions>;
  /** Search depth for the multipv evaluation of the position. */
  evalDepth: number;
  shouldStop?: () => boolean;
  /** Reuse an existing multipv evaluation of `beforeFen` (e.g. the cached
   * JIT eval) so the explanation and the eval readout never disagree. */
  evalResult?: {
    lines: { pv: string[]; scoreCp: number | null; mate: number | null; depth: number }[];
    bestmove: string | null;
  } | null;
}

/**
 * Just-in-time explanation of the move that led from `beforeFen` to
 * `afterFen` (`uci`): evaluates the position, classifies the move (win%
 * drop, decided-position and forced-check suppression), and — unless
 * cancelled — builds the BinProp-style motif comparison between the engine's
 * pooled alternatives and the played move.
 */
export async function explainMove(
  engine: EngineClient,
  beforeFen: string,
  uci: string,
  san: string,
  color: Color,
  options: ExplainOptions,
): Promise<JitExplanation | null> {
  if (options.shouldStop?.()) return null;

  const board = new Chess(beforeFen);
  const inCheck = board.isCheck();
  const playedBoard = new Chess(beforeFen);
  try {
    const step: { from: Square; to: Square; promotion?: string } = {
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
    };
    if (uci.length > 4 && uci[4] !== undefined) step.promotion = uci[4];
    playedBoard.move(step);
  } catch {
    return null;
  }
  const afterFen = playedBoard.fen();

  let evalResult = options.evalResult ?? null;
  if (!evalResult || evalResult.lines.length < 2) {
    evalResult = await engine.evaluate({
      fen: beforeFen,
      depth: options.evalDepth,
      movetimeMs: 1500,
      multipv: 4,
    });
  }
  if (options.shouldStop?.()) return null;

  const best = evalResult.lines[0] ?? null;
  const second = evalResult.lines[1] ?? null;
  if (!best) return null;
  const bestCp = scoreToCentipawns(best);
  const playedIsBest = evalResult.bestmove !== null && uci === evalResult.bestmove;

  let playedCp: number | null;
  let childEval: Awaited<ReturnType<EngineClient["evaluate"]>> | null = null;
  if (playedIsBest) {
    playedCp = bestCp;
  } else if (playedBoard.isCheckmate()) {
    playedCp = Math.max(bestCp, 100_000);
  } else if (playedBoard.isGameOver()) {
    playedCp = 0;
  } else {
    childEval = await engine.evaluate({ fen: afterFen, depth: options.evalDepth, movetimeMs: 1500, multipv: 1 });
    const childLine = childEval.lines[0];
    playedCp = childLine ? -scoreToCentipawns(childLine) : null;
  }
  if (options.shouldStop?.()) return null;

  const winBefore = winPercent(bestCp);
  const winAfter = playedCp === null ? null : winPercent(playedCp);
  const drop = winAfter === null ? null : Math.max(0, winBefore - winAfter);
  const marginOverSecond =
    second !== null
      ? winPercent(scoreToCentipawns(best)) - winPercent(scoreToCentipawns(second))
      : null;

  const info: JitPlyInfo = {
    san,
    uci,
    color,
    beforeFen,
    afterFen,
    bestMoveUci: evalResult.bestmove,
    secondMoveUci: second?.pv[0] ?? null,
    bestCp,
    playedCp,
    winBefore,
    winAfter,
    drop,
    marginOverSecond,
    evalDepth: best.depth,
    classification: classifyMove({
      playedIsBest,
      drop: drop ?? 0,
      marginOverSecond,
      winBefore,
      inCheck,
      thresholds: DEFAULT_THRESHOLDS,
    }),
    inCheck,
  };

  const sets = await comparisonSetsV2(
    info.classification,
    evalResult,
    beforeFen,
    uci,
    engine,
    color,
  );
  if (options.shouldStop?.()) return null;

  const positivePools = await Promise.all(
    sets.positives.map((altUci) =>
      generatePool(
        engine,
        beforeFen,
        altUci,
        color,
        { ...options.continuation, depth: Math.min(options.evalDepth, 12) },
      ),
    ),
  );
  if (options.shouldStop?.()) return null;
  const negativePools = await Promise.all(
    sets.negatives.map((altUci) =>
      generatePool(
        engine,
        beforeFen,
        altUci,
        color,
        { ...options.continuation, depth: Math.min(options.evalDepth, 12) },
      ),
    ),
  );
  if (options.shouldStop?.()) return null;

  const result = inferMotifs(
    options.motifs,
    positivePools.flatMap((r) => r.pool).map((fen) => ({ fen, color })),
    negativePools.flatMap((r) => r.pool).map((fen) => ({ fen, color })),
  );

  const branchSan = async (altUci: string): Promise<string> =>
    altUci === uci ? san : sanOf(beforeFen, altUci);

  // Mating threat: flip the turn back to the mover ("as if they could move
  // again") and ask the engine for mate in 1. Skipped when the opponent is
  // in check (the flipped position would be illegal) or on cancellation.
  let mateThreat: { san: string; mateIn: number } | null = null;
  const afterBoard = new Chess(afterFen);
  if (!afterBoard.isCheck() && !options.shouldStop?.()) {
    const threatFen = withTurn(afterFen, color);
    const threatEval = await engine.evaluate({
      fen: threatFen,
      depth: 10,
      movetimeMs: 400,
      multipv: 1,
    });
    if (!options.shouldStop?.()) {
      const mate = threatEval.lines[0]?.mate;
      if (mate !== null && mate !== undefined && mate > 0 && threatEval.bestmove) {
        mateThreat = { san: sanOf(threatFen, threatEval.bestmove), mateIn: mate };
      }
    }
  }

  // Refutation of a bad played move: the opponent's best answer (reusing the
  // child evaluation of the position after the played move). Reported when
  // the move loses real win probability, and only when it captures material
  // or mates (quiet refutations are not explained away).
  let refutation:
    | { san: string; uci: string; capture: boolean; mate: boolean; effects: string[] }
    | null = null;
  if (
    childEval?.bestmove &&
    info.drop !== null &&
    info.drop >= 8 &&
    (info.classification === "inaccuracy" ||
      info.classification === "mistake" ||
      info.classification === "blunder")
  ) {
    const reply = new Chess(afterFen);
    try {
      const replyMove = reply.move({
        from: childEval.bestmove.slice(0, 2) as Square,
        to: childEval.bestmove.slice(2, 4) as Square,
        ...(childEval.bestmove.length > 4
          ? { promotion: childEval.bestmove[4]! }
          : {}),
      } as never);
      refutation = {
        san: replyMove.san,
        uci: replyMove.lan,
        capture: replyMove.captured !== undefined,
        mate: replyMove.san.includes("#"),
        effects: reply.isCheckmate()
          ? []
          : describeMoveEffects(afterFen, replyMove.lan),
      };
    } catch {
      refutation = null;
    }
  }

  return {
    info,
    moveEffects: describeMoveEffects(beforeFen, uci),
    mateThreat,
    refutation,
    target: sets.target,
    positiveLine: positivePools[0]?.line ?? [],
    positivePooledSan: await Promise.all(sets.positives.slice(1).map(branchSan)),
    negativeLine: negativePools[0]?.line ?? [],
    negativePooledSan: await Promise.all(sets.negatives.slice(1).map(branchSan)),
    selected: result.selected,
    usedFallback: result.usedFallback,
    positiveCount: positivePools.reduce((n, r) => n + r.pool.length, 0),
    negativeCount: negativePools.reduce((n, r) => n + r.pool.length, 0),
  };
}