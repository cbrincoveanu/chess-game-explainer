import { Chess } from "chess.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EngineClient } from "../src/lib/engine/engine-client.ts";
import { createNodeTransport } from "../src/lib/engine/node-transport.ts";
import { scoreToCentipawns } from "../src/lib/engine/uci.ts";

const ENGINE_PATH = "public/engine/stockfish-19-lite-single.js";

describe("real engine over Node transport", () => {
  let engine: EngineClient;

  beforeAll(async () => {
    engine = await EngineClient.create(createNodeTransport(ENGINE_PATH), {
      multipv: 2,
      hashMb: 16,
    });
    await engine.newGame();
  }, 30_000);

  afterAll(async () => {
    await engine?.quit();
  });

  it(
    "evaluates the starting position and returns multipv lines",
    async () => {
      const result = await engine.evaluate({
        fen: new Chess().fen(),
        depth: 10,
      });
      expect(result.bestmove).toMatch(/^[a-h][1-8][a-h][1-8]([qrbn])?$/);
      expect(result.lines.length).toBe(2);
      expect(result.lines[0]!.pv.length).toBeGreaterThan(0);
      const cp = scoreToCentipawns(result.lines[0]!);
      expect(cp).toBeGreaterThanOrEqual(-50);
      expect(cp).toBeLessThanOrEqual(50);
    },
    30_000,
  );

  it(
    "finds a mate in one",
    async () => {
      const result = await engine.evaluate({
        fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
        depth: 10,
      });
      expect(result.bestmove).toBe("h5f7");
      expect(result.lines[0]!.mate).toBe(1);
    },
    30_000,
  );

  it(
    "respects the movetime budget roughly",
    async () => {
      const start = Date.now();
      await engine.evaluate({
        fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4",
        movetimeMs: 300,
      });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(3000);
    },
    30_000,
  );
});
