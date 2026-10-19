import { Chess } from "chess.js";
import type { Color, PieceSymbol, Square } from "chess.js";
import { attacksFrom, fileOf, rankOf, squareAt } from "../motif/helpers.ts";

const CENTER: Square[] = ["d4", "d5", "e4", "e5"];
const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
const COLOR_NAMES: Record<Color, string> = { w: "White", b: "Black" };

function listSquares(squares: Square[]): string {
  return squares.length === 1 ? squares[0]! : squares.join(" and ");
}

/**
 * Deterministic move-effect facts: concrete, human-style observations of
 * what a single move *does*, computed as before→after deltas with chess.js
 * only (no engine). Rendered above the pool motifs, which then describe the
 * positional contrast instead of having to carry the whole explanation.
 */
export function describeMoveEffects(beforeFen: string, uci: string): string[] {
  const before = new Chess(beforeFen);
  const mover: Color = before.turn();
  const opponent: Color = mover === "w" ? "b" : "w";
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  let move;
  try {
    const step: { from: Square; to: Square; promotion?: string } = { from, to };
    if (uci.length > 4 && uci[4] !== undefined) step.promotion = uci[4];
    move = before.move(step);
  } catch {
    return [];
  }
  const after = before;
  const piece = move.piece;
  const facts: string[] = [];

  const enemyKing = after.findPiece({ type: "k", color: opponent })[0];
  const attackedFromDest = attacksFrom(after, to);

  // 1) Checkmate and check. Check flavors are exclusive: double check >
  //    discovered check > plain check.
  if (after.isCheckmate()) {
    return ["is checkmate — the game ends here"];
  }

  // 2) Captures (including en passant and promotions).
  if (move.captured) {
    const capturedName = PIECE_NAMES[move.captured as PieceSymbol];
    facts.push(`takes the ${COLOR_NAMES[opponent].toLowerCase()} ${capturedName} on ${to}`);
  }
  if (move.promotion) {
    facts.push(`promotes to a ${PIECE_NAMES[move.promotion as PieceSymbol]}`);
  }

  // 2b) Check flavors: double check > discovered check > plain check.
  if (after.isCheck() && enemyKing) {
    const checkers = after.attackers(enemyKing, mover);
    const movedPieceChecks = attackedFromDest.includes(enemyKing);
    if (movedPieceChecks && checkers.length >= 2) {
      facts.push("gives double check, forcing the king to move");
    } else if (!movedPieceChecks && checkers.length > 0) {
      facts.push("gives discovered check, forcing the opponent to respond");
    } else {
      facts.push("gives check, forcing the opponent to respond");
    }
  }

  // 3) Castling: king safety + rook connection.
  if (piece === "k" && Math.abs(fileOf(from) - fileOf(to)) === 2) {
    const side = fileOf(to) > fileOf(from) ? "short" : "long";
    facts.push(`castles ${side}, tucking the king away and connecting the rooks`);
  }

  // 4) Enemy pawn blocked: a pawn landing directly in front of an enemy pawn
  //    stops its advance (the 1...d5 vs 2.d5 point).
  if (piece === "p") {
    const enemyPush = opponent === "w" ? 1 : -1;
    const enemyRank = rankOf(to) - enemyPush;
    if (enemyRank >= 0 && enemyRank <= 7) {
      const blocker = new Chess(beforeFen).get(squareAt(fileOf(to), enemyRank));
      if (blocker && blocker.type === "p" && blocker.color === opponent) {
        facts.push(
          `blocks the advance of ${mover === "w" ? "Black" : "White"}'s ${String.fromCharCode(97 + fileOf(to))}-pawn`,
        );
      }
    }
  }

  // 5) Center control: squares the moved piece newly occupies or controls
  //    (attack sets from the destination square).
  const attacked = attacksFrom(after, to).filter((sq) => CENTER.includes(sq));
  if (CENTER.includes(to)) {
    const other: Square[] = [];
    for (const df of [-1, 1]) {
      const f = fileOf(to) + df;
      if (f < 0 || f > 7) continue;
      if (piece === "p") {
        const r = rankOf(to) + (mover === "w" ? 1 : -1);
        if (r >= 0 && r <= 7) other.push(squareAt(f, r));
      }
    }
    const controlled = piece === "p" ? other : attacked;
    facts.push(
      `stakes out the central square ${to}${controlled.length > 0 ? `, controlling ${listSquares(controlled)}` : ""}`,
    );
  } else if (attacked.length > 0) {
    facts.push(
      `attacks ${listSquares(attacked)}${attacked.some((s) => CENTER.includes(s)) ? " in the center" : ""} from ${to}`,
    );
  }

  // 6) Development: minor pieces (and the queen) leaving their home squares.
  if ((piece === "n" || piece === "b" || piece === "q") && !move.captured) {
    const homeRank = mover === "w" ? 0 : 7;
    if (rankOf(from) === homeRank) {
      facts.push(
        `brings the ${PIECE_NAMES[piece]} into the game on ${to}`,
      );
    }
  }

  // 7) Discovered attacks: own sliders whose attack sets grew thanks to this
  //    move, now eyeing enemy pieces. Quiet line-opening is boilerplate and
  //    stays silent. Among candidates, the most valuable target wins (a
  //    discovered attack on the queen beats one on a knight).
  const beforeBoard = new Chess(beforeFen);
  const discovered: { role: string; sq: Square; target: Square; value: number }[] = [];
  const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  for (const type of ["b", "r", "q"] as const) {
    for (const sq of after.findPiece({ type, color: mover })) {
      if (sq === to) continue;
      const newlyAttacked = attacksFrom(after, sq).filter(
        (target) => !attacksFrom(beforeBoard, sq).includes(target),
      );
      for (const target of newlyAttacked) {
        const occ = after.get(target);
        if (!occ || occ.color !== opponent || occ.type === "k") continue;
        discovered.push({
          role: type === "q" ? "queen" : type === "r" ? "rook" : "bishop",
          sq,
          target,
          value: PIECE_VALUES[occ.type],
        });
      }
    }
  }
  if (discovered.length > 0) {
    const best = discovered.sort((a, b) => b.value - a.value)[0]!;
    const occ = after.get(best.target)!;
    facts.push(
      `gives a discovered attack with the ${best.role} on ${best.sq} on the ${PIECE_NAMES[occ.type]} on ${best.target}`,
    );
  }

  // 8) King shield: a pawn leaving the king's shield — only when the vacated
  //    square is really weak, i.e. an enemy piece attacks it (or through it
  //    toward the king). Routine pawn moves stay silent.
  const kingSq = after.findPiece({ type: "k", color: mover })[0];
  if (piece === "p" && kingSq) {
    const kf = fileOf(kingSq);
    const kr = rankOf(kingSq);
    const nearKing =
      Math.abs(fileOf(from) - kf) <= 1 &&
      Math.abs(rankOf(from) - kr) <= 3 &&
      (mover === "w" ? rankOf(from) > kr : rankOf(from) < kr);
    const enemyAttackersOfFrom = before.attackers(from, opponent);
    if (nearKing && enemyAttackersOfFrom.length > 0) {
      facts.push(
        `loosens the shield in front of ${mover === "w" ? "White's" : "Black's"} king`,
      );
    }
  }

  // 9) Forks and attacks, value-aware: a real fork needs the targets to be
  //    worth winning — a queen forking two defended pawns is not a fork, a
  //    knight forking queen and rook always is. The king always counts.
  const attackerValue =
    piece === "p" ? 1 : piece === "n" || piece === "b" ? 3 : piece === "r" ? 5 : piece === "q" ? 9 : 100;
  interface Target {
    sq: Square;
    type: PieceSymbol;
    isKing: boolean;
    defended: boolean;
    value: number;
  }
  const targets: Target[] = [];
  for (const sq of attackedFromDest) {
    const occ = after.get(sq);
    if (!occ || occ.color !== opponent) continue;
    const value =
      occ.type === "p" ? 1 : occ.type === "n" || occ.type === "b" ? 3 : occ.type === "r" ? 5 : 9;
    const defended = after.attackers(sq, opponent).length > 0;
    const isKing = occ.type === "k";
    if (!isKing && value < 3) continue; // pawns are not fork targets
    // A defended target cheaper than the attacker is no real target:
    // capturing it loses material.
    if (!isKing && defended && value <= attackerValue) continue;
    targets.push({ sq, type: occ.type, isKing, defended, value });
  }
  if (targets.length >= 2) {
    const named = targets
      .slice(0, 3)
      .map((t) => `${t.isKing ? "the king" : `the ${PIECE_NAMES[t.type]}`} on ${t.sq}`);
    facts.push(`forks ${joinAnd(named)}`);
  } else if (targets.length === 1 && !targets[0]!.isKing) {
    const t = targets[0]!;
    facts.push(
      `attacks the ${PIECE_NAMES[t.type]} on ${t.sq}${t.defended ? "" : ", which hangs"}`,
    );
  }

  // 11b) Promotion threat: the moved pawn is one step from promotion.
  if (piece === "p") {
    const relRank = mover === "w" ? rankOf(to) : 7 - rankOf(to);
    if (relRank === 6) {
      const promo = squareAt(fileOf(to), mover === "w" ? 7 : 0);
      const blocker = after.get(promo);
      if (!blocker || blocker.color === opponent) {
        facts.push(`is one step from promotion (${promo}-square)`);
      }
    }
  }

  // 11c) The moved piece hangs: attacked by the opponent and not worth the
  //      risk (undefended, or captureable by something cheaper).
  if (piece !== "k" && piece !== "p" && !after.isCheck()) {
    const enemyAttackers = after.attackers(to, opponent);
    const defenders = after.attackers(to, mover);
    if (
      enemyAttackers.length > 0 &&
      (defenders.length === 0 ||
        Math.min(...enemyAttackers.map((sq) => {
          const p = after.get(sq);
          return p ? (p.type === "p" ? 1 : p.type === "n" || p.type === "b" ? 3 : p.type === "r" ? 5 : 9) : 100;
        })) < (piece === "n" || piece === "b" ? 3 : piece === "r" ? 5 : 9))
    ) {
      facts.push(
        `leaves the ${PIECE_NAMES[piece]} on ${to} attacked and undefended`,
      );
    }
  }

  // 11a) Pins by the moved piece: an enemy piece on a line from `to` to its
  //     own king, attacked by this piece, unable to move away safely.
  //     Only line pieces (bishop, rook, queen) pin: pawns and knights attack
  //     adjacent squares/patterns and cannot attack *through* a piece.
  if (enemyKing && (piece === "b" || piece === "r" || piece === "q")) {
    const pinned = findPinFrom(after, to, opponent, enemyKing);
    if (pinned) {
      facts.push(
        `pins the ${PIECE_NAMES[pinned.type]} on ${pinned.sq} to the king`,
      );
    }
  }

  // Cap the facts, tactical-first: forks, pins, discovered attacks, checks
  // and captures are the story of a move; positional observations fill the
  // remaining slots. Three facts are plenty either way.
  return rankFacts(facts).slice(0, 3);
}

/** Tactical keywords sort before positional boilerplate; ties keep order. */
function rankFacts(facts: string[]): string[] {
  const tactical = [
    "is checkmate",
    "gives double check",
    "gives discovered check",
    "gives check",
    "forks",
    "gives a discovered attack",
    "pins the",
    "is one step from promotion",
  ];
  const rank = (fact: string): number => {
    const idx = tactical.findIndex((k) => fact.startsWith(k));
    return idx === -1 ? tactical.length : idx;
  };
  return facts
    .map((fact, i) => ({ fact, i, r: rank(fact) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((entry) => entry.fact);
}

function joinAnd(parts: string[]): string {
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
}

const RAY_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [1, -1],
  [0, 1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [-1, -1],
];

/** True if the piece on `from` slides toward `dir` (bishop/rook/queen ray). */
function slidesToward(piece: PieceSymbol, df: number, dr: number): boolean {
  const diagonal = df !== 0 && dr !== 0;
  if (piece === "b") return diagonal;
  if (piece === "r") return !diagonal;
  if (piece === "q") return true;
  return false;
}

/** Finds an enemy piece pinned by the piece standing on `from` (this move's
 * destination): first enemy piece on a slider/pawn ray, with its own king
 * strictly behind it on the same line. */
function findPinFrom(
  board: Chess,
  from: Square,
  opponent: Color,
  enemyKing: Square,
): { sq: Square; type: PieceSymbol } | null {
  const piece = board.get(from);
  if (!piece) return null;
  const f = fileOf(from);
  const r = rankOf(from);
  const kf = fileOf(enemyKing);
  const kr = rankOf(enemyKing);
  for (const [df, dr] of RAY_DIRS) {
    // Only line pieces pin (pawns/knights are excluded by the caller).
    if (!slidesToward(piece.type, df, dr)) {
      continue;
    }
    let nf = f + df;
    let nr = r + dr;
    let first: { sq: Square; type: PieceSymbol } | null = null;
    while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
      const sq = squareAt(nf, nr);
      const occ = board.get(sq);
      if (occ) {
        if (!first) {
          if (occ.color !== opponent || occ.type === "k") break; // not a pinnable target
          first = { sq, type: occ.type };
        } else {
          // Second piece on the ray: a pin only if it is the enemy king.
          if (occ.type === "k" && occ.color === opponent) {
            return first;
          }
          break;
        }
      }
      nf += df;
      nr += dr;
    }
  }
  void kf;
  void kr;
  return null;
}