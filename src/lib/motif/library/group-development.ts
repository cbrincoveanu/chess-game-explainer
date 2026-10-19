import type { Chess, Color } from "chess.js";
import { defineMotif } from "../types.ts";
import { other, piecesOf, rankOf } from "../helpers.ts";

// Translation of BinProp "development_lead" (chess/deepseek-v4-pro).
const developmentLead = (board: Chess, color: Color): boolean => {
  const developed = (c: Color): number => {
    const backRank = c === "w" ? 0 : 7;
    let n = 0;
    for (const type of ["n", "b"] as const) {
      for (const sq of piecesOf(board, type, c)) {
        if (rankOf(sq) !== backRank) n += 1;
      }
    }
    return n;
  };
  const stm = developed(color);
  if (stm === 0) return false;
  return stm > developed(other(color));
};

// Translation of BinProp "minor_piece_development" (chess/qwen3.5-397b-a17b).
const minorPieceDevelopment = (board: Chess, color: Color): boolean => {
  const rank = color === "w" ? "1" : "8";
  const starting = new Set([`b${rank}`, `g${rank}`, `c${rank}`, `f${rank}`]);
  let developed = 0;
  for (const type of ["n", "b"] as const) {
    for (const sq of piecesOf(board, type, color)) {
      if (!starting.has(sq)) developed += 1;
    }
  }
  return developed >= 3;
};

export const DEVELOPMENT_MOTIFS = [
  defineMotif({
    name: "development_lead",
    description:
      "The side to move has more knights and bishops developed off their back rank than the opponent, indicating a development advantage.",
    delta: 0.0753,
    library: "chess/deepseek-v4-pro",
    motif: developmentLead,
  }),
  defineMotif({
    name: "minor_piece_development",
    description:
      "The side to move has at least 3 of its 4 minor pieces (knights and bishops) developed off their starting squares.",
    delta: 0.03816,
    library: "chess/qwen3.5-397b-a17b",
    motif: minorPieceDevelopment,
  }),
];
