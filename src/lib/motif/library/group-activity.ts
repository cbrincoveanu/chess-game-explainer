import { Chess } from "chess.js";
import type { Color, Square } from "chess.js";
import { defineMotif } from "../types.ts";
import { other, piecesOf, rankOf } from "../helpers.ts";
import { withTurn } from "../mirror.ts";

const CENTER: Square[] = ["d4", "d5", "e4", "e5"];

// Translation of BinProp "mobility_advantage" (chess/qwen3.5-397b-a17b).
const mobilityAdvantage = (board: Chess, color: Color): boolean => {
  const stmMoves = board.moves().length;
  const flipped = new Chess(withTurn(board.fen(), other(color)));
  const oppMoves = flipped.moves().length;
  return stmMoves > oppMoves;
};

const mobilityFacts = (board: Chess, color: Color): string[] => {
  const stmMoves = board.moves().length;
  const flipped = new Chess(withTurn(board.fen(), other(color)));
  const oppMoves = flipped.moves().length;
  return [
    `${stmMoves} legal moves for ${color === "w" ? "White" : "Black"} vs ${oppMoves} for the opponent`,
  ];
};

// Translation of BinProp "center_control" (chess/qwen3.5-397b-a17b).
const centerControl = (board: Chess, color: Color): boolean => {
  let stm = 0;
  let opp = 0;
  for (const sq of CENTER) {
    stm += board.attackers(sq, color).length;
    opp += board.attackers(sq, other(color)).length;
  }
  return stm > opp;
};

const centerControlFacts = (board: Chess, color: Color): string[] => {
  const occupied: Square[] = [];
  const attacked: Square[] = [];
  for (const sq of CENTER) {
    const piece = board.get(sq);
    if (piece && piece.color === color) occupied.push(sq);
    else if (board.attackers(sq, color).length > 0) attacked.push(sq);
  }
  const facts: string[] = [];
  if (occupied.length > 0) facts.push(`occupies the central square${occupied.length > 1 ? "s" : ""} ${occupied.join(", ")}`);
  if (attacked.length > 0) facts.push(`attacks the central square${attacked.length > 1 ? "s" : ""} ${attacked.join(", ")}`);
  return facts;
};

// Translation of BinProp "piece_in_enemy_territory" (chess/qwen3.5-397b-a17b).
const pieceInEnemyTerritory = (board: Chess, color: Color): boolean => {
  for (const type of ["n", "b", "r", "q", "k"] as const) {
    for (const sq of piecesOf(board, type, color)) {
      const r = rankOf(sq);
      if (color === "w" && r >= 4) return true;
      if (color === "b" && r <= 3) return true;
    }
  }
  return false;
};

// Translation of BinProp "rook_invading_opponent_territory" (chess/deepseek-v4-pro).
const rookInvadingOpponentTerritory = (board: Chess, color: Color): boolean => {
  const onOppHalf = (sq: Square, c: Color): boolean =>
    (c === "w" && rankOf(sq) >= 4) || (c === "b" && rankOf(sq) <= 3);
  const stmHas = piecesOf(board, "r", color).some((sq) => onOppHalf(sq, color));
  const oppHas = piecesOf(board, "r", other(color)).some((sq) =>
    onOppHalf(sq, other(color)),
  );
  return stmHas && !oppHas;
};

// Translation of BinProp "restricted_opponent_pieces" (chess/deepseek-v4-pro).
const restrictedOpponentPieces = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  let stmRestricted = 0;
  let oppRestricted = 0;
  for (const type of ["q", "r", "b", "n"] as const) {
    for (const sq of piecesOf(board, type, opp)) {
      const home = opp === "w" ? rankOf(sq) <= 1 : rankOf(sq) >= 6;
      if (home) stmRestricted += 1;
    }
    for (const sq of piecesOf(board, type, color)) {
      const home = color === "w" ? rankOf(sq) <= 1 : rankOf(sq) >= 6;
      if (home) oppRestricted += 1;
    }
  }
  return stmRestricted > oppRestricted && stmRestricted >= 1;
};

export const ACTIVITY_MOTIFS = [
  defineMotif({
    name: "mobility_advantage",
    description: "The side to move has more legal moves available than the opponent.",
    delta: 0.14665,
    library: "chess/qwen3.5-397b-a17b",
    motif: mobilityAdvantage,
    facts: mobilityFacts,
  }),
  defineMotif({
    name: "center_control",
    description:
      "The side to move attacks more central squares (d4, d5, e4, e5) than the opponent.",
    delta: 0.11556,
    library: "chess/qwen3.5-397b-a17b",
    motif: centerControl,
    facts: centerControlFacts,
  }),
  defineMotif({
    name: "piece_in_enemy_territory",
    description:
      "The side to move has at least one piece positioned deep in the opponent's half of the board.",
    delta: 0.08951,
    library: "chess/qwen3.5-397b-a17b",
    motif: pieceInEnemyTerritory,
  }),
  defineMotif({
    name: "rook_invading_opponent_territory",
    description:
      "The side to move has a rook deep in the opponent's half while the opponent has no rook in ours.",
    delta: 0.01599,
    library: "chess/deepseek-v4-pro",
    motif: rookInvadingOpponentTerritory,
  }),
  defineMotif({
    name: "restricted_opponent_pieces",
    description:
      "More of the opponent's pieces are still stuck on their home ranks than ours, showing a space advantage that cramps them.",
    delta: 0.0668,
    library: "chess/deepseek-v4-pro",
    motif: restrictedOpponentPieces,
  }),
];
