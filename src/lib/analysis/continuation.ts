import { Chess } from "chess.js";
import type { Color, Square } from "chess.js";
import type { EngineClient } from "../engine/engine-client.ts";
import { scoreToCentipawns } from "../engine/uci.ts";

export interface ContinuationOptions {
  /** Total plies of the continuation, including the branch move. */
  plies: number;
  /** How many mover-to-move positions to sample from the continuation. */
  maxSamples: number;
  /** Self-play search budget. */
  depth: number;
  movetimeMs: number;
}

/** One move of a continuation line, with what the UI needs to show it. */
export interface LineStep {
  san: string;
  /** FEN after this move. */
  fenAfter: string;
  /** Mover-perspective centipawns before this move, for mover-to-move plies. */
  evalCp: number | null;
}

export interface ContinuationResult {
  /** Sampled mover-to-move positions (the motif inference pool). */
  pool: string[];
  /** The full self-play line, starting with the branch move. */
  line: LineStep[];
}

export const DEFAULT_CONTINUATION: ContinuationOptions = {
  plies: 10,
  maxSamples: 4,
  depth: 10,
  movetimeMs: 300,
};

function uciToMove(uci: string): { from: Square; to: Square; promotion?: string } {
  const move: { from: Square; to: Square; promotion?: string } = {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
  };
  if (uci.length > 4 && uci[4] !== undefined) move.promotion = uci[4];
  return move;
}

/** Pick up to `count` entries, evenly spaced across `list`. */
export function evenlySpaced<T>(list: T[], count: number): T[] {
  if (list.length <= count) return [...list];
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const item = list[Math.round((i * (list.length - 1)) / (count - 1))];
    if (item !== undefined && !out.includes(item)) out.push(item);
  }
  return out;
}

/**
 * Generates one continuation pool (BinProp support pool): starting from
 * `startFen` (the analyzed player to move), play `firstMoveUci`, then let the
 * engine play both sides for the remaining plies. Collects every position
 * where the analyzed player is to move (after the branch move) and returns an
 * evenly spaced sample, plus the played line for display.
 */
export async function generatePool(
  engine: EngineClient,
  startFen: string,
  firstMoveUci: string | null,
  moverColor: Color,
  options?: Partial<ContinuationOptions>,
): Promise<ContinuationResult> {
  const opts = { ...DEFAULT_CONTINUATION, ...options };
  const board = new Chess(startFen);
  const candidates: string[] = [];
  const line: LineStep[] = [];

  let played = 0;
  const play = (uci: string, evalCp: number | null): boolean => {
    try {
      const move = board.move(uciToMove(uci));
      played += 1;
      line.push({ san: move.san, fenAfter: board.fen(), evalCp });
      return true;
    } catch {
      return false;
    }
  };

  if (firstMoveUci) {
    if (!play(firstMoveUci, null)) {
      return { pool: [], line };
    }
  } else {
    const best = await engine.evaluate({ fen: startFen, ...opts, multipv: 1 });
    if (!best.bestmove || !play(best.bestmove, null)) {
      return { pool: [], line };
    }
  }

  while (played < opts.plies && !board.isGameOver()) {
    const fen = board.fen();
    const step = await engine.evaluate({ fen, ...opts, multipv: 1 });
    if (!step.bestmove) break;
    const evalCp = step.lines[0] ? scoreToCentipawns(step.lines[0]) : null;
    if (!play(step.bestmove, evalCp)) break;
    if (!board.isGameOver() && board.turn() === moverColor && played < opts.plies) {
      candidates.push(board.fen());
    }
  }

  return { pool: evenlySpaced(candidates, opts.maxSamples), line };
}