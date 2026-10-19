import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import { explainMove } from "../src/lib/analysis/explain-jit.ts";
import { EngineClient } from "../src/lib/engine/engine-client.ts";
import { createNodeTransport } from "../src/lib/engine/node-transport.ts";
import { LIBRARY } from "../src/lib/motif/library/index.ts";
import { sanOf } from "../src/lib/chess/uci-san.ts";
import { renderProse } from "../src/ui/explain-text.ts";
import { winPercent } from "../src/lib/analysis/win-percent.ts";

/**
 * Golden annotation corpus runner (env-gated, not a CI test):
 *
 *   GOLDEN=1 npx vitest run eval/golden.run.ts
 *
 * Runs the full explanation pipeline over positions whose good annotations
 * are undisputed (see eval/golden.json for references and must/mustNot
 * points) and prints the generated explanations for review. Not asserted
 * deterministically — output is meant for human/LLM comparison against the
 * reference annotations.
 */
const ENGINE_PATH = "public/engine/stockfish-19-lite-single.js";
const runIt = process.env.GOLDEN === "1" ? it : it.skip;

interface GoldenCase {
  id: string;
  before: string;
  played: string;
  san: string;
  color: "w" | "b";
  reference: string;
  must: string[];
  mustNot: string[];
}

describe("golden annotation corpus", () => {
  let engine: EngineClient;

  beforeAll(async () => {
    engine = await EngineClient.create(createNodeTransport(ENGINE_PATH), {
      multipv: 4,
      hashMb: 32,
    });
  }, 60_000);

  afterAll(async () => {
    await engine?.quit();
  });

  const cases = JSON.parse(readFileSync("eval/golden.json", "utf8")).cases as GoldenCase[];

  for (const c of cases) {
    runIt(
      `${c.id}: ${c.san}`,
      async () => {
        const jit = await explainMove(engine, c.before, c.played, c.san, c.color, {
          motifs: LIBRARY,
          evalDepth: 12,
        });
        if (!jit) throw new Error(`${c.id}: explanation failed`);
        const info = jit.info;
        const fmt = (cp: number): string =>
          `${cp > 0 ? "+" : cp < 0 ? "−" : ""}${(Math.abs(cp) / 100).toFixed(1)}`;

        console.log(`\n${"=".repeat(78)}`);
        console.log(`CASE ${c.id} — ${c.san} (${c.color === "w" ? "White" : "Black"})`);
        console.log(`reference: ${c.reference}`);
        console.log(`must mention: ${c.must.join("; ") || "(none)"}`);
        console.log(`must NOT: ${c.mustNot.join("; ") || "(nothing specific)"}`);
        console.log("-".repeat(78));
        console.log("PROSE (what the UI shows):");
        const prose = renderProse({
          san: c.san,
          color: c.color,
          moveNumber: 1,
          classification: info.classification,
          drop: info.drop,
          bestSan: sanOf(c.before, info.bestMoveUci ?? ""),
          moveEffects: jit.moveEffects,
          mateThreat: jit.mateThreat,
          refutation: jit.refutation,
          motifs: [...jit.selected]
            .sort((a, b) => b.supportFit - a.supportFit)
            .slice(0, 5)
            .map((m) => ({
              name: m.name,
              text: m.description,
              fit: m.supportFit,
              facts: m.facts.slice(0, 2),
            })),
          target: jit.target,
          negativePooledSan: jit.negativePooledSan,
        });
        for (const p of prose) console.log(`  ${p}`);
        console.log(
          `classification: ${info.classification} | eval ${fmt(info.bestCp ?? 0)} ` +
            `(${winPercent(info.bestCp ?? 0).toFixed(0)}%, depth ${info.evalDepth})` +
            (info.drop !== null && info.drop > 0
              ? ` → after ${c.san}: ${info.playedCp === null ? "?" : fmt(info.playedCp)} (−${info.drop.toFixed(1)}% win prob)`
              : "") +
            ` | engine best: ${info.bestMoveUci ? sanOf(c.before, info.bestMoveUci) : "?"}`,
        );
        console.log(
          `pools: +[${jit.positivePooledSan.join(", ") || "-"}] −[${jit.negativePooledSan.join(", ") || "-"}] ` +
            `(${jit.positiveCount}+${jit.negativeCount} positions) | fallback: ${jit.usedFallback}`,
        );
        console.log(`positive line: ${jit.positiveLine.map((s) => s.san).join(" ")}`);
        console.log(`negative line: ${jit.negativeLine.map((s) => s.san).join(" ")}`);
        if (jit.selected.length === 0) {
          console.log("MOTIFS: (none selected)");
        }
        for (const m of jit.selected) {
          console.log(
            `MOTIF ${m.name} (${Math.round(m.supportFit * 100)}% match${m.supportFit < 0.6 ? ", weak" : ""}):`,
          );
          console.log(`  ${m.description}`);
          for (const fact of m.facts.slice(0, 3)) {
            console.log(`  → ${fact}`);
          }
        }
      },
      300_000,
    );
  }
});