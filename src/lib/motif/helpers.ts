import type { Chess, Color, PieceSymbol, Square } from "chess.js";

export function other(color: Color): Color {
  return color === "w" ? "b" : "w";
}

export function fileOf(sq: Square): number {
  return sq.charCodeAt(0) - 97;
}

export function rankOf(sq: Square): number {
  return sq.charCodeAt(1) - 49;
}

export function squareAt(file: number, rank: number): Square {
  return (String.fromCharCode(97 + file) + String.fromCharCode(49 + rank)) as Square;
}

export const MATERIAL: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function countPieces(board: Chess, type: PieceSymbol, color: Color): number {
  return board.findPiece({ type, color }).length;
}

export function piecesOf(board: Chess, type: PieceSymbol, color: Color): Square[] {
  return board.findPiece({ type, color });
}

/** Chebyshev distance, matching python-chess chess.square_distance. */
export function squareDistance(a: Square, b: Square): number {
  return Math.max(
    Math.abs(fileOf(a) - fileOf(b)),
    Math.abs(rankOf(a) - rankOf(b)),
  );
}

/** True if the pawn on `sq` (of `color`) has no enemy pawns ahead on its own or
 * adjacent files: a passed pawn. */
export function isPassedPawn(board: Chess, sq: Square, color: Color): boolean {
  const f = fileOf(sq);
  const r = rankOf(sq);
  const dir = color === "w" ? 1 : -1;
  for (const df of [-1, 0, 1]) {
    const cf = f + df;
    if (cf < 0 || cf > 7) continue;
    let rr = r + dir;
    while (rr >= 0 && rr <= 7) {
      const p = board.get(squareAt(cf, rr));
      if (p && p.type === "p" && p.color !== color) return false;
      rr += dir;
    }
  }
  return true;
}

/** True if a friendly pawn defends `sq` from one rank behind (pawn chain). */
export function protectedByPawn(board: Chess, sq: Square, color: Color): boolean {
  const f = fileOf(sq);
  const r = rankOf(sq);
  const behind = color === "w" ? r - 1 : r + 1;
  if (behind < 0 || behind > 7) return false;
  for (const df of [-1, 1]) {
    const cf = f + df;
    if (cf < 0 || cf > 7) continue;
    const p = board.get(squareAt(cf, behind));
    if (p && p.type === "p" && p.color === color) return true;
  }
  return false;
}

/** True if a queen standing on `from` attacks `target` (occupancy-aware). */
export function queenAttacks(board: Chess, from: Square, target: Square): boolean {
  const ff = fileOf(from);
  const fr = rankOf(from);
  const tf = fileOf(target);
  const tr = rankOf(target);
  const sameLine =
    ff === tf || fr === tr || Math.abs(tf - ff) === Math.abs(tr - fr);
  if (!sameLine) return false;
  const df = Math.sign(tf - ff);
  const dr = Math.sign(tr - fr);
  let f = ff + df;
  let r = fr + dr;
  while (f !== tf || r !== tr) {
    if (board.get(squareAt(f, r))) return false;
    f += df;
    r += dr;
  }
  return true;
}

/** True if a knight standing on `from` attacks `target` (pattern only). */
export function knightAttacksSquare(from: Square, target: Square): boolean {
  const df = Math.abs(fileOf(from) - fileOf(target));
  const dr = Math.abs(rankOf(from) - rankOf(target));
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
}

const KNIGHT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

const KING_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/**
 * All squares pseudo-legally attacked by the piece standing on `sq`, matching
 * python-chess Board.attacks(): pawn capture diagonals, knight/king patterns,
 * slider rays stopping at the first piece (inclusive).
 */
export function attacksFrom(board: Chess, sq: Square): Square[] {
  const piece = board.get(sq);
  if (!piece) return [];
  const f = fileOf(sq);
  const r = rankOf(sq);
  const out: Square[] = [];
  const push = (nf: number, nr: number): boolean => {
    if (nf < 0 || nf > 7 || nr < 0 || nr > 7) return false;
    out.push(squareAt(nf, nr));
    return true;
  };
  if (piece.type === "p") {
    const dir = piece.color === "w" ? 1 : -1;
    for (const df of [-1, 1]) push(f + df, r + dir);
  } else if (piece.type === "n") {
    for (const [df, dr] of KNIGHT_OFFSETS) push(f + df, r + dr);
  } else if (piece.type === "k") {
    for (const [df, dr] of KING_OFFSETS) push(f + df, r + dr);
  } else {
    const dirs: Array<readonly [number, number]> = [];
    if (piece.type === "b" || piece.type === "q") {
      dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    }
    if (piece.type === "r" || piece.type === "q") {
      dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    }
    for (const [df, dr] of dirs) {
      let nf = f + df;
      let nr = r + dr;
      while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
        const target = squareAt(nf, nr);
        out.push(target);
        if (board.get(target)) break;
        nf += df;
        nr += dr;
      }
    }
  }
  return out;
}
