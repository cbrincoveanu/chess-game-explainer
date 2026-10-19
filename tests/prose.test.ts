import { describe, expect, it } from "vitest";
import { joinFragments, renderProse } from "../src/ui/explain-text.ts";
import type { ProseInput } from "../src/ui/explain-text.ts";

function input(overrides: Partial<ProseInput>): ProseInput {
  return {
    san: "Bc4",
    color: "w",
    moveNumber: 6,
    classification: "good",
    drop: 0.3,
    bestSan: "Qb3",
    moveEffects: [
      "attacks d5 in the center from c4",
      "brings the bishop into the game on c4",
    ],
    mateThreat: null,
    refutation: null,
    motifs: [
      {
        name: "king_attack_pressure",
        text: "White attacks far more squares around the opponent king than vice versa",
        fit: 0.75,
        facts: ["attacks 3 squares in the enemy king's zone around e8 (e6, f6, f7)"],
      },
    ],
    target: "second-best",
    negativePooledSan: ["Nc3"],
    ...overrides,
  };
}

describe("renderProse", () => {
  it("compiles quality, effects, threat and contrast into prose", () => {
    const prose = renderProse(input({}));
    expect(prose[0]).toBe(
      "6. Bc4 is a good move. It attacks d5 in the center from c4 and brings the bishop into the game on c4.",
    );
    expect(prose[1]).toContain("Compared with weaker moves like Nc3");
    expect(prose[1]).toContain("White attacks far more squares around the opponent king");
    expect(prose[1]).toContain("attacks 3 squares in the enemy king's zone");
    expect(prose.length).toBe(2);
  });

  it("mentions the mating threat in prose", () => {
    const prose = renderProse(
      input({ mateThreat: { san: "Qxf7#", mateIn: 1 } }),
    );
    expect(prose[0]).toContain("creates a mating threat: Qxf7#");
  });

  it("checkmate short-circuits the effects sentence", () => {
    const prose = renderProse(
      input({ moveEffects: ["is checkmate — the game ends here"], classification: "best" }),
    );
    expect(prose[0]).toContain("is the engine's top choice. Bc4 is checkmate — the game ends here.");
  });

  it("mistakes lead with the quality sentence and the refutation, not positional contrast", () => {
    const prose = renderProse(
      input({
        san: "e5",
        color: "b",
        moveNumber: 16,
        classification: "blunder",
        drop: 22.3,
        bestSan: "Qc7",
        moveEffects: ["stakes out the central square e5"],
        refutation: {
          san: "Ne6",
          uci: "d4e6",
          capture: false,
          mate: false,
          effects: [
            "gives a discovered attack with the rook on d1 on the queen on d8",
            "forks the rook on f8 and the queen on d8",
          ],
        },
        target: "played",
        negativePooledSan: [],
      }),
    );
    expect(prose[0]).toContain("16... e5 is a blunder (loses 22.3% win probability)");
    expect(prose[0]).toContain("White answers Ne6");
    expect(prose[0]).toContain("gives a discovered attack with the rook on d1 on the queen on d8");
    expect(prose[0]).toContain("forks the rook on f8 and the queen on d8");
    // No positional contrast paragraph on blunders.
    expect(prose.length).toBe(1);
  });
});

describe("joinFragments", () => {
  it("joins fragments", () => {
    expect(joinFragments(["a", "b", "c"])).toBe("a, b and c");
    expect(joinFragments(["a", "b"])).toBe("a and b");
  });
  it("handles one and zero parts", () => {
    expect(joinFragments(["a"])).toBe("a");
    expect(joinFragments([])).toBe("");
  });
});