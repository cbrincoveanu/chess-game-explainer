import type { Chess, Color, PieceSymbol, Square } from "chess.js";
import { defineMotif, type Motif } from "../types.ts";
import {
  countPieces,
  fileOf,
  other,
  piecesOf,
  rankOf,
  squareAt,
} from "../helpers.ts";

// The Phase-0 spike motifs: the first six BinProp translations, kept as a
// separate group for provenance — they validated the differential-testing
// approach against python-chess.

// Translation of BinProp "stm_material_advantage_two_or_more" (chess/glm-5.2).
const materialAdvantageTwoOrMore = (board: Chess, color: Color): boolean => {
  const vals: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let s = 0;
  let o = 0;
  for (const row of board.board()) {
    for (const sq of row) {
      if (!sq || sq.type === "k") continue;
      const v = vals[sq.type]!;
      if (sq.color === color) s += v;
      else o += v;
    }
  }
  return s - o >= 2;
};

// Translation of BinProp "stm_bishop_pair_advantage" (chess/glm-5.2).
const bishopPairAdvantage = (board: Chess, color: Color): boolean =>
  countPieces(board, "b", color) >= 2 && countPieces(board, "b", other(color)) <= 1;

// Translation of BinProp "stm_central_knight_outpost" (chess/glm-5.2).
const centralKnightOutpost = (board: Chess, color: Color): boolean => {
  const dirUp = color === "w" ? 1 : -1;
  for (const ksq of piecesOf(board, "n", color)) {
    const f = fileOf(ksq);
    const r = rankOf(ksq);
    if (f < 2 || f > 5 || r < 3 || r > 4) continue;
    let supported = false;
    for (const df of [-1, 1]) {
      const nf = f + df;
      const nr = r - dirUp;
      if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      const p = board.get(squareAt(nf, nr));
      if (p && p.color === color && p.type === "p") {
        supported = true;
        break;
      }
    }
    if (!supported) continue;
    let attacked = false;
    for (const df of [-1, 1]) {
      const nf = f + df;
      const nr = r + dirUp;
      if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      const p = board.get(squareAt(nf, nr));
      if (p && p.color === other(color) && p.type === "p") {
        attacked = true;
        break;
      }
    }
    if (!attacked) return true;
  }
  return false;
};

// Translation of BinProp "stm_minority_pawn_majority_lever" (chess/glm-5.2).
const minorityPawnMajorityLever = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const pawnsOnFiles = (c: Color, files: number[]): number => {
    let n = 0;
    for (const sq of piecesOf(board, "p", c)) {
      if (files.includes(fileOf(sq))) n += 1;
    }
    return n;
  };
  const stmTotal = countPieces(board, "p", color);
  const oppTotal = countPieces(board, "p", opp);
  if (stmTotal < oppTotal) return false;
  const centerStm = pawnsOnFiles(color, [3, 4]);
  const centerOpp = pawnsOnFiles(opp, [3, 4]);
  if (centerStm > centerOpp && centerOpp <= 2) return true;
  const wingStm = pawnsOnFiles(color, [0, 1, 2, 5, 6, 7]);
  const wingOpp = pawnsOnFiles(opp, [0, 1, 2, 5, 6, 7]);
  if (wingStm > wingOpp && stmTotal > oppTotal) return true;
  return false;
};

// Translation of BinProp "stm_attacks_hanging_opp_king_neighbor" (chess/glm-5.2).
const attacksHangingOppKingNeighbor = (board: Chess, color: Color): boolean => {
  const opp = other(color);
  const val: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const kingSq = piecesOf(board, "k", opp)[0];
  if (!kingSq) return false;
  const kingFile = fileOf(kingSq);
  const kingRank = rankOf(kingSq);
  const neighbors = new Set<string>();
  for (const df of [-1, 0, 1]) {
    for (const dr of [-1, 0, 1]) {
      if (df === 0 && dr === 0) continue;
      const nf = kingFile + df;
      const nr = kingRank + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) neighbors.add(squareAt(nf, nr));
    }
  }
  for (const mv of board.moves({ verbose: true })) {
    const to = mv.to;
    const atk = mv.piece;
    if (atk === "k") continue;
    if (!neighbors.has(to)) continue;
    const av = val[atk]!;
    const capture = mv.isCapture();
    const destDefended = board.attackers(to, opp).length > 0;
    let safe = true;
    if (capture) {
      const tp = board.get(to);
      if (tp) {
        const tv = val[tp.type] ?? 0;
        if (destDefended && av > tv) {
          let rcok = false;
          for (const r of board.attackers(to, color)) {
            const rp = board.get(r);
            if (!rp || r === mv.from) continue;
            if (rp.type !== "k" && val[rp.type]! <= av) {
              rcok = true;
              break;
            }
          }
          if (!rcok) safe = false;
        }
      }
    } else {
      if (destDefended && av >= 3) safe = false;
    }
    if (safe) return true;
  }
  return false;
};

// Translation of BinProp "dangerous advanced passed pawn" (chess/claude-opus-5).
const PASSER_MATERIAL: ReadonlyArray<[PieceSymbol, number]> = [
  ["p", 1.0],
  ["n", 3.0],
  ["b", 3.2],
  ["r", 5.0],
  ["q", 9.0],
];

const passerMaterial = (board: Chess, c: Color): number => {
  let t = 0;
  for (const [type, v] of PASSER_MATERIAL) {
    t += v * countPieces(board, type, c);
  }
  return t;
};

const passerRel = (sq: Square, c: Color): number =>
  c === "w" ? rankOf(sq) : 7 - rankOf(sq);

const isPassed = (board: Chess, sq: Square, _c: Color, d: number, o: Color): boolean => {
  const f = fileOf(sq);
  const r = rankOf(sq);
  for (const df of [-1, 0, 1]) {
    const nf = f + df;
    if (nf < 0 || nf > 7) continue;
    let rr = r + d;
    while (rr >= 0 && rr <= 7) {
      const p = board.get(squareAt(nf, rr));
      if (p && p.type === "p" && p.color === o) return false;
      rr += d;
    }
  }
  return true;
};

const passerValue = (board: Chess, sq: Square, c: Color, d: number, o: Color): number => {
  const f = fileOf(sq);
  const r = rankOf(sq);
  let v = passerRel(sq, c);
  const stop = squareAt(f, r + d);
  const sp = board.get(stop);
  if (sp) v -= sp.color === o ? 1.5 : 0.5;
  const na = board.attackers(stop, o).length;
  const nd = board.attackers(stop, c).length;
  if (na > nd) v -= 1.0;
  else if (nd > na) v += 0.5;
  let clear = true;
  let rr = r + d;
  while (rr >= 0 && rr <= 7) {
    if (board.get(squareAt(f, rr))) {
      clear = false;
      break;
    }
    rr += d;
  }
  if (clear) v += 0.5;
  const br = r - d;
  if (br >= 0 && br <= 7) {
    for (const df of [-1, 1]) {
      const nf = f + df;
      if (nf >= 0 && nf <= 7) {
        const p = board.get(squareAt(nf, br));
        if (p && p.color === c && p.type === "p") {
          v += 0.75;
          break;
        }
      }
    }
  }
  rr = r - d;
  while (rr >= 0 && rr <= 7) {
    const p = board.get(squareAt(f, rr));
    if (p) {
      if (p.type === "r" || p.type === "q") v += p.color === c ? 0.5 : -0.5;
      break;
    }
    rr -= d;
  }
  return v;
};

const bestPasser = (board: Chess, c: Color): number => {
  const o = other(c);
  const d = c === "w" ? 1 : -1;
  const passers: Square[] = [];
  for (const sq of piecesOf(board, "p", c)) {
    const rl = passerRel(sq, c);
    if (rl < 2 || rl > 6) continue;
    if (isPassed(board, sq, c, d, o)) passers.push(sq);
  }
  const files = new Set(passers.map((sq) => fileOf(sq)));
  let best = 0.0;
  for (const sq of passers) {
    let v = passerValue(board, sq, c, d, o);
    const f = fileOf(sq);
    if (files.has(f - 1) || files.has(f + 1)) v += 0.75;
    if (v > best) best = v;
  }
  return best;
};

const dangerousAdvancedPassedPawn = (board: Chess, color: Color): boolean => {
  if (passerMaterial(board, color) < passerMaterial(board, other(color)) - 0.5) {
    return false;
  }
  const bu = bestPasser(board, color);
  if (bu < 3.5) return false;
  return bu - bestPasser(board, other(color)) >= 1.5;
};

export const SPIKE_MOTIFS: Motif[] = [
  defineMotif({
    name: "stm_material_advantage_two_or_more",
    description:
      "The side to move has at least two points more total piece value (pawn=1, knight/bishop=3, rook=5, queen=9) than the opponent.",
    delta: 0.15301,
    library: "chess/glm-5.2",
    motif: materialAdvantageTwoOrMore,
  }),
  defineMotif({
    name: "stm_bishop_pair_advantage",
    description:
      "The side to move has the bishop pair while the opponent has at most one bishop.",
    delta: 0.0261,
    library: "chess/glm-5.2",
    motif: bishopPairAdvantage,
  }),
  defineMotif({
    name: "stm_central_knight_outpost",
    description:
      "The side to move has a knight on a central square (files c-f, ranks 4-5) defended by a friendly pawn and not attackable by any enemy pawn.",
    delta: 0.01452,
    library: "chess/glm-5.2",
    motif: centralKnightOutpost,
  }),
  defineMotif({
    name: "stm_minority_pawn_majority_lever",
    description:
      "The side to move has more pawns than the opponent on either the same-file center pair (d+e files) or on both wings combined (a-c plus f-h files), with total pawn count at least equal, indicating a lever-ready structural edge.",
    delta: 0.34551,
    library: "chess/glm-5.2",
    motif: minorityPawnMajorityLever,
  }),
  defineMotif({
    name: "stm_attacks_hanging_opp_king_neighbor",
    description:
      "The side to move has at least one legal, non-sacrificial check or capture on a square adjacent to the opponent king.",
    delta: 0.02244,
    library: "chess/glm-5.2",
    motif: attacksHangingOppKingNeighbor,
  }),
  defineMotif({
    name: "dangerous advanced passed pawn",
    description:
      "The side to move owns a clearly more dangerous passed pawn than the opponent - advanced, unblockaded, with a clear or well controlled promotion path and pawn, neighbour-passer or heavy-piece support - while not being down material.",
    delta: 0.04999,
    library: "chess/claude-opus-5",
    motif: dangerousAdvancedPassedPawn,
  }),
];
