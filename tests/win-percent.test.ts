import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { classifyMove, DEFAULT_THRESHOLDS, isBadMove } from "../src/lib/analysis/classify.ts";
import { winPercent } from "../src/lib/analysis/win-percent.ts";
import { evenlySpaced } from "../src/lib/analysis/continuation.ts";

describe("winPercent", () => {
  it("is 50 at equality", () => {
    expect(winPercent(0)).toBeCloseTo(50, 10);
  });

  it("is symmetric around 50", () => {
    expect(winPercent(100) - 50).toBeCloseTo(50 - winPercent(-100), 8);
  });

  it("is monotonic and saturates near mate scores", () => {
    expect(winPercent(50)).toBeLessThan(winPercent(100));
    expect(winPercent(100)).toBeLessThan(winPercent(1000));
    expect(winPercent(100_000)).toBeGreaterThan(99.9);
    expect(winPercent(-100_000)).toBeLessThan(0.1);
  });

  it("has known values near the lichess curve", () => {
    expect(winPercent(100)).toBeCloseTo(59.1, 1);
    expect(winPercent(-100)).toBeCloseTo(40.9, 1);
    expect(winPercent(300)).toBeCloseTo(75.1, 1);
  });
});

describe("classifyMove", () => {
  const input = (
    drop: number,
    playedIsBest = false,
    margin: number | null = null,
    winBefore: number | null = 50,
    inCheck = false,
  ) => ({
    playedIsBest,
    drop,
    marginOverSecond: margin,
    winBefore,
    inCheck,
  });

  it("labels played best moves", () => {
    expect(classifyMove(input(0, true, null))).toBe("best");
  });

  it("labels great (only) moves when the margin is large", () => {
    expect(classifyMove(input(0, true, DEFAULT_THRESHOLDS.greatMargin))).toBe("great");
    expect(classifyMove(input(0, true, DEFAULT_THRESHOLDS.greatMargin - 0.01))).toBe("best");
    expect(classifyMove(input(0, true, null))).toBe("best");
  });

  it("suppresses great in decided positions", () => {
    expect(classifyMove(input(0, true, DEFAULT_THRESHOLDS.greatMargin, 95))).toBe("best");
    expect(classifyMove(input(0, true, DEFAULT_THRESHOLDS.greatMargin, 5))).toBe("best");
    expect(classifyMove(input(0, true, DEFAULT_THRESHOLDS.greatMargin, 75))).toBe("great");
  });

  it("suppresses great for forced check evasions", () => {
    expect(classifyMove(input(0, true, DEFAULT_THRESHOLDS.greatMargin, 75, true))).toBe("best");
  });

  it("labels non-best moves by win% drop", () => {
    expect(classifyMove(input(0.5))).toBe("excellent");
    expect(classifyMove(input(3))).toBe("good");
    expect(classifyMove(input(7))).toBe("inaccuracy");
    expect(classifyMove(input(15))).toBe("mistake");
    expect(classifyMove(input(25))).toBe("blunder");
  });

  it("uses exact threshold boundaries consistently", () => {
    expect(classifyMove(input(5))).toBe("inaccuracy");
    expect(classifyMove(input(4.999))).toBe("good");
    expect(classifyMove(input(20))).toBe("blunder");
    expect(classifyMove(input(19.999))).toBe("mistake");
  });

  it("identifies bad moves", () => {
    expect(isBadMove("inaccuracy")).toBe(true);
    expect(isBadMove("mistake")).toBe(true);
    expect(isBadMove("blunder")).toBe(true);
    expect(isBadMove("best")).toBe(false);
    expect(isBadMove("good")).toBe(false);
  });
});

describe("evenlySpaced", () => {
  it("returns the list when it fits", () => {
    expect(evenlySpaced([1, 2], 4)).toEqual([1, 2]);
  });

  it("samples evenly", () => {
    expect(evenlySpaced([1, 2, 3, 4, 5], 3)).toEqual([1, 3, 5]);
    expect(evenlySpaced([1, 2, 3, 4], 3)).toEqual([1, 3, 4]);
    expect(evenlySpaced([1, 2, 3, 4], 4)).toEqual([1, 2, 3, 4]);
  });
});

describe("chess.js move basics used by the pipeline", () => {
  it("reports uci (lan) including promotions", () => {
    const board = new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    const move = board.move("a8=Q");
    expect(move.lan).toBe("a7a8q");
  });

  it("detects checkmate after the played move", () => {
    const board = new Chess("r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4");
    board.move("Qxf7#");
    expect(board.isCheckmate()).toBe(true);
  });
});
