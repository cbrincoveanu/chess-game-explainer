import { Chess } from "chess.js";

/**
 * Converts a UCI move (e.g. "g1f3", "e7e8q") to SAN ("Nf3", "e8=Q+") in the
 * context of the given FEN (the position before the move). Returns the raw UCI
 * when the move is not legal in that position.
 */
export function sanOf(fen: string, uci: string | null): string {
  if (!uci) return "—";
  const board = new Chess(fen);
  try {
    const step: { from: string; to: string; promotion?: string } = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
    };
    if (uci.length > 4 && uci[4] !== undefined) step.promotion = uci[4];
    const move = board.move(step);
    return move.san;
  } catch {
    return uci;
  }
}
