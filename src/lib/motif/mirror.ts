import { Chess } from "chess.js";
import type { Color, Square } from "chess.js";

/**
 * Replicates python-chess Board.mirror().fen() exactly: the board is flipped
 * vertically, piece colors are swapped, the turn flips, castling rights swap
 * case, the en passant square flips rank, and the en passant field is only
 * printed when a legal en passant capture exists (python-chess fen() default).
 */
export function mirrorFen(fen: string): string {
  const fields = fen.split(" ");
  const placement = fields[0] ?? "";
  const turn = fields[1] ?? "w";
  const castling = fields[2] ?? "-";
  const ep = fields[3] ?? "-";
  const halfmove = fields[4] ?? "0";
  const fullmove = fields[5] ?? "1";
  const mirroredPlacement = placement
    .split("/")
    .reverse()
    .map((rank) =>
      rank
        .split("")
        .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
        .join(""),
    )
    .join("/");
  const mirroredTurn = turn === "w" ? "b" : "w";
  const mirroredCastling =
    castling === "-"
      ? "-"
      : ["K", "Q", "k", "q"]
          .filter((c) => {
            const swapped = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
            return castling.includes(swapped);
          })
          .join("");

  let mirroredEp = "-";
  if (ep !== "-") {
    const flipped = (ep[0] ?? "e") + String(9 - Number(ep[1] ?? "1"));
    const probe = new Chess(
      [mirroredPlacement, mirroredTurn, mirroredCastling, flipped, halfmove, fullmove].join(
        " ",
      ),
    );
    const epLegal = probe
      .moves({ verbose: true })
      .some((m) => m.isEnPassant() && m.to === (flipped as Square));
    if (epLegal) mirroredEp = flipped;
  }

  return [mirroredPlacement, mirroredTurn, mirroredCastling, mirroredEp, halfmove, fullmove].join(" ");
}

/**
 * Replicates python-chess "board.turn = color; board.fen()": forces the side to
 * move. Inputs are python-normalized FENs, where a printed en passant square is
 * only ever legal for the side to move, so forcing the turn always drops it.
 */
export function withTurn(fen: string, color: Color): string {
  const fields = fen.split(" ");
  if (fields[1] === color) return fen;
  return [fields[0] ?? "", color, fields[2] ?? "-", "-", fields[4] ?? "0", fields[5] ?? "1"].join(" ");
}
