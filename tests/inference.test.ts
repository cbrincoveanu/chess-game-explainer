import { describe, expect, it } from "vitest";
import type { Color } from "chess.js";
import { inferMotifs, type PoolPosition } from "../src/lib/motif/inference.ts";
import { defineMotif, type Motif } from "../src/lib/motif/types.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const QFEN = "k7/8/8/8/8/8/8/K6Q w - - 0 1";
const NOQ = "k7/8/8/8/8/8/8/K7 w - - 0 1";

function pools(positive: string[], negative: string[]): {
  positive: PoolPosition[];
  negative: PoolPosition[];
} {
  return {
    positive: positive.map((fen) => ({ fen, color: "w" as Color })),
    negative: negative.map((fen) => ({ fen, color: "w" as Color })),
  };
}

describe("inferMotifs", () => {
  const hasQueen: Motif = defineMotif({
    name: "queen",
    description: "side to move has a queen",
    delta: 0.5,
    motif: (board, color) => board.findPiece({ type: "q", color }).length > 0,
  });
  const blackRookOnA8: Motif = defineMotif({
    name: "rook a8",
    description: "black rook still on a8",
    delta: 0.9,
    motif: (board) => board.get("a8")?.type === "r" && board.get("a8")?.color === "b",
  });
  const never: Motif = defineMotif({
    name: "never",
    description: "always false",
    delta: 0.01,
    motif: () => false,
  });
  const throwing: Motif = defineMotif({
    name: "throws",
    description: "throws on evaluation",
    delta: 0.5,
    motif: () => {
      throw new Error("boom");
    },
  });

  it("returns an empty selection for empty pools", () => {
    const noPositive = pools([], [START]);
    const noNegative = pools([START], []);
    expect(inferMotifs([hasQueen], noPositive.positive, noPositive.negative).selected).toEqual([]);
    expect(inferMotifs([hasQueen], noNegative.positive, noNegative.negative).selected).toEqual([]);
  });

  it("scores a perfect motif with fit 1", () => {
    const { positive, negative } = pools([START, QFEN], [NOQ, NOQ]);
    const result = inferMotifs([hasQueen], positive, negative);
    expect(result.selected[0]!.name).toBe("queen");
    expect(result.selected[0]!.supportFit).toBe(1);
    expect(result.selected[0]!.positiveTrueRate).toBe(1);
    expect(result.selected[0]!.negativeFalseRate).toBe(1);
    expect(result.selected[0]!.weightedScore).toBeCloseTo(0.5, 10);
    expect(result.usedFallback).toBe(false);
  });

  it("ranks by fit times delta, not delta alone", () => {
    // "queen": fit 1, delta 0.5 -> weighted 0.5
    // "rook a8": true on START only -> positiveTrueRate 0.5, fit 0.5,
    //            delta 0.9 -> weighted 0.45
    const { positive, negative } = pools([START, QFEN], [NOQ, NOQ]);
    const result = inferMotifs([blackRookOnA8, hasQueen], positive, negative);
    expect(result.selected[0]!.name).toBe("queen");
    expect(result.selected[0]!.weightedScore).toBeGreaterThan(result.selected[1]!.weightedScore);
  });

  it("keeps at most topK qualifying motifs", () => {
    const { positive, negative } = pools([START, QFEN], [NOQ, NOQ]);
    const motifs: Motif[] = [
      defineMotif({ name: "a", description: "a", delta: 0.4, motif: (b, c) => b.findPiece({ type: "q", color: c }).length > 0 }),
      defineMotif({ name: "b", description: "b", delta: 0.3, motif: (b, c) => b.findPiece({ type: "q", color: c }).length > 0 }),
      defineMotif({ name: "c", description: "c", delta: 0.2, motif: (b, c) => b.findPiece({ type: "q", color: c }).length > 0 }),
      defineMotif({ name: "d", description: "d", delta: 0.1, motif: (b, c) => b.findPiece({ type: "q", color: c }).length > 0 }),
    ];
    const result = inferMotifs(motifs, positive, negative);
    expect(result.selected.map((m) => m.name)).toEqual(["a", "b", "c"]);
  });

  it("falls back to the single best motif when none qualifies", () => {
    // Mixed pools: nothing achieves fit >= 0.5 (the motif is also true in the
    // negative pool, so negativeFalseRate is 0).
    const { positive, negative } = pools([QFEN, NOQ], [QFEN, QFEN]);
    const result = inferMotifs([hasQueen, never], positive, negative);
    expect(result.selected.length).toBe(1);
    expect(result.selected[0]!.name).toBe("queen");
    expect(result.usedFallback).toBe(true);
  });

  it("records evaluation errors and excludes those motifs", () => {
    const { positive, negative } = pools([START], [NOQ]);
    const result = inferMotifs([throwing, hasQueen], positive, negative);
    expect(result.errors.map((e) => e.name)).toEqual(["throws"]);
    expect(result.selected[0]!.name).toBe("queen");
  });

  it("ignores motifs with nonpositive delta", () => {
    const { positive, negative } = pools([START], [NOQ]);
    const negativeDelta: Motif = { ...hasQueen, delta: -0.5 };
    const zeroDelta: Motif = { ...hasQueen, delta: 0, name: "zero" };
    const result = inferMotifs([negativeDelta, zeroDelta, hasQueen], positive, negative);
    expect(result.ranked.map((m) => m.name)).toEqual(["queen"]);
  });
});
