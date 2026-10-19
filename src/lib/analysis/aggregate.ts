import { Chess } from "chess.js";
import type { EngineClient } from "../engine/engine-client.ts";
import { scoreToCentipawns } from "../engine/uci.ts";
import type { MoveClass } from "./classify.ts";
import type { ComparisonTarget } from "./types.ts";

/** A multipv evaluation, structural (works with cached JIT evals too). */
export interface EvalShape {
  lines: { pv: string[]; scoreCp: number | null; mate: number | null }[];
  bestmove: string | null;
}

/**
 * Quality-based comparison pools, extending BinProp's single-alternative
 * comparison:
 *
 * - Bad moves (inaccuracy/mistake/blunder): positives = continuations pooled
 *   over the engine's *good* alternatives (within GOOD_CP of best), negatives =
 *   the played move. Motifs then describe what good moves share.
 * - Good moves (best/great): positives = continuations pooled over {played +
 *   good alternatives} ("what good moves share"), negatives = continuations of
 *   *mediocre* moves — clearly worse than best (>= MEDIOCRE_MIN_CP behind) but
 *   not catastrophic (<= MEDIOCRE_MAX_CP, so no random queen sacrifices) —
 *   sourced from the multipv tail and engine-verified random legal moves.
 */
export const GOOD_CP = 50;
export const MEDIOCRE_MIN_CP = 40;
export const MEDIOCRE_MAX_CP = 250;
export const MAX_POOL_MOVES = 2;
export const RANDOM_SAMPLE_SIZE = 4;

export interface ComparisonSets {
  /** Branch moves for the positive pool (mover-perspective advantages). */
  positives: string[];
  /** Branch moves for the negative pool. */
  negatives: string[];
  /** What the negative pool represents. */
  target: ComparisonTarget;
}

function isBad(cls: MoveClass): boolean {
  return cls === "inaccuracy" || cls === "mistake" || cls === "blunder";
}

function cpOf(line: { scoreCp: number | null; mate: number | null }): number {
  return scoreToCentipawns(line);
}

/** Alternatives within GOOD_CP of the best (mate lines are "infinitely good"). */
export function goodAlternatives(evalResult: EvalShape, playedUci: string): string[] {
  const best = evalResult.lines[0];
  if (!best) return [];
  const bestCp = cpOf(best);
  const out: string[] = [];
  for (const line of evalResult.lines) {
    const uci = line.pv[0];
    if (!uci || uci === playedUci || out.includes(uci)) continue;
    if (Math.abs(bestCp - cpOf(line)) <= GOOD_CP) out.push(uci);
  }
  return out;
}

/**
 * Mediocre moves: clearly worse than best but not catastrophic. Uses the
 * multipv tail first; if that yields nothing in the band (e.g. after 1.e4,
 * where all top moves are good), samples random legal moves and verifies them
 * with brief evaluations, keeping sampling until the band is filled or the
 * candidate budget is spent. Excludes the played move and all good alternatives.
 */
export async function mediocreAlternatives(
  engine: EngineClient,
  evalResult: EvalShape,
  beforeFen: string,
  playedUci: string,
  good: string[],
  movetimeMs = 250,
  moverColor?: "w" | "b",
): Promise<string[]> {
  void moverColor;
  const best = evalResult.lines[0];
  if (!best) return [];
  // Eval lines are side-to-move relative and the mover is the side to move,
  // so line centipawns are already mover-perspective. For the sampled
  // replies below, the opponent is to move, so we negate to get the mover's.
  const bestMoverCp = cpOf(best);
  const excluded = new Set([playedUci, ...good]);

  // How much worse than the best move is this move (mover-perspective)?
  const lossBehindBest = (moverCp: number): number => bestMoverCp - moverCp;
  const inBand = (uci: string, moverCp: number): boolean => {
    const loss = lossBehindBest(moverCp);
    return !excluded.has(uci) && loss >= MEDIOCRE_MIN_CP && loss <= MEDIOCRE_MAX_CP;
  };

  // 1) Multipv tail.
  const out: string[] = [];
  for (const line of evalResult.lines) {
    const uci = line.pv[0];
    if (!uci) continue;
    if (inBand(uci, cpOf(line))) out.push(uci);
    if (out.length >= MAX_POOL_MOVES) return out;
  }

  // 2) Sampled random legal moves, engine-verified; keep sampling until the
  //    band is filled or the candidate budget is spent. Prefer the least-bad
  //    in-band moves (closest to good), which contrasts most fairly.
  const board = new Chess(beforeFen);
  const legal = board
    .moves({ verbose: true })
    .map((m) => m.lan)
    .filter((uci) => !excluded.has(uci));
  for (let i = legal.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [legal[i], legal[j]] = [legal[j]!, legal[i]!];
  }

  const rated: Array<{ uci: string; loss: number }> = [];
  const budget = Math.max(RANDOM_SAMPLE_SIZE, 8);
  for (const uci of legal.slice(0, budget)) {
    const child = new Chess(beforeFen);
    try {
      const step: { from: string; to: string; promotion?: string } = {
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
      };
      if (uci.length > 4 && uci[4] !== undefined) step.promotion = uci[4];
      child.move(step as never);
    } catch {
      continue;
    }
    if (child.isGameOver()) continue;
    const reply = await engine.evaluate({ fen: child.fen(), depth: 10, movetimeMs, multipv: 1 });
    const replyLine = reply.lines[0];
    if (!replyLine) continue;
    // Opponent-to-move relative -> mover-relative:
    const moverCp = -scoreToCentipawns(replyLine);
    const loss = lossBehindBest(moverCp);
    if (loss >= MEDIOCRE_MIN_CP && loss <= MEDIOCRE_MAX_CP) {
      rated.push({ uci, loss });
    }
  }
  rated.sort((a, b) => a.loss - b.loss);
  for (const { uci } of rated) {
    if (out.length >= MAX_POOL_MOVES) break;
    out.push(uci);
  }
  return out;
}

/**
 * Builds the comparison sets for one explained move. `engine` is only needed
 * for the mediocre sampling on good moves; pass null to skip (falls back to
 * multipv tail only).
 */
export async function comparisonSetsV2(
  classification: MoveClass,
  evalResult: EvalShape,
  beforeFen: string,
  playedUci: string,
  engine?: EngineClient | null,
  moverColor?: "w" | "b",
): Promise<ComparisonSets> {
  const good = goodAlternatives(evalResult, playedUci);

  if (isBad(classification)) {
    const positives = [playedUci === evalResult.lines[0]?.pv[0] ? playedUci : evalResult.lines[0]?.pv[0] ?? playedUci]
      .concat(good)
      .filter((uci, i, arr) => uci && arr.indexOf(uci) === i)
      .slice(0, MAX_POOL_MOVES + 1);
    return { positives, negatives: [playedUci], target: "played" };
  }

  // Good played move: what do good moves share, vs. mediocre ones?
  const positives = [playedUci, ...good]
    .filter((uci, i, arr) => uci && arr.indexOf(uci) === i)
    .slice(0, MAX_POOL_MOVES + 1);
  let negatives: string[] = [];
  if (engine) {
    negatives = await mediocreAlternatives(engine, evalResult, beforeFen, playedUci, good, 250, moverColor);
  }
  return { positives, negatives, target: "second-best" };
}