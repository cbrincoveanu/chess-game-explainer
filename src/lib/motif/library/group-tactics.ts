import { Chess } from "chess.js";
import type { Color, PieceSymbol, Square } from "chess.js";
import { defineMotif } from "../types.ts";
import {
  attacksFrom,
  countPieces,
  fileOf,
  other,
  piecesOf,
  rankOf,
} from "../helpers.ts";

const CENTER: Square[] = ["d4", "e4", "d5", "e5"];

// Translation of BinProp "piece_fork_potential" (chess/qwen3.5-397b-a17b).
const pieceForkPotential = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  for (const type of ["p", "n", "b", "r", "q"] as const) {
    for (const sq of piecesOf(board, type, color)) {
      let count = 0;
      for (const target of attacksFrom(board, sq)) {
        const piece = board.get(target);
        if (piece && piece.color === opp) count += 1;
      }
      if (count >= 2) return true;
    }
  }
  return false;
};

// Translation of BinProp "check based double attack" (chess/kimi-k3).
const CHECK_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 300,
  b: 300,
  r: 500,
  q: 900,
  k: 0,
};

const checkBasedDoubleAttack = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  let own = 0;
  let their = 0;
  for (const type of ["p", "n", "b", "r", "q", "k"] as const) {
    own += CHECK_VALUES[type] * countPieces(board, type, color);
    their += CHECK_VALUES[type] * countPieces(board, type, opp);
  }
  if (own - their > 200) return false;

  for (const mv of board.moves({ verbose: true })) {
    const step: { from: string; to: string; promotion?: string } = {
      from: mv.from,
      to: mv.to,
    };
    if (mv.promotion) step.promotion = mv.promotion;
    board.move(step);
    try {
      if (!board.isCheck()) continue;
      if (board.isCheckmate()) return true;
      let hit = false;
      for (const type of ["n", "b", "r", "q"] as const) {
        for (const sq of piecesOf(board, type, opp)) {
          const attackers = board.attackers(sq, color);
          if (attackers.length > board.attackers(sq, opp).length) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (hit) return true;
    } finally {
      board.undo();
    }
  }
  return false;
};

// Translation of BinProp "opponent pieces cornered and hanging"
// (chess/claude-opus-5).
const TROUBLE_VALUES: Record<PieceSymbol, number> = {
  p: 1.0,
  n: 3.0,
  b: 3.0,
  r: 5.0,
  q: 9.0,
  k: 20.0,
};

const TROUBLE_WEIGHTS: Partial<Record<PieceSymbol, number>> = {
  n: 1.0,
  b: 1.0,
  r: 1.2,
  q: 1.5,
};

function mat(board: Chess, c: Color): number {
  return (
    piecesOf(board, "p", c).length +
    3 * piecesOf(board, "n", c).length +
    3 * piecesOf(board, "b", c).length +
    5 * piecesOf(board, "r", c).length +
    9 * piecesOf(board, "q", c).length
  );
}

function cheapestAttacker(board: Chess, c: Color, sq: Square): number {
  let best = 99.0;
  for (const x of board.attackers(sq, c)) {
    const p = board.get(x);
    if (p && TROUBLE_VALUES[p.type] < best) best = TROUBLE_VALUES[p.type];
  }
  return best;
}

function freeSquares(
  board: Chess,
  sq: Square,
  defenderColor: Color,
  attackerColor: Color,
  value: number,
): number {
  let n = 0;
  for (const t of attacksFrom(board, sq)) {
    const occ = board.get(t);
    if (occ && occ.color === defenderColor) continue;
    const gain = occ ? TROUBLE_VALUES[occ.type] : 0.0;
    const at = board.attackers(t, attackerColor);
    if (at.length === 0 || gain >= value - 0.4) {
      n += 1;
    } else {
      const c = cheapestAttacker(board, attackerColor, t);
      if (c >= value - 0.4 && board.attackers(t, defenderColor).length > 0) {
        n += 1;
      }
    }
    if (n >= 2) return 2;
  }
  return n;
}

function troubleScore(board: Chess, attackerColor: Color, defenderColor: Color): number {
  let s = 0.0;
  for (const pt of ["n", "b", "r", "q"] as const) {
    const v = TROUBLE_VALUES[pt];
    const w = TROUBLE_WEIGHTS[pt]!;
    for (const sq of piecesOf(board, pt, defenderColor)) {
      const f = freeSquares(board, sq, defenderColor, attackerColor, v);
      if (f < 2) s += w * (2 - f);
      const at = board.attackers(sq, attackerColor);
      if (at.length > 0) {
        const df = board.attackers(sq, defenderColor);
        if (df.length === 0 || cheapestAttacker(board, attackerColor, sq) + 0.5 < v) {
          s += 1.2;
        } else if (at.length > df.length) {
          s += 0.5;
        }
      }
    }
  }
  return s;
}

const opponentPiecesCorneredAndHanging = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  if (!piecesOf(board, "k", color)[0] || !piecesOf(board, "k", opp)[0]) return false;
  let pieceCount = 0;
  for (const type of ["p", "n", "b", "r", "q", "k"] as const) {
    pieceCount += piecesOf(board, type, color).length + piecesOf(board, type, opp).length;
  }
  if (pieceCount < 10) return false;
  if (mat(board, color) - mat(board, opp) > 1) return false;
  const ours = troubleScore(board, color, opp);
  const theirs = troubleScore(board, opp, color);
  return ours >= 2.0 && ours - theirs >= 1.5;
};

// Translation of BinProp "queenside_pawn_majority_advantage"
// (chess/deepseek-v4-pro).
const queensidePawnMajorityAdvantage = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const queenside = (c: Color): number =>
    piecesOf(board, "p", c).filter((sq) => fileOf(sq) <= 3).length;
  if (queenside(color) - queenside(opp) < 2) return false;
  const oppKing = piecesOf(board, "k", opp)[0];
  if (!oppKing) return false;
  if (fileOf(oppKing) <= 3) return false;
  const stmKing = piecesOf(board, "k", color)[0];
  if (!stmKing) return false;
  if (fileOf(stmKing) <= 3 && board.attackers(stmKing, opp).length > 0) return false;
  return true;
};

// Translation of BinProp "bishop_blocked_by_own_pawns" (chess/deepseek-v4-pro).
const bishopBlockedByOwnPawns = (board: Chess, color: Color): boolean => {
  const countBlocked = (c: Color): number => {
    let count = 0;
    for (const sq of piecesOf(board, "b", c)) {
      const sqColor = (fileOf(sq) + rankOf(sq)) % 2;
      for (const cs of CENTER) {
        if ((fileOf(cs) + rankOf(cs)) % 2 === sqColor) {
          const p = board.get(cs);
          if (p && p.type === "p" && p.color === c) {
            count += 1;
            break;
          }
        }
      }
    }
    return count;
  };
  return countBlocked(color) > countBlocked(other(color));
};

export const TACTICS_MOTIFS = [
  defineMotif({
    name: "piece_fork_potential",
    description:
      "The side to move has a piece attacking two or more enemy pieces at once — fork energy.",
    delta: 0.01565,
    library: "chess/qwen3.5-397b-a17b",
    motif: pieceForkPotential,
  }),
  defineMotif({
    name: "check based double attack",
    description:
      "Without already being ahead in material, the side to move has mate in one, or a check that simultaneously wins an enemy piece (more attackers than defenders).",
    delta: 0.02,
    library: "chess/kimi-k3",
    motif: checkBasedDoubleAttack,
  }),
  defineMotif({
    name: "opponent pieces cornered and hanging",
    description:
      "The opponent's knights, bishops, rooks and queens are far more troubled than ours: cramped with at most one safe square, attacked while undefended, or hit by cheaper attackers.",
    delta: 0.02018,
    library: "chess/claude-opus-5",
    motif: opponentPiecesCorneredAndHanging,
  }),
  defineMotif({
    name: "queenside_pawn_majority_advantage",
    description:
      "The side to move has at least two more queenside pawns than the opponent, while the opponent king is elsewhere — a majority ready to create a passed pawn.",
    delta: 0.0322,
    library: "chess/deepseek-v4-pro",
    motif: queensidePawnMajorityAdvantage,
  }),
  defineMotif({
    name: "bishop_blocked_by_own_pawns",
    description:
      "More of the side to move's bishops are blocked behind own pawns on their color complex in the center — a 'bad bishop' — than the opponent has.",
    delta: 0.04893,
    library: "chess/deepseek-v4-pro",
    motif: bishopBlockedByOwnPawns,
  }),
];
