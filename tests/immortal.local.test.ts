import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { explainMove, type JitExplanation } from "../src/lib/analysis/explain-jit.ts";
import { EngineClient } from "../src/lib/engine/engine-client.ts";
import { createNodeTransport } from "../src/lib/engine/node-transport.ts";
import { GameTree } from "../src/lib/game/tree.ts";
import { LIBRARY } from "../src/lib/motif/library/index.ts";
import { sanOf } from "../src/lib/chess/uci-san.ts";

/**
 * Local validation run (run explicitly; skipped in CI):
 *
 *   IMMORTAL=1 npx vitest run tests/immortal.local.test.ts
 *
 * Walks Kasparov–Topalov 1999 through the JIT pipeline (the same path the UI
 * takes per viewed move), classifying every move and explaining the notable
 * ones, for eyeballing thresholds and wording against the game's published
 * annotations.
 */
const ENGINE_PATH = "public/engine/stockfish-19-lite-single.js";
const runIt = process.env.IMMORTAL === "1" ? it : it.skip;

describe("validation: Kasparov-Topalov 1999 (JIT pipeline)", () => {
  let engine: EngineClient;

  beforeAll(async () => {
    engine = await EngineClient.create(createNodeTransport(ENGINE_PATH), {
      multipv: 2,
      hashMb: 16,
    });
  }, 60_000);

  afterAll(async () => {
    await engine?.quit();
  });

  runIt(
    "classifies every move, explains the notable ones",
    async () => {
      const pgn = readFileSync("fixtures/games/kasparov-topalov-1999.pgn", "utf8");
      const tree = GameTree.fromPgn(pgn);
      assertDefined(tree, "tree");
      const line = tree.mainLine();

      const notable = [9, 13, 24, 31, 33]; // plies we look at closely (1-based move index)
      const rows: string[] = [];
      const explanations = new Map<number, JitExplanation>();

      // Classification pass (cheap, one eval per node).
      for (const node of line.slice(1)) {
        assertDefined(node.parent, "parent");
        assertDefined(node.uci, "uci");
        assertDefined(node.san, "san");
        assertDefined(node.color, "color");
        const jit = await explainMove(engine, node.parent.fen, node.uci, node.san, node.color, {
          motifs: [], // no motifs on the classification pass
          evalDepth: 10,
        });
        assertDefined(jit, "jit");
        const info = jit.info;
        const prefix = `${Math.floor((line.indexOf(node) - 1) / 2) + 1}${node.color === "w" ? "." : "..."} ${node.san.padEnd(7)}`;
        const cls = info.drop !== null && info.drop > 0
          ? `${info.classification} drop=${info.drop.toFixed(1)} best=${sanOf(node.parent.fen, info.bestMoveUci)}`
          : info.classification;
        rows.push(`${prefix} ${cls}`);
        if (notable.includes(line.indexOf(node))) {
          explanations.set(line.indexOf(node), jit);
        }
      }

      // Explanation pass for the notable plies.
      const notableRows: string[] = [];
      for (const ply of notable) {
        const node = line[ply]!;
        assertDefined(node.parent, "parent");
        assertDefined(node.uci, "uci");
        assertDefined(node.san, "san");
        assertDefined(node.color, "color");
        const jit = await explainMove(engine, node.parent.fen, node.uci, node.san, node.color, {
          motifs: LIBRARY,
          evalDepth: 12,
        });
        assertDefined(jit, "jit");
        const pools = `pools: +${jit.positivePooledSan.join("/") || "-"} -${jit.negativePooledSan.join("/") || "-"}`;
        const motifs = jit.selected
          .map((m) => `${m.name} (${Math.round(m.supportFit * 100)}%)`)
          .join(", ");
        notableRows.push(
          `ply ${ply} (${node.san}): ${jit.info.classification} | ${motifs} | ${pools}`,
        );
      }

      console.log(`\n${rows.join("\n")}`);
      console.log(`\n${notableRows.join("\n")}`);

      // Robust, theory-backed expectations (24...cxd4 is ply 48 = the
      // accepted rook sacrifice, annotated as dubious in the literature).
      const ply48 = line[48]!;
      expect(ply48.san).toBe("cxd4");
      assertDefined(ply48.parent, "parent");
      assertDefined(ply48.uci, "uci");
      assertDefined(ply48.san, "san");
      assertDefined(ply48.color, "color");
      const jit48 = await explainMove(
        engine,
        ply48.parent.fen,
        ply48.uci,
        ply48.san,
        ply48.color,
        { motifs: LIBRARY, evalDepth: 12 },
      );
      assertDefined(jit48, "jit48");
      expect(["inaccuracy", "mistake", "blunder"]).toContain(jit48.info.classification);
      expect(jit48.negativeLine[0]!.san).toBe("cxd4");
    },
    1_200_000,
  );
});

function assertDefined<T>(value: T | null | undefined, what: string): asserts value is T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
}