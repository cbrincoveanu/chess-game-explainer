import type { Chess, Color, Square } from "chess.js";
import { defineMotif } from "../types.ts";
import { fileOf, other, piecesOf, queenAttacks, rankOf } from "../helpers.ts";

const CENTRAL: Square[] = ["d4", "d5", "e4", "e5"];

// Translation of BinProp "opponent_knight_on_rim" (chess/qwen3.5-397b-a17b).
const opponentKnightOnRim = (board: Chess, color: Color): boolean => {
  for (const sq of piecesOf(board, "n", other(color))) {
    if (fileOf(sq) === 0 || fileOf(sq) === 7 || rankOf(sq) === 0 || rankOf(sq) === 7) {
      return true;
    }
  }
  return false;
};

// Translation of BinProp "queen_centralized" (chess/qwen3.5-397b-a17b).
const queenCentralized = (board: Chess, color: Color): boolean => {
  const queens = piecesOf(board, "q", color);
  if (queens.length === 0) return false;
  for (const sq of queens) {
    if (CENTRAL.includes(sq)) return true;
  }
  for (const sq of queens) {
    if (CENTRAL.some((cs) => queenAttacks(board, sq, cs))) return true;
  }
  return false;
};

// Translation of BinProp "centralized_knight" (chess/qwen3.5-397b-a17b).
const centralizedKnight = (board: Chess, color: Color): boolean => {
  for (const sq of piecesOf(board, "n", color)) {
    if (CENTRAL.includes(sq)) return true;
  }
  return false;
};

const PIECE_NAMES: Record<string, string> = {
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
  p: "pawn",
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

const pieceInEnemyTerritoryFacts = (board: Chess, color: Color): string[] => {
  const facts: string[] = [];
  for (const type of ["q", "r", "b", "n"] as const) {
    for (const sq of piecesOf(board, type, color)) {
      const r = rankOf(sq);
      if ((color === "w" && r >= 4) || (color === "b" && r <= 3)) {
        facts.push(`the ${PIECE_NAMES[type]} on ${sq} sits deep in enemy territory`);
      }
    }
  }
  return facts;
};

export const PIECE_MOTIFS = [
  defineMotif({
    name: "opponent_knight_on_rim",
    description:
      "The opponent has at least one knight on the edge of the board (a- or h-file, first or last rank) — a knight on the rim is dim.",
    delta: 0.02757,
    library: "chess/qwen3.5-397b-a17b",
    motif: opponentKnightOnRim,
  }),
  defineMotif({
    name: "piece_in_enemy_territory",
    description:
      "The side to move has at least one piece positioned deep in the opponent's half of the board.",
    delta: 0.08951,
    library: "chess/qwen3.5-397b-a17b",
    motif: pieceInEnemyTerritory,
    facts: pieceInEnemyTerritoryFacts,
  }),
  defineMotif({
    name: "queen_centralized",
    description:
      "The side to move has a queen on or attacking the central squares d4, d5, e4, e5.",
    delta: 0.03644,
    library: "chess/qwen3.5-397b-a17b",
    motif: queenCentralized,
  }),
  defineMotif({
    name: "centralized_knight",
    description:
      "The side to move has a knight on one of the four central squares (d4, d5, e4, e5).",
    delta: 0.02268,
    library: "chess/qwen3.5-397b-a17b",
    motif: centralizedKnight,
  }),
];
