export interface EngineScore {
  /** Centipawns from the side-to-move's perspective; null for mate scores. */
  scoreCp: number | null;
  /** Mate distance in moves: positive = side to move mates, negative = gets mated. */
  mate: number | null;
}

export interface InfoLine extends EngineScore {
  multipv: number;
  depth: number;
  pv: string[];
}

export const MATE_CP = 100_000;

export function scoreToCentipawns(score: EngineScore): number {
  if (score.mate !== null) {
    const sign = score.mate > 0 ? 1 : -1;
    return sign * (MATE_CP - Math.abs(score.mate));
  }
  return score.scoreCp ?? 0;
}

/**
 * Parses a Stockfish "info" line with a score and a principal variation,
 * e.g. "info depth 12 seldepth 15 multipv 1 score cp 34 nodes ... pv e2e4 e7e5".
 * Returns null for lines without both a score and a pv (banner, currmove, ...).
 */
export function parseInfoLine(line: string): InfoLine | null {
  if (!line.startsWith("info ")) return null;
  const scoreMatch = / score (cp|mate) (-?\d+)/.exec(line);
  const pvIndex = line.indexOf(" pv ");
  if (!scoreMatch || pvIndex === -1) return null;
  const depthMatch = / depth (\d+)/.exec(line);
  const multipvMatch = / multipv (\d+)/.exec(line);
  const pv = line
    .slice(pvIndex + 4)
    .trim()
    .split(/\s+/);
  if (pv.length === 0 || pv[0] === "") return null;
  return {
    multipv: multipvMatch ? Number(multipvMatch[1]) : 1,
    depth: depthMatch ? Number(depthMatch[1]) : 0,
    scoreCp: scoreMatch[1] === "cp" ? Number(scoreMatch[2]) : null,
    mate: scoreMatch[1] === "mate" ? Number(scoreMatch[2]) : null,
    pv,
  };
}

export function parseBestmove(
  line: string,
): { bestmove: string; ponder: string | null } | null {
  if (!line.startsWith("bestmove")) return null;
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2 || parts[1] === "(none)") return null;
  const ponder = parts[2] === "ponder" ? (parts[3] ?? null) : null;
  return { bestmove: parts[1]!, ponder };
}
