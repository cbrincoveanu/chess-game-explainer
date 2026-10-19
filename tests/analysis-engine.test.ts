import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GameTree } from "../src/lib/game/tree.ts";
import { explainMove } from "../src/lib/analysis/explain-jit.ts";
import { generatePool } from "../src/lib/analysis/continuation.ts";
import { EngineClient } from "../src/lib/engine/engine-client.ts";
import { createNodeTransport } from "../src/lib/engine/node-transport.ts";
import { evaluateJit } from "../src/lib/engine/jit-eval.ts";
import { LIBRARY } from "../src/lib/motif/library/index.ts";

const ENGINE_PATH = "public/engine/stockfish-19-lite-single.js";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("game tree", () => {
  it("builds a trunk from a PGN and navigates", () => {
    const pgn = readFileSync("fixtures/games/morphy-duke-count-1858.pgn", "utf8");
    const tree = GameTree.fromPgn(pgn);
    expect(tree).not.toBeNull();
    expect(tree!.mainLine().length).toBe(34); // root + 33 plies
    expect(tree!.path.length).toBe(34);
    tree!.goToMainLineIndex(0);
    expect(tree!.current.fen).toBe(START);
    tree!.goToMainLineIndex(3);
    expect(tree!.current.san).toBe("Nf3");
    tree!.goToMainLineIndex(6);
    expect(tree!.current.san).toBe("Bg4");
  });

  it("branches variations when the user plays a different move", () => {
    const tree = new GameTree(START);
    const e4 = tree.playMove("e2e4");
    expect(e4).not.toBeNull();
    expect(e4!.san).toBe("e4");
    tree.goTo(tree.root);
    const d4 = tree.playMove("d2d4");
    expect(d4!.san).toBe("d4");
    expect(tree.root.children.size).toBe(2);
    expect([...tree.root.children.keys()].sort()).toEqual(["d4", "e4"]);
    // Playing the same move again reuses the node.
    tree.goTo(tree.root);
    const again = tree.playMove("e2e4");
    expect(again).toBe(e4);
    expect(tree.root.children.size).toBe(2);
  });

  it("rejects illegal moves and accepts promotions", () => {
    const tree = new GameTree(START);
    expect(tree.playMove("e2e5")).toBeNull();
    const promo = new GameTree("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    const node = promo.playMove("a7a8q");
    expect(node?.san).toBe("a8=Q");
  });

  it("exports the current line as SAN pairs", () => {
    const tree = new GameTree(START);
    tree.playMove("e2e4");
    tree.playMove("e7e5");
    const pairs = tree.toSanPairs();
    expect(pairs).toEqual([
      { number: 1, san: "e4", color: "w" },
      { number: 1, san: "e5", color: "b" },
    ]);
  });

  it("exports variations at their branching move, and navigating never deletes", () => {
    const tree = new GameTree(START);
    tree.playMove("e2e4"); // main line: 1. e4
    tree.playMove("e7e5"); // 1... e5
    tree.playMove("g1f3"); // 2. Nf3
    tree.goTo(tree.root); // back to the start
    tree.playMove("d2d4"); // variation: 1. d4
    tree.playMove("d7d5"); // 1... d5
    tree.goTo(tree.root);
    tree.playMove("e2e4");
    tree.playMove("e7e6"); // variation: 1... e6

    const pgn = tree.toPgn();
    // Variations sit directly after the main-line move they replace.
    expect(pgn).toBe("1. e4 (1. d4 d5) e5 (1... e6) 2. Nf3\n");

    // Navigating anywhere changes nothing.
    tree.goToRoot();
    expect(tree.toPgn()).toBe(pgn);
    tree.goToMainLineIndex(3);
    expect(tree.toPgn()).toBe(pgn);

    // Round trip: the exported PGN parses back to the same main line.
    const reloaded = GameTree.fromPgn(pgn);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.mainLine().map((n) => n.san)).toEqual([null, "e4", "e5", "Nf3"]);
  });

  it("exports node comments as PGN annotations", () => {
    const tree = new GameTree(START);
    const e4 = tree.playMove("e2e4")!;
    e4.comment = "A good move: stakes out the center.";
    const pgn = tree.toPgn();
    expect(pgn).toContain("1. e4 {A good move: stakes out the center.}");
    const reloaded = GameTree.fromPgn(pgn);
    expect(reloaded).not.toBeNull();
  });

  it("loads a FEN root", () => {
    const tree = GameTree.fromFen("4k3/8/8/8/8/8/8/K6Q w - - 0 1");
    expect(tree).not.toBeNull();
    expect(tree!.root.children.size).toBe(0);
    expect(GameTree.fromFen("not a fen")).toBeNull();
  });
});

describe("JIT pipeline (real engine)", () => {
  let engine: EngineClient;

  beforeAll(async () => {
    engine = await EngineClient.create(createNodeTransport(ENGINE_PATH), {
      multipv: 2,
      hashMb: 16,
    });
  }, 30_000);

  afterAll(async () => {
    await engine?.quit();
  });

  it(
    "evaluateJit climbs the depth ladder and reports multipv",
    async () => {
      const seen: number[] = [];
      const result = await evaluateJit(engine, START, {
        depths: [8, 10],
        onIteration: (r) => seen.push(r.depth),
      });
      expect(result).not.toBeNull();
      expect(seen.length).toBe(2);
      expect(result!.bestMoveUci).toMatch(/^[a-h][1-8][a-h][1-8]/);
      expect(result!.cp !== null ? Math.abs(result!.cp) : 0).toBeLessThanOrEqual(50);
    },
    60_000,
  );

  it(
    "evaluateJit aborts when shouldStop flips",
    async () => {
      const stop = false;
      const result = await evaluateJit(engine, START, {
        depths: [10, 12, 14],
        shouldStop: () => stop,
      });
      expect(result).not.toBeNull(); // at least the first rung completes
    },
    60_000,
  );

  it(
    "generatePool yields mover-to-move positions and a line",
    async () => {
      const result = await generatePool(engine, START, "e2e4", "w");
      expect(result.pool.length).toBeGreaterThan(0);
      expect(result.line[0]!.san).toBe("e4");
    },
    60_000,
  );

  it(
    "explainMove explains the Opera game's 9...b5 as a bad move",
    async () => {
      // Position before 9...b5: after 9. Bg5.
      const pgn = readFileSync("fixtures/games/morphy-duke-count-1858.pgn", "utf8");
      const loaded = new Chess();
      loaded.loadPgn(pgn);
      const sans = loaded.history();
      const board = new Chess();
      for (let i = 0; i < 17; i++) {
        board.move(sans[i]!);
      }
      // board is now before 9...b5 (17 plies played).
      expect(board.moves().map((m) => m)).toContain("b5");
      const jit = await explainMove(
        engine,
        board.fen(),
        "b7b5",
        "b5",
        "b",
        { motifs: LIBRARY, evalDepth: 10 },
      );
      expect(jit).not.toBeNull();
      expect(["inaccuracy", "mistake", "blunder"]).toContain(jit!.info.classification);
      expect(jit!.negativeLine[0]!.san).toBe("b5");
      expect(jit!.positiveCount).toBeGreaterThan(0);
    },
    120_000,
  );
});