import { Chess } from "chess.js";
import type { Color, Square } from "chess.js";
import { defineMotif } from "../types.ts";
import {
  attacksFrom,
  fileOf,
  other,
  piecesOf,
  rankOf,
  squareAt,
  squareDistance,
} from "../helpers.ts";

function kingNeighbors(kingSq: Square, includeKing = false): Square[] {
  const kf = fileOf(kingSq);
  const kr = rankOf(kingSq);
  const out: Square[] = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0 && !includeKing) continue;
      const f = kf + df;
      const r = kr + dr;
      if (f >= 0 && f <= 7 && r >= 0 && r <= 7) out.push(squareAt(f, r));
    }
  }
  return out;
}

/** Squares in a king's zone (Chebyshev distance 1-2) attacked by `color`. */
function attackedKingZoneSquares(board: Chess, kingSq: Square, color: Color): Square[] {
  const out: Square[] = [];
  for (let f = 0; f <= 7; f++) {
    for (let r = 0; r <= 7; r++) {
      const sq = squareAt(f, r);
      const d = squareDistance(kingSq, sq);
      if (d < 1 || d > 2) continue;
      if (board.attackers(sq, color).length > 0) out.push(sq);
    }
  }
  return out;
}

const kingAttackPressureFacts = (board: Chess, color: Color): string[] => {
  const opp = other(color);
  const oppKing = piecesOf(board, "k", opp)[0];
  if (!oppKing) return [];
  const attacked = attackedKingZoneSquares(board, oppKing, color);
  if (attacked.length === 0) return [];
  return [
    `attacks ${attacked.length} squares in the enemy king's zone around ${oppKing} (${attacked.slice(0, 6).join(", ")}${attacked.length > 6 ? ", …" : ""})`,
  ];
};

// Translation of BinProp "king_attack_pressure" (chess/deepseek-v4-pro).
const kingAttackPressure = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const stmKing = piecesOf(board, "k", color)[0];
  const oppKing = piecesOf(board, "k", opp)[0];
  if (!stmKing || !oppKing) return false;

  const zone = (kingSq: Square): Square[] => {
    const out: Square[] = [];
    for (let f = 0; f <= 7; f++) {
      for (let r = 0; r <= 7; r++) {
        const sq = squareAt(f, r);
        const d = squareDistance(kingSq, sq);
        if (d >= 1 && d <= 2) out.push(sq);
      }
    }
    return out;
  };

  let stmAttacks = 0;
  for (const sq of zone(oppKing)) {
    if (board.attackers(sq, color).length > 0) stmAttacks += 1;
  }
  let oppAttacks = 0;
  for (const sq of zone(stmKing)) {
    if (board.attackers(sq, opp).length > 0) oppAttacks += 1;
  }
  return stmAttacks >= oppAttacks + 2;
};

// Translation of BinProp "knight_attacking_king_zone" (chess/deepseek-v4-pro).
const knightKingZoneAttacks = (board: Chess, kingSq: Square): number => {
  const zone = new Set<Square>();
  for (let f = 0; f <= 7; f++) {
    for (let r = 0; r <= 7; r++) {
      const sq = squareAt(f, r);
      if (squareDistance(kingSq, sq) <= 2) zone.add(sq);
    }
  }
  let attacks = 0;
  for (const knightSq of piecesOf(board, "n", board.get(kingSq)!.color === "w" ? "b" : "w")) {
    for (const target of attacksFrom(board, knightSq)) {
      if (!zone.has(target)) continue;
      const piece = board.get(target);
      if (!piece || piece.color === board.get(kingSq)!.color) attacks += 1;
    }
  }
  return attacks;
};

const knightAttackingKingZone = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const oppKing = piecesOf(board, "k", opp)[0];
  const stmKing = piecesOf(board, "k", color)[0];
  if (!oppKing || !stmKing) return false;
  const stmAttacks = knightKingZoneAttacks(board, oppKing);
  const oppAttacks = knightKingZoneAttacks(board, stmKing);
  return stmAttacks > oppAttacks;
};

// Translation of BinProp "bishop_attacking_king_zone" (chess/deepseek-v4-pro).
const bishopAttacksZone = (board: Chess, color: Color, zone: Square[]): boolean => {
  for (const bsq of piecesOf(board, "b", color)) {
    const attacks = attacksFrom(board, bsq);
    if (zone.some((zsq) => attacks.includes(zsq))) return true;
  }
  return false;
};

const bishopAttackingKingZone = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const oppKing = piecesOf(board, "k", opp)[0];
  const stmKing = piecesOf(board, "k", color)[0];
  if (!oppKing || !stmKing) return false;
  if (!bishopAttacksZone(board, color, kingNeighbors(oppKing))) return false;
  return !bishopAttacksZone(board, opp, kingNeighbors(stmKing));
};

// Translation of BinProp "queen_attacking_king_zone_without_opponent"
// (chess/deepseek-v4-pro).
const queenAttacksZone = (board: Chess, color: Color, zone: Square[]): boolean => {
  for (const qsq of piecesOf(board, "q", color)) {
    const attacks = attacksFrom(board, qsq);
    if (zone.some((zsq) => attacks.includes(zsq))) return true;
  }
  return false;
};

const queenAttackingKingZoneWithoutOpponent = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const oppKing = piecesOf(board, "k", opp)[0];
  const stmKing = piecesOf(board, "k", color)[0];
  if (!oppKing || !stmKing) return false;
  if (!queenAttacksZone(board, color, kingNeighbors(oppKing))) return false;
  return !queenAttacksZone(board, opp, kingNeighbors(stmKing));
};

// Translation of BinProp "pawn_storm_against_kingside_castled_king"
// (chess/deepseek-v4-pro).
const pawnStormAgainstKingsideCastledKing = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const oppKing = piecesOf(board, "k", opp)[0];
  const stmKing = piecesOf(board, "k", color)[0];
  if (!oppKing || !stmKing) return false;
  const oppBackRank = opp === "w" ? 0 : 7;
  if (fileOf(oppKing) < 5) return false;
  if (Math.abs(rankOf(oppKing) - oppBackRank) > 1) return false;

  const ksFiles = new Set([5, 6, 7]);
  const pawnsOnKs = (c: Color): number =>
    piecesOf(board, "p", c).filter((sq) => ksFiles.has(fileOf(sq))).length;

  const stmPawns = pawnsOnKs(color);
  if (stmPawns < 2) return false;

  const stmBackRank = color === "w" ? 0 : 7;
  const stmKsCastled = fileOf(stmKing) >= 5 && Math.abs(rankOf(stmKing) - stmBackRank) <= 1;
  if (stmKsCastled && stmPawns <= pawnsOnKs(opp)) return false;
  return true;
};

// Translation of BinProp "king_safety_pawn_storm" (chess/deepseek-v4-pro).
const kingSafetyPawnStorm = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const oppKing = piecesOf(board, "k", opp)[0];
  const stmKing = piecesOf(board, "k", color)[0];
  if (!oppKing || !stmKing) return false;
  const wingPawns = (c: Color, kingFile: number): number => {
    let count = 0;
    for (const sq of piecesOf(board, "p", c)) {
      const f = fileOf(sq);
      if (kingFile <= 3) {
        if (f <= 3) count += 1;
      } else if (f >= 4) count += 1;
    }
    return count;
  };
  const stmStorm = wingPawns(color, fileOf(oppKing));
  const oppStorm = wingPawns(opp, fileOf(stmKing));
  return stmStorm > oppStorm;
};

// Translation of BinProp "piece_attacking_king_defended_target"
// (chess/deepseek-v4-pro).
const hasKingOnlyDefendedTarget = (
  board: Chess,
  attackingColor: Color,
  defendingColor: Color,
  defKing: Square,
): boolean => {
  for (const type of ["p", "n", "b", "r", "q"] as const) {
    for (const sq of piecesOf(board, type, defendingColor)) {
      const attackers = board.attackers(sq, attackingColor);
      const defenders = board.attackers(sq, defendingColor);
      if (attackers.length > 0 && defenders.length === 1 && defenders[0] === defKing) {
        return true;
      }
    }
  }
  return false;
};

const pieceAttackingKingDefendedTarget = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const oppKing = piecesOf(board, "k", opp)[0];
  if (!oppKing) return false;
  if (!hasKingOnlyDefendedTarget(board, color, opp, oppKing)) return false;
  const stmKing = piecesOf(board, "k", color)[0];
  if (!stmKing) return false;
  return !hasKingOnlyDefendedTarget(board, opp, color, stmKing);
};

// Translation of BinProp "safe_pawn_break_threat" (chess/deepseek-v4-pro).
const pawnBreakTowardKing = (
  board: Chess,
  pawnSq: Square,
  color: Color,
  kingZone: Square[],
): boolean => {
  const opp = other(color);
  const dir = color === "w" ? 1 : -1;
  const pr = rankOf(pawnSq);
  const startRank = color === "w" ? 1 : 6;
  const steps = pr === startRank ? [1, 2] : [1];
  for (const step of steps) {
    if (pr + step * dir < 0 || pr + step * dir > 7) continue;
    const copy = new Chess(board.fen());
    copy.remove(pawnSq);
    let opens = false;
    for (const sq of kingZone) {
      for (const att of copy.attackers(sq, color)) {
        const p = copy.get(att);
        if (p && (p.type === "q" || p.type === "r" || p.type === "b")) {
          opens = true;
          break;
        }
      }
      if (opens) break;
    }
    if (opens) {
      const kingSq = piecesOf(board, "k", color)[0];
      if (!kingSq || !copy.isAttacked(kingSq, opp)) return true;
    }
  }
  return false;
};

const safePawnBreakThreat = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const oppKing = piecesOf(board, "k", opp)[0];
  const stmKing = piecesOf(board, "k", color)[0];
  if (!oppKing || !stmKing) return false;
  const stmBreak = piecesOf(board, "p", color).some((sq) =>
    pawnBreakTowardKing(board, sq, color, kingNeighbors(oppKing, true)),
  );
  if (!stmBreak) return false;
  const oppBreak = piecesOf(board, "p", opp).some((sq) =>
    pawnBreakTowardKing(board, sq, opp, kingNeighbors(stmKing, true)),
  );
  return !oppBreak;
};

export const ATTACK_MOTIFS = [
  defineMotif({
    name: "king_attack_pressure",
    description:
      "The side to move attacks far more squares around the opponent king than vice versa, showing a serious attack brewing.",
    delta: 0.12015,
    library: "chess/deepseek-v4-pro",
    motif: kingAttackPressure,
    facts: kingAttackPressureFacts,
  }),
  defineMotif({
    name: "knight_attacking_king_zone",
    description:
      "The side to move has a knight attacking squares near the opponent king, while the opponent has no equivalent attack.",
    delta: 0.06751,
    library: "chess/deepseek-v4-pro",
    motif: knightAttackingKingZone,
  }),
  defineMotif({
    name: "bishop_attacking_king_zone",
    description:
      "The side to move has a bishop attacking squares adjacent to the opponent king, while the opponent has no such bishop attack on ours.",
    delta: 0.03894,
    library: "chess/deepseek-v4-pro",
    motif: bishopAttackingKingZone,
  }),
  defineMotif({
    name: "queen_attacking_king_zone_without_opponent",
    description:
      "The side to move has a queen attacking squares adjacent to the opponent king, while the opponent's queen has no such attack on ours.",
    delta: 0.01711,
    library: "chess/deepseek-v4-pro",
    motif: queenAttackingKingZoneWithoutOpponent,
  }),
  defineMotif({
    name: "pawn_storm_against_kingside_castled_king",
    description:
      "The side to move has at least two pawns marching on the files in front of the opponent's castled king, while the opponent has no matching storm.",
    delta: 0.02676,
    library: "chess/deepseek-v4-pro",
    motif: pawnStormAgainstKingsideCastledKing,
  }),
  defineMotif({
    name: "king_safety_pawn_storm",
    description:
      "The side to move has more pawns on the wing where the opponent king lives than the opponent has on our king's wing — a pawn storm advantage.",
    delta: 0.16792,
    library: "chess/deepseek-v4-pro",
    motif: kingSafetyPawnStorm,
  }),
  defineMotif({
    name: "piece_attacking_king_defended_target",
    description:
      "The side to move attacks an enemy piece that is defended only by its own king — a tactical vulnerability the opponent does not have.",
    delta: 0.01173,
    library: "chess/deepseek-v4-pro",
    motif: pieceAttackingKingDefendedTarget,
  }),
  defineMotif({
    name: "safe_pawn_break_threat",
    description:
      "The side to move can open an attacking line against the opponent king with a pawn break, without exposing its own king, while the opponent has no comparable threat.",
    delta: 0.05572,
    library: "chess/deepseek-v4-pro",
    motif: safePawnBreakThreat,
  }),
];
