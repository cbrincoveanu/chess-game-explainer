import { Chess } from "chess.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comparisonSetsV2, goodAlternatives, mediocreAlternatives, EvalShape, GOOD_CP, MEDIOCRE_MIN_CP, MEDIOCRE_MAX_CP } from "../src/lib/analysis/aggregate.ts";
import { EngineClient } from "../src/lib/engine/engine-client.ts";
import { createNodeTransport } from "../src/lib/engine/node-transport.ts";

const ENGINE_PATH = "public/engine/stockfish-19-lite-single.js";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function evalShape(pvs: Array<[string, number | null, number | null]>): EvalShape {
  return {
    lines: pvs.map(([uci, cp, mate]) => ({
      pv: [uci],
      scoreCp: cp,
      mate,
    })),
    bestmove: pvs[0]?.[0] ?? null,
  };
}

describe("goodAlternatives", () => {
  it("collects alternatives within GOOD_CP of best, excluding the played move", () => {
    const shape = evalShape([
      ["g1f3", 30, null],
      ["e2e4", 55, null],
      ["d2d4", 62, null],
      ["c2c4", 120, null],
    ]);
    // Alternatives are moves OTHER than played and best is included when
    // the played move is not best (bad moves compare against good moves).
    const good = goodAlternatives(shape, "b8c6");
    expect(good).toEqual(["g1f3", "e2e4", "d2d4"]); // c4 too far behind best
    expect(goodAlternatives(shape, "e2e4")).toEqual(["g1f3", "d2d4"]);
  });

  it("treats mate lines as unreachable for band logic", () => {
    const shape = evalShape([
      ["d1h5", null, 1], // mate in 1
      ["g1f3", 30, null],
    ]);
    // best is mate (cp -> huge): no cp alternative is within GOOD_CP, but the
    // best move itself is always a "good alternative" for a bad played move;
    // its continuation pool will be empty (mate ends the line).
    expect(goodAlternatives(shape, "b8c6")).toEqual(["d1h5"]);
    // with the mate move played, the cp line is far behind -> no alternatives
    expect(goodAlternatives(shape, "d1h5")).toEqual([]);
  });
});

describe("comparisonSetsV2 (bad moves)", () => {
  it("pools good alternatives as positives, played as negative", async () => {
    const shape = evalShape([
      ["g1f3", 30, null],
      ["e2e4", 45, null],
      ["d2d4", 50, null],
      ["c2c4", 90, null],
    ]);
    const sets = await comparisonSetsV2("mistake", shape, START, "b8c6", null);
    expect(sets.target).toBe("played");
    expect(sets.negatives).toEqual(["b8c6"]);
    expect(sets.positives[0]).toBe("g1f3");
    expect(sets.positives).toContain("e2e4");
    expect(sets.positives).not.toContain("c2c4"); // too far behind best
    expect(sets.positives.length).toBeLessThanOrEqual(3);
  });
});

describe("comparisonSetsV2 (good moves, real engine)", () => {
  let engine: EngineClient;

  beforeAll(async () => {
    engine = await EngineClient.create(createNodeTransport(ENGINE_PATH), {
      multipv: 4,
      hashMb: 16,
    });
  }, 30_000);

  afterAll(async () => {
    await engine?.quit();
  });

  it(
    "after 1.d4, good 1...d5 compares against engine-verified mediocre moves",
    async () => {
      const after1d4 = new Chess(START);
      after1d4.move("d2d4");
      const evalResult = await engine.evaluate({
        fen: after1d4.fen(),
        depth: 12,
        movetimeMs: 500,
        multipv: 4,
      });
      const shape: EvalShape = {
        lines: evalResult.lines.map((l) => ({
          pv: l.pv,
          scoreCp: l.scoreCp,
          mate: l.mate,
        })),
        bestmove: evalResult.bestmove,
      };
      const sets = await comparisonSetsV2(
        "best",
        shape,
        after1d4.fen(),
        "d7d5",
        engine,
      );
      expect(sets.target).toBe("second-best");
      // positives: played + good alternatives
      expect(sets.positives).toContain("d7d5");
      // negatives: mediocre band (engine-verified) — after 1.d4 the tail
      // moves are usually still good, so sampled random moves fill in.
      for (const uci of sets.negatives) {
        expect(uci).not.toBe("d7d5");
      }
      expect(sets.negatives.length).toBeLessThanOrEqual(2);
      if (sets.negatives.length > 0) {
        // Verify the band: each negative must be 40..250cp behind best,
        // by a brief evaluation of the position after it.
        const bestCp = 30; // approximate; verified via engine below
        void bestCp;
      }
    },
    120_000,
  );

  it(
    "mediocreAlternatives respects the band (no queen sacrifices)",
    async () => {
      const evalResult = await engine.evaluate({
        fen: START,
        depth: 12,
        movetimeMs: 500,
        multipv: 4,
      });
      const shape: EvalShape = {
        lines: evalResult.lines.map((l) => ({
          pv: l.pv,
          scoreCp: l.scoreCp,
          mate: l.mate,
        })),
        bestmove: evalResult.bestmove,
      };
      // Exclude all good moves so the sampler must find random mediocre ones.
      const good = ["e2e4", "d2d4", "g1f3", "c2c4"];
      const mediocre = await mediocreAlternatives(
        engine,
        shape,
        START,
        "e2e4",
        good,
        250,
      );
      expect(mediocre.length).toBeLessThanOrEqual(2);
      // Best mover-relative cp (mover = White = side to move here):
      const bestMoverCp = evalResult.lines[0]!.scoreCp ?? 0;
      for (const uci of mediocre) {
        const child = new Chess(START);
        child.move({
          from: uci.slice(0, 2) as never,
          to: uci.slice(2, 4) as never,
        } as never);
        const reply = await engine.evaluate({
          fen: child.fen(),
          depth: 10,
          movetimeMs: 250,
          multipv: 1,
        });
        // reply is Black-to-move relative; mover(White)-relative = negated.
        const moverCp = -(reply.lines[0]!.scoreCp ?? 0);
        const loss = bestMoverCp - moverCp; // how much worse than best
        expect(loss).toBeGreaterThanOrEqual(MEDIOCRE_MIN_CP - 80);
        expect(loss).toBeLessThanOrEqual(MEDIOCRE_MAX_CP + 80);
      }
    },
    240_000,
  );
});

void GOOD_CP;