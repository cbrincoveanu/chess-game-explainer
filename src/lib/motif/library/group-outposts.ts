import type { Chess, Color, Square } from "chess.js";
import { defineMotif } from "../types.ts";
import {
  knightAttacksSquare,
  other,
  piecesOf,
  protectedByPawn,
  rankOf,
} from "../helpers.ts";

const CENTER: Square[] = ["d4", "d5", "e4", "e5"];

// Translation of BinProp "knight_on_outpost" (chess/deepseek-v4-pro).
const knightOnOutpost = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  for (const sq of piecesOf(board, "n", color)) {
    if (protectedByPawn(board, sq, opp)) continue;
    if (!protectedByPawn(board, sq, color)) continue;
    const r = rankOf(sq);
    if (color === "w" && r >= 4) return true;
    if (color === "b" && r <= 3) return true;
    if (r === 3 || r === 4) return true;
  }
  return false;
};

// Translation of BinProp "knight_outpost_attacking_center"
// (chess/deepseek-v4-pro).
const isProtectedOutpost = (board: Chess, sq: Square, color: Color): boolean => {
  const piece = board.get(sq);
  if (!piece || piece.type !== "n" || piece.color !== color) return false;
  if (protectedByPawn(board, sq, other(color))) return false;
  return protectedByPawn(board, sq, color);
};

const knightOutpostAttackingCenter = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const has = (c: Color): boolean =>
    piecesOf(board, "n", c).some(
      (sq) =>
        isProtectedOutpost(board, sq, c) &&
        CENTER.some((cs) => knightAttacksSquare(sq, cs)),
    );
  return has(color) && !has(opp);
};

export const OUTPOST_MOTIFS = [
  defineMotif({
    name: "knight_on_outpost",
    description:
      "The side to move has a knight on an outpost: a square no enemy pawn can ever attack, defended by a friendly pawn, on the opponent's half or in the center.",
    delta: 0.02095,
    library: "chess/deepseek-v4-pro",
    motif: knightOnOutpost,
  }),
  defineMotif({
    name: "knight_outpost_attacking_center",
    description:
      "The side to move has a knight on a protected outpost that attacks a central square (d4, d5, e4, e5), while the opponent has no such knight.",
    delta: 0.03658,
    library: "chess/deepseek-v4-pro",
    motif: knightOutpostAttackingCenter,
  }),
];
