import type { Chess, Color, Square } from "chess.js";
import { defineMotif } from "../types.ts";
import { fileOf, other, piecesOf, rankOf, squareAt } from "../helpers.ts";

// Translation of BinProp "king_pawn_shield_intact" (chess/deepseek-v4-pro).
const shieldPawns = (board: Chess, kingSq: Square, color: Color): number => {
  const kf = fileOf(kingSq);
  const kr = rankOf(kingSq);
  const dir = color === "w" ? 1 : -1;
  let count = 0;
  for (const df of [-1, 0, 1]) {
    const f = kf + df;
    if (f < 0 || f > 7) continue;
    for (const step of [1, 2]) {
      const r = kr + step * dir;
      if (r < 0 || r > 7) break;
      const p = board.get(squareAt(f, r));
      if (p && p.type === "p" && p.color === color) {
        count += 1;
        break;
      }
    }
  }
  return count;
};

const kingPawnShieldIntact = (board: Chess, color: Color): boolean => {
  const stmKing = piecesOf(board, "k", color)[0];
  const oppKing = piecesOf(board, "k", other(color))[0];
  if (!stmKing || !oppKing) return false;
  return shieldPawns(board, stmKing, color) > shieldPawns(board, oppKing, other(color));
};

// Translation of BinProp "stm_castled_with_pawn_shield" (chess/qwen3.5-397b-a17b).
const castledWithPawnShield = (board: Chess, color: Color): boolean => {
  const king = piecesOf(board, "k", color)[0];
  if (!king) return false;
  const kf = fileOf(king);
  if (kf !== 6 && kf !== 2) return false;
  const ranks = color === "w" ? [0, 1] : [6, 7];
  const files = kf === 6 ? [5, 6, 7] : [1, 2, 3];
  let pawnCount = 0;
  for (const f of files) {
    for (const r of ranks) {
      const p = board.get(squareAt(f, r));
      if (p && p.type === "p" && p.color === color) pawnCount += 1;
    }
  }
  return pawnCount >= 2;
};

// Translation of BinProp "opponent_king_exposure" (chess/qwen3.5-397b-a17b).
const opponentKingExposure = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const king = piecesOf(board, "k", opp)[0];
  if (!king) return false;
  const r = rankOf(king);
  const f = fileOf(king);
  const isBack = (r === 0 && opp === "w") || (r === 7 && opp === "b");
  if (!isBack) return true;
  const frontRank = opp === "w" ? 1 : 6;
  let count = 0;
  for (const df of [-1, 0, 1]) {
    const cf = f + df;
    if (cf < 0 || cf > 7) continue;
    const p = board.get(squareAt(cf, frontRank));
    if (p && p.color === opp && p.type === "p") count += 1;
  }
  return count < 2;
};

const opponentKingExposureFacts = (board: Chess, color: Color): string[] => {
  const opp = other(color);
  const king = piecesOf(board, "k", opp)[0];
  if (!king) return [];
  const r = rankOf(king);
  const f = fileOf(king);
  const isBack = (r === 0 && opp === "w") || (r === 7 && opp === "b");
  if (!isBack) return [`the enemy king has left its back rank (${king})`];
  const frontRank = opp === "w" ? 1 : 6;
  const missing: string[] = [];
  for (const df of [-1, 0, 1]) {
    const cf = f + df;
    if (cf < 0 || cf > 7) continue;
    const p = board.get(squareAt(cf, frontRank));
    if (!p || p.color !== opp || p.type !== "p") {
      missing.push(squareAt(cf, frontRank));
    }
  }
  return [
    `only ${3 - missing.length} shield pawn${3 - missing.length === 1 ? "" : "s"} in front of the enemy king on ${king}` +
      (missing.length > 0 ? ` (${missing.join(", ")} exposed)` : ""),
  ];
};

export const KING_SAFETY_MOTIFS = [
  defineMotif({
    name: "king_pawn_shield_intact",
    description:
      "The side to move has more pawns shielding their king than the opponent has near theirs.",
    delta: 0.12188,
    library: "chess/deepseek-v4-pro",
    motif: kingPawnShieldIntact,
  }),
  defineMotif({
    name: "stm_castled_with_pawn_shield",
    description:
      "The side to move has castled (king on the g- or c-file) and kept at least two pawns in front of it.",
    delta: 0.09732,
    library: "chess/qwen3.5-397b-a17b",
    motif: castledWithPawnShield,
  }),
  defineMotif({
    name: "opponent_king_exposure",
    description:
      "The opponent king is exposed: it has left its back rank, or lacks two shield pawns in front of it.",
    delta: 0.094,
    library: "chess/qwen3.5-397b-a17b",
    motif: opponentKingExposure,
    facts: opponentKingExposureFacts,
  }),
];
