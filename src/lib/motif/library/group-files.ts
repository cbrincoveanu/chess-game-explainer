import type { Chess, Color } from "chess.js";
import { defineMotif } from "../types.ts";
import {
  fileOf,
  isPassedPawn,
  other,
  piecesOf,
  rankOf,
  squareAt,
} from "../helpers.ts";

// Translation of BinProp "stm_rook_open_or_semi_open_file"
// (chess/qwen3.5-397b-a17b).
const rookOpenOrSemiOpenFile = (board: Chess, color: Color): boolean => {
  const oppPawns = piecesOf(board, "p", other(color));
  for (const rookSq of piecesOf(board, "r", color)) {
    const rf = fileOf(rookSq);
    if (!oppPawns.some((p) => fileOf(p) === rf)) return true;
  }
  return false;
};

const rookOpenOrSemiOpenFileFacts = (board: Chess, color: Color): string[] => {
  const opp = other(color);
  const ownPawns = piecesOf(board, "p", color);
  const facts: string[] = [];
  for (const rookSq of piecesOf(board, "r", color)) {
    const rf = fileOf(rookSq);
    const fileName = String.fromCharCode(97 + rf);
    const enemyPawns = piecesOf(board, "p", opp).some((p) => fileOf(p) === rf);
    if (enemyPawns) continue;
    const kind = ownPawns.some((p) => fileOf(p) === rf) ? "semi-open" : "open";
    facts.push(`the rook on ${rookSq} is on the ${kind} ${fileName}-file`);
  }
  return facts;
};

// Translation of BinProp "rook_on_open_file" (chess/deepseek-v4-pro).
const rookOnOpenFileFor = (board: Chess, color: Color): boolean => {
  for (const rookSq of piecesOf(board, "r", color)) {
    const rf = fileOf(rookSq);
    let hasPawn = false;
    for (let r = 0; r <= 7; r++) {
      const p = board.get(squareAt(rf, r));
      if (p && p.type === "p") {
        hasPawn = true;
        break;
      }
    }
    if (!hasPawn) return true;
  }
  return false;
};

const rookOnOpenFile = (board: Chess, color: Color): boolean =>
  rookOnOpenFileFor(board, color) && !rookOnOpenFileFor(board, other(color));

// Translation of BinProp "connected_rooks" (chess/deepseek-v4-pro).
const hasConnectedRooks = (board: Chess, color: Color): boolean => {
  const rooks = piecesOf(board, "r", color);
  for (let i = 0; i < rooks.length; i++) {
    for (let j = i + 1; j < rooks.length; j++) {
      const a = rooks[i]!;
      const b = rooks[j]!;
      const fa = fileOf(a);
      const fb = fileOf(b);
      const ra = rankOf(a);
      const rb = rankOf(b);
      let clear = true;
      if (fa === fb) {
        const [lo, hi] = [Math.min(ra, rb), Math.max(ra, rb)];
        for (let r = lo + 1; r < hi; r++) {
          if (board.get(squareAt(fa, r))) {
            clear = false;
            break;
          }
        }
      } else if (ra === rb) {
        const [lo, hi] = [Math.min(fa, fb), Math.max(fa, fb)];
        for (let f = lo + 1; f < hi; f++) {
          if (board.get(squareAt(f, ra))) {
            clear = false;
            break;
          }
        }
      } else {
        clear = false;
      }
      if (clear) return true;
    }
  }
  return false;
};

const connectedRooks = (board: Chess, color: Color): boolean =>
  hasConnectedRooks(board, color) && !hasConnectedRooks(board, other(color));

// Translation of BinProp "rook_behind_passed_pawn" (chess/deepseek-v4-pro).
const hasRookBehindOwnPassed = (board: Chess, color: Color): boolean => {
  const passed = piecesOf(board, "p", color).filter((sq) =>
    isPassedPawn(board, sq, color),
  );
  for (const rookSq of piecesOf(board, "r", color)) {
    const rf = fileOf(rookSq);
    const rr = rankOf(rookSq);
    for (const psq of passed) {
      if (fileOf(psq) !== rf) continue;
      const pr = rankOf(psq);
      if (color === "w" && rr < pr) return true;
      if (color === "b" && rr > pr) return true;
    }
  }
  return false;
};

const rookBehindPassedPawn = (board: Chess, color: Color): boolean =>
  hasRookBehindOwnPassed(board, color) &&
  !hasRookBehindOwnPassed(board, other(color));

export const FILE_MOTIFS = [
  defineMotif({
    name: "stm_rook_open_or_semi_open_file",
    description:
      "The side to move has at least one rook on a file with no enemy pawns (an open or semi-open file).",
    delta: 0.09789,
    library: "chess/qwen3.5-397b-a17b",
    motif: rookOpenOrSemiOpenFile,
    facts: rookOpenOrSemiOpenFileFacts,
  }),
  defineMotif({
    name: "rook_on_open_file",
    description:
      "The side to move has a rook on a fully open file (no pawns of either color), while the opponent does not.",
    delta: 0.05784,
    library: "chess/deepseek-v4-pro",
    motif: rookOnOpenFile,
  }),
  defineMotif({
    name: "connected_rooks",
    description:
      "The side to move has two rooks connected on an open rank or file, while the opponent's rooks are not connected.",
    delta: 0.04162,
    library: "chess/deepseek-v4-pro",
    motif: connectedRooks,
  }),
  defineMotif({
    name: "rook_behind_passed_pawn",
    description:
      "The side to move has a rook behind its own passed pawn — the ideal rook placement — while the opponent has no such rook.",
    delta: 0.01217,
    library: "chess/deepseek-v4-pro",
    motif: rookBehindPassedPawn,
  }),
];
