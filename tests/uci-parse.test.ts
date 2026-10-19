import { describe, expect, it } from "vitest";
import {
  MATE_CP,
  parseBestmove,
  parseInfoLine,
  scoreToCentipawns,
} from "../src/lib/engine/uci.ts";

describe("parseInfoLine", () => {
  it("parses a multipv line with a cp score", () => {
    const line = parseInfoLine(
      "info depth 12 seldepth 15 multipv 1 score cp 34 nodes 123456 nps 1000000 hashfull 0 tbhits 0 time 123 pv e2e4 e7e5 g1f3",
    );
    expect(line).not.toBeNull();
    expect(line!.multipv).toBe(1);
    expect(line!.depth).toBe(12);
    expect(line!.scoreCp).toBe(34);
    expect(line!.mate).toBeNull();
    expect(line!.pv).toEqual(["e2e4", "e7e5", "g1f3"]);
  });

  it("defaults multipv to 1 when absent", () => {
    const line = parseInfoLine("info depth 5 score cp -12 pv d2d4");
    expect(line!.multipv).toBe(1);
    expect(line!.scoreCp).toBe(-12);
  });

  it("parses mate scores", () => {
    const line = parseInfoLine("info depth 9 multipv 2 score mate -3 pv h8h7");
    expect(line!.mate).toBe(-3);
    expect(line!.scoreCp).toBeNull();
  });

  it("ignores lines without pv or score", () => {
    expect(parseInfoLine("info depth 1 currmove a2a3 currmovenodes 1")).toBeNull();
    expect(parseInfoLine("info string NNUE evaluation using nn-61e7af4bb97d")).toBeNull();
    expect(parseInfoLine("uciok")).toBeNull();
    expect(parseInfoLine("")).toBeNull();
  });
});

describe("parseBestmove", () => {
  it("parses bestmove with ponder", () => {
    expect(parseBestmove("bestmove e2e4 ponder e7e5")).toEqual({
      bestmove: "e2e4",
      ponder: "e7e5",
    });
  });

  it("parses bestmove without ponder", () => {
    expect(parseBestmove("bestmove g1f3")).toEqual({ bestmove: "g1f3", ponder: null });
  });

  it("handles bestmove (none)", () => {
    expect(parseBestmove("bestmove (none)")).toBeNull();
  });
});

describe("scoreToCentipawns", () => {
  it("maps mate scores to large centipawns", () => {
    expect(scoreToCentipawns({ scoreCp: null, mate: 3 })).toBe(MATE_CP - 3);
    expect(scoreToCentipawns({ scoreCp: null, mate: -5 })).toBe(-(MATE_CP - 5));
    expect(scoreToCentipawns({ scoreCp: 25, mate: null })).toBe(25);
    expect(scoreToCentipawns({ scoreCp: null, mate: 0 })).toBe(-MATE_CP);
  });
});
