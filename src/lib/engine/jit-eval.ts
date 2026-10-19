import type { EngineClient } from "./engine-client.ts";
import { parseInfoLine, parseBestmove, scoreToCentipawns } from "./uci.ts";

export interface JitEval {
  depth: number;
  /** Mover-perspective centipawns (null for mate, see mateIn). */
  cp: number | null;
  mateIn: number | null;
  bestMoveUci: string | null;
  /** Multipv lines for the best/second comparison. */
  bestLine: { uci: string; cp: number; mate: number | null }[] | null;
  fen: string;
  /** The raw engine multipv evaluation of this position, for reuse by the
   * explanation pipeline (so both readouts agree on the engine's opinion). */
  evalResult: {
    lines: { pv: string[]; scoreCp: number | null; mate: number | null; depth: number }[];
    bestmove: string | null;
  };
}

export interface JitEvalOptions {
  /** Emitted after each depth iteration completes. */
  onIteration?: (result: JitEval) => void;
  /** Return true to abort before the next iteration. */
  shouldStop?: () => boolean;
  /** Depth ladder to climb. */
  depths?: number[];
  /** Per-search movetime cap so a stuck iteration cannot block the UI long. */
  movetimeMs?: number;
}

export const DEFAULT_JIT_DEPTHS = [8, 12, 16];

/**
 * Just-in-time evaluation with progressive deepening: climbs a depth ladder
 * (default 8 → 12 → 16), emitting a JitEval after each rung so the UI can
 * refine eval/best-move live. Stops early when `shouldStop` flips (e.g., the
 * user navigated elsewhere); the engine gets `stop` so the ladder aborts.
 */
export async function evaluateJit(
  engine: EngineClient,
  fen: string,
  options?: JitEvalOptions,
): Promise<JitEval | null> {
  const depths = options?.depths ?? DEFAULT_JIT_DEPTHS;
  const movetimeMs = options?.movetimeMs ?? 1500;
  let latest: JitEval | null = null;

  for (const depth of depths) {
    if (options?.shouldStop?.()) break;
    const result = await engine.evaluate({
      fen,
      depth,
      movetimeMs,
      multipv: 4,
    });
    if (options?.shouldStop?.()) break;
    const best = result.lines[0];
    const second = result.lines[1];
    if (!best) break;
    latest = {
      depth: best.depth,
      cp: scoreToCentipawns(best),
      mateIn: best.mate,
      bestMoveUci: result.bestmove,
      bestLine:
        best && second
          ? [
              { uci: best.pv[0]!, cp: scoreToCentipawns(best), mate: best.mate },
              { uci: second.pv[0]!, cp: scoreToCentipawns(second), mate: second.mate },
            ]
          : null,
      fen,
      evalResult: {
        lines: result.lines.map((line) => ({
          pv: line.pv,
          scoreCp: line.scoreCp,
          mate: line.mate,
          depth: line.depth,
        })),
        bestmove: result.bestmove,
      },
    };
    options?.onIteration?.(latest);
  }
  return latest;
}

export { parseInfoLine, parseBestmove };