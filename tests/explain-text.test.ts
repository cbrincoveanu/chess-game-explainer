import { describe, expect, it } from "vitest";
import type { PlyAnalysis, Explanation } from "../src/lib/analysis/types.ts";
import type { SelectedMotif } from "../src/lib/motif/inference.ts";
import { renderExplanation } from "../src/ui/explain-text.ts";


const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function basePly(overrides: Partial<PlyAnalysis>): PlyAnalysis {
  return {
    ply: 1,
    moveNumber: 1,
    color: "w",
    san: "Nc3",
    uci: "b1c3",
    beforeFen: START,
    afterFen: "",
    bestMoveUci: "e2e4",
    bestLine: null,
    secondLine: null,
    bestCp: 30,
    playedCp: 10,
    winBefore: 60,
    winAfter: 50,
    drop: 10,
    marginOverSecond: null,
    evalDepth: null,
    classification: "mistake",
    ms: 0,
    ...overrides,
  };
}

function selected(name: string, description: string, fit = 1): SelectedMotif {
  return {
    id: name,
    name,
    description,
    delta: 0.2,
    positiveTrueRate: fit,
    negativeFalseRate: fit,
    supportFit: fit,
    weightedScore: fit * 0.2,
    facts: [],
  };
}

function explanation(overrides: Partial<Explanation>): Explanation {
  return {
    ply: 1,
    positiveCount: 4,
    negativeCount: 4,
    target: "played",
    positiveLine: [],
    positivePooledSan: [],
    negativeLine: [],
    negativePooledSan: [],
    selected: [],
    usedFallback: false,
    ...overrides,
  };
}

describe("renderExplanation", () => {
  it("phrases mistakes in conditional mood, with the engine line labeled as hypothetical", () => {
    const out = renderExplanation(
      basePly({}),
      explanation({
        selected: [selected("stm_bishop_pair_advantage", "The side to move has the bishop pair while the opponent has at most one bishop.")],
      }),
    );
    expect(out.headline).toContain("Nc3 lets Black take over the initiative");
    expect(out.headline).toContain("Playing e4 instead");
    expect(out.headline).toContain("would have kept");
    expect(out.motifs[0]!.text).toContain("White");
    expect(out.note).toContain("hypothetical");
    expect(out.positiveLabel).toContain("as if White played e4");
    expect(out.negativeLabel).toContain("as played");
  });

  it("uses Black for black moves", () => {
    const out = renderExplanation(
      basePly({ color: "b", san: "b5", uci: "b7b5", bestMoveUci: "c7c6", classification: "blunder" }),
      explanation({ target: "played", selected: [selected("m", "The side to move has a passed pawn.")] }),
    );
    expect(out.headline).toContain("c6");
    expect(out.motifs[0]!.text).toContain("Black");
  });

  it("phrases great moves with the SAN of the engine's second choice", () => {
    const out = renderExplanation(
      basePly({
        san: "e4",
        uci: "e2e4",
        bestMoveUci: "e2e4",
        marginOverSecond: 5.5,
        secondLine: { multipv: 2, depth: 10, scoreCp: 5, mate: null, pv: ["d2d4"] },
        classification: "great",
      }),
      explanation({ target: "second-best", selected: [selected("m", "The side to move has more space.")] }),
    );
    expect(out.headline).toBe("e4 is clearly best — unlike d4, it would keep:");
    expect(out.negativeLabel).toContain("Line after the alternative d4");
  });

  it("uses soft phrasing for great moves without a large margin", () => {
    const after1d4 = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";
    const out = renderExplanation(
      basePly({
        color: "b",
        san: "d5",
        uci: "d7d5",
        beforeFen: after1d4,
        bestMoveUci: "e7e6",
        marginOverSecond: 0.3,
        secondLine: { multipv: 2, depth: 10, scoreCp: 5, mate: null, pv: ["d7d5"] },
        classification: "best",
      }),
      explanation({ target: "second-best", selected: [selected("m", "The side to move has more space.")] }),
    );
    expect(out.headline).toBe("d5 is a good move — unlike d5, it would keep:");
  });

  it("sorts motifs by fit, caps the count, and marks weak fits", () => {
    const many = [
      selected("weak1", "The side to move has a passed pawn.", 0.5),
      selected("strong", "The side to move has more space.", 1),
      selected("mid", "The side to move attacks more.", 0.75),
      selected("weak2", "The side to move has a fork.", 0.55),
    ];
    const out = renderExplanation(
      basePly({}),
      explanation({ selected: many }),
    );
    expect(out.motifs.length).toBe(4);
    expect(out.motifs.map((m) => m.name)).toEqual(["strong", "mid", "weak2", "weak1"]);
    expect(out.motifs.find((m) => m.name === "strong")!.weak).toBe(false);
    expect(out.motifs.find((m) => m.name === "weak1")!.weak).toBe(true);
    expect(out.motifs.find((m) => m.name === "weak2")!.weak).toBe(true);

    const overflow = [
      selected("first", "The side to move has more space.", 0.9),
      ...Array.from({ length: 6 }, (_, i) => selected(`m${i}`, "The side to move attacks more.", 0.8)),
    ];
    expect(renderExplanation(basePly({}), explanation({ selected: overflow })).motifs.length).toBe(5);
  });

  it("handles the only-move case", () => {
    const out = renderExplanation(
      basePly({ san: "Nxb8", uci: "d7b8", bestMoveUci: "d7b8", classification: "best" }),
      explanation({ target: "second-best", positiveCount: 4, negativeCount: 0, selected: [] }),
    );
    expect(out.headline).toBe("Nxb8 is the only move.");
  });

  it("handles game-ending moves", () => {
    const out = renderExplanation(
      basePly({ san: "Rd8#", uci: "d1d8", bestMoveUci: "d1d8", playedCp: 100_000, classification: "great" }),
      explanation({ target: "played", positiveCount: 4, negativeCount: 0, selected: [] }),
    );
    expect(out.headline).toBe("Rd8# ends the game.");
  });

  it("explains the fallback case honestly", () => {
    const out = renderExplanation(
      basePly({}),
      explanation({ selected: [selected("m", "The side to move has a passed pawn.")], usedFallback: true }),
    );
    expect(out.note).toContain("rough indication");
  });
});
