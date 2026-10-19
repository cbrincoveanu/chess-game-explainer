import type { Chess, Color, Square } from "chess.js";
import { defineMotif } from "../types.ts";
import {
  fileOf,
  isPassedPawn,
  other,
  piecesOf,
  protectedByPawn,
  rankOf,
  squareAt,
  squareDistance,
} from "../helpers.ts";

// Translation of BinProp "passed_pawn_protected" (chess/deepseek-v4-pro).
const passedPawnProtected = (board: Chess, color: Color): boolean => {
  const supportedPassers = (c: Color): number => {
    let n = 0;
    for (const sq of piecesOf(board, "p", c)) {
      if (isPassedPawn(board, sq, c) && protectedByPawn(board, sq, c)) n += 1;
    }
    return n;
  };
  return supportedPassers(color) > supportedPassers(other(color));
};

const unstoppableFactsFor = (board: Chess, pawnSq: Square, color: Color): string[] => {
  const opp = other(color);
  const oppKing = piecesOf(board, "k", opp)[0];
  if (!oppKing) return [];
  const dir = color === "w" ? 1 : -1;
  const f = fileOf(pawnSq);
  const r = rankOf(pawnSq);
  const distToPromo = color === "w" ? 7 - r : r;
  const path: Square[] = [];
  for (let rr = r; rr >= 0 && rr <= 7; rr += dir) path.push(squareAt(f, rr));
  const minKingDist = Math.min(...path.map((sq) => squareDistance(oppKing, sq)));
  return [
    `the ${pawnSq} pawn is passed with ${distToPromo} step${distToPromo === 1 ? "" : "s"} to promotion; the enemy king needs ${minKingDist} moves to reach its path`,
  ];
};

// Translation of BinProp "unstoppable_passed_pawn" (chess/deepseek-v4-pro).
const unstoppablePassedPawn = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const pawns = piecesOf(board, "p", color);
  if (pawns.length === 0) return false;
  const oppKing = piecesOf(board, "k", opp)[0];
  if (!oppKing) return false;
  const dir = color === "w" ? 1 : -1;

  for (const pawnSq of pawns) {
    const f = fileOf(pawnSq);
    const r = rankOf(pawnSq);
    if (!isPassedPawn(board, pawnSq, color)) continue;

    const distToPromo = color === "w" ? 7 - r : r;
    const path: Square[] = [];
    for (let rr = r; rr >= 0 && rr <= 7; rr += dir) path.push(squareAt(f, rr));

    let minKingDist = Infinity;
    for (const sq of path) {
      minKingDist = Math.min(minKingDist, squareDistance(oppKing, sq));
    }
    if (minKingDist > distToPromo + 1) return true;

    const stops: Square[] = [];
    if (r + dir >= 0 && r + dir <= 7) stops.push(squareAt(f, r + dir));
    if ((color === "w" && r === 1) || (color === "b" && r === 6)) {
      const one = board.get(squareAt(f, r + dir));
      const two = board.get(squareAt(f, r + 2 * dir));
      if (!one && !two) stops.push(squareAt(f, r + 2 * dir));
    }
    if (r + 2 * dir >= 0 && r + 2 * dir <= 7) stops.push(squareAt(f, r + 2 * dir));

    if (stops.length > 0 && stops.every((s) => squareDistance(oppKing, s) > 1)) {
      if (minKingDist > distToPromo) return true;
    }
  }
  return false;
};

// Translation of BinProp "stm_fewer_pawn_islands" (chess/qwen3.5-397b-a17b).
const fewerPawnIslands = (board: Chess, color: Color): boolean => {
  const countIslands = (c: Color): number => {
    const files = new Array<boolean>(8).fill(false);
    for (const sq of piecesOf(board, "p", c)) files[fileOf(sq)] = true;
    let count = 0;
    for (let i = 0; i < 8; i++) {
      if (files[i] && (i === 0 || !files[i - 1])) count += 1;
    }
    return count;
  };
  return countIslands(color) < countIslands(other(color));
};

// Translation of BinProp "advanced_pawn_chain_advantage" (chess/deepseek-v4-pro).
const advancedPawnChainAdvantage = (board: Chess, color: Color): boolean => {
  const countAdvanced = (c: Color): number => {
    let n = 0;
    for (const sq of piecesOf(board, "p", c)) {
      const r = rankOf(sq);
      if (c === "w" && r >= 4) n += 1;
      if (c === "b" && r <= 3) n += 1;
    }
    return n;
  };
  return countAdvanced(color) > countAdvanced(other(color));
};

// Translation of BinProp "central_advanced_pawn" (chess/qwen3.5-397b-a17b).
const centralAdvancedPawn = (board: Chess, color: Color): boolean => {
  const centralFiles = new Set([2, 3, 4, 5]);
  for (const sq of piecesOf(board, "p", color)) {
    if (!centralFiles.has(fileOf(sq))) continue;
    const r = rankOf(sq);
    if (color === "w" && r >= 4) return true;
    if (color === "b" && r <= 3) return true;
  }
  return false;
};

const unstoppablePassedPawnFacts = (board: Chess, color: Color): string[] => {
  for (const pawnSq of piecesOf(board, "p", color)) {
    if (isPassedPawn(board, pawnSq, color)) {
      return unstoppableFactsFor(board, pawnSq, color);
    }
  }
  return [];
};

export const PAWN_MOTIFS = [
  defineMotif({
    name: "passed_pawn_protected",
    description:
      "The side to move has a passed pawn that is defended by a friendly pawn, while the opponent has no such supported passed pawn.",
    delta: 0.02824,
    library: "chess/deepseek-v4-pro",
    motif: passedPawnProtected,
  }),
  defineMotif({
    name: "unstoppable_passed_pawn",
    description:
      "The side to move has a passed pawn that the opponent cannot catch before it promotes.",
    delta: 0.01375,
    library: "chess/deepseek-v4-pro",
    motif: unstoppablePassedPawn,
    facts: unstoppablePassedPawnFacts,
  }),
  defineMotif({
    name: "stm_fewer_pawn_islands",
    description:
      "The side to move has fewer pawn islands than the opponent, indicating a healthier pawn structure.",
    delta: 0.15251,
    library: "chess/qwen3.5-397b-a17b",
    motif: fewerPawnIslands,
  }),
  defineMotif({
    name: "advanced_pawn_chain_advantage",
    description:
      "The side to move has more pawns on the fifth rank or beyond than the opponent, indicating more space and a superior advanced structure.",
    delta: 0.05837,
    library: "chess/deepseek-v4-pro",
    motif: advancedPawnChainAdvantage,
  }),
  defineMotif({
    name: "central_advanced_pawn",
    description:
      "The side to move has a pawn on the fifth rank or further on a central file (c, d, e or f).",
    delta: 0.06631,
    library: "chess/qwen3.5-397b-a17b",
    motif: centralAdvancedPawn,
  }),
];
