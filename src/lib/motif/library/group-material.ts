import type { Chess, Color, PieceSymbol } from "chess.js";
import { defineMotif } from "../types.ts";
import { countPieces, other } from "../helpers.ts";

const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Translation of BinProp "material_advantage" (chess/qwen3.5-397b-a17b).
const materialAdvantage = (board: Chess, color: Color): boolean => {
  let stmVal = 0;
  let oppVal = 0;
  for (const type of ["p", "n", "b", "r", "q"] as const) {
    stmVal += countPieces(board, type, color) * VALUES[type];
    oppVal += countPieces(board, type, other(color)) * VALUES[type];
  }
  return stmVal > oppVal;
};

export const MATERIAL_MOTIFS = [
  defineMotif({
    name: "material_advantage",
    description: "The side to move has more total material value than the opponent.",
    delta: 0.56053,
    library: "chess/qwen3.5-397b-a17b",
    motif: materialAdvantage,
  }),
];
