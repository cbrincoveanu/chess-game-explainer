import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { mirrorFen, withTurn } from "../src/lib/motif/mirror.ts";
import { LIBRARY } from "../src/lib/motif/library/index.ts";

interface MirrorPair {
  fen: string;
  mirrored: string;
}

const pairs: MirrorPair[] = JSON.parse(readFileSync("fixtures/mirror.json", "utf8"));

describe("mirrorFen matches python-chess Board.mirror().fen()", () => {
  it("all corpus positions", () => {
    const bad = pairs.filter((p) => mirrorFen(p.fen) !== p.mirrored);
    if (bad.length > 0) {
      console.error(
        "first 5 mismatches:",
        bad.slice(0, 5).map((p) => ({ fen: p.fen, expected: p.mirrored, actual: mirrorFen(p.fen) })),
      );
    }
    expect(bad).toEqual([]);
  });

  it("flips turn, placement and castling on a known position", () => {
    expect(mirrorFen("4k3/4p3/8/8/8/8/8/4K3 b - - 3 7")).toBe(
      "4k3/8/8/8/8/8/4P3/4K3 w - - 3 7",
    );
  });

  it("keeps a legal en passant square legal after mirroring", () => {
    expect(mirrorFen("rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3")).toBe(
      "rnbqkbnr/pppp1ppp/8/8/3Pp3/P7/1PP1PPPP/RNBQKBNR b KQkq d3 0 3",
    );
  });
});

describe("withTurn replicates python-chess turn forcing", () => {
  it("returns the fen unchanged when the turn already matches", () => {
    const fen = "rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3";
    expect(withTurn(fen, "w")).toBe(fen);
  });

  it("drops the en passant square when flipping the turn", () => {
    expect(
      withTurn("rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3", "b"),
    ).toBe("rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3");
  });
});

describe("motif color symmetry under mirror (BinProp validate_symmetry)", () => {
  const sample = pairs.slice(0, 80);
  for (const { name, motif } of LIBRARY) {
    it(`${name} is mirror-symmetric`, () => {
      const violations: { fen: string }[] = [];
      for (const { fen } of sample) {
        const mirrored = mirrorFen(fen);
        const origWhite = motif(new Chess(withTurn(fen, "w")), "w");
        const origBlack = motif(new Chess(withTurn(fen, "b")), "b");
        const mirroredWhite = motif(new Chess(withTurn(mirrored, "w")), "w");
        const mirroredBlack = motif(new Chess(withTurn(mirrored, "b")), "b");
        if (mirroredWhite !== origBlack || mirroredBlack !== origWhite) {
          violations.push({ fen });
        }
      }
      if (violations.length > 0) {
        console.error(`first 5 symmetry violations for ${name}:`, violations.slice(0, 5));
      }
      expect(violations).toEqual([]);
    });
  }
});
