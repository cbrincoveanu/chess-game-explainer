import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import { explainMove } from "../src/lib/analysis/explain-jit.ts";
import { EngineClient } from "../src/lib/engine/engine-client.ts";
import { createNodeTransport } from "../src/lib/engine/node-transport.ts";
import { LIBRARY } from "../src/lib/motif/library/index.ts";
import { renderProse } from "../src/ui/explain-text.ts";
import { sanOf } from "../src/lib/chess/uci-san.ts";
import { winPercent } from "../src/lib/analysis/win-percent.ts";
import type { Color } from "chess.js";

/**
 * Mined-theme corpus runner (env-gated, not a CI test):
 *
 *   LICHESS=1 npx vitest run eval/lichess.run.ts
 *
 * Runs the explanation pipeline over the 31 themed positions mined from the
 * Lichess "Puzzle Themes" study (eval/lichess-themes.json, regenerate with
 * scripts/import_lichess_themes.py). Output is for human/LLM review against
 * the study's reference comments — grouped by whether our deterministic
 * facts mention the theme's key concept.
 */
const ENGINE_PATH = "public/engine/stockfish-19-lite-single.js";
const runIt = process.env.LICHESS === "1" ? it : it.skip;

interface ThemeCase {
  id: string;
  theme: string;
  before: string;
  played: string;
  san: string;
  color: Color;
  reference: string;
  source: string;
  mined: boolean;
}

/** Loose keyword map from theme name to fact vocabulary for a quick match. */
const THEME_FACT_KEYWORDS: Record<string, string[]> = {
  Fork: ["fork"],
  Pin: ["pins"],
  "Discovered attack": ["discovered"],
  "Double check": ["double check"],
  "Hanging piece": ["attacked and undefended"],
  Promotion: ["one step from promotion"],
  Underpromotion: ["promotes", "one step from promotion"],
  "Back rank mate": [],
  "Attack on f2 or f7": ["checkmate"],
  Skewer: [],
  Zugzwang: [],
};

describe("mined theme corpus (Lichess Puzzle Themes study)", () => {
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

  const cases = JSON.parse(readFileSync("eval/lichess-themes.json", "utf8"))
    .cases as ThemeCase[];

  for (const c of cases) {
    runIt(
      `${c.theme}: ${c.san}`,
      async () => {
        const jit = await explainMove(engine, c.before, c.played, c.san, c.color, {
          motifs: LIBRARY,
          evalDepth: 12,
        });
        if (!jit) throw new Error(`${c.id}: explanation failed`);
        const info = jit.info;
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
            .filter((m) => m.supportFit >= 0.75)
            .slice(0, 2)
            .map((m) => ({
              name: m.name,
              text: m.description,
              fit: m.supportFit,
              facts: m.facts.slice(0, 2),
            })),
          target: jit.target,
          negativePooledSan: jit.negativePooledSan,
        });

        const keywords = THEME_FACT_KEYWORDS[c.theme] ?? [];
        const allFacts = jit.moveEffects.join(" ");
        const matched = keywords.filter((k) => allFacts.includes(k));
        const keywordNote =
          keywords.length === 0
            ? "(no keyword map — needs manual review)"
            : matched.length === keywords.length
              ? "FACT-MATCH"
              : keywords.length > 0 && matched.length > 0
                ? "PARTIAL"
                : "MISSING";

        console.log(`\n${"=".repeat(78)}`);
        console.log(`THEME ${c.theme} — ${c.san} (${c.color === "w" ? "White" : "Black"}) [${keywordNote}]`);
        console.log(`reference: ${c.reference}`);
        console.log(`source: ${c.source}`);
        console.log("-".repeat(78));
        console.log(
          `classification: ${info.classification} | eval ${winPercent(info.bestCp ?? 0).toFixed(0)}% ` +
            `| engine best: ${info.bestMoveUci ? sanOf(c.before, info.bestMoveUci) : "?"}`,
        );
        console.log(`moveEffects: ${jit.moveEffects.join("; ") || "(none)"}`);
        if (jit.mateThreat) console.log(`mateThreat: ${jit.mateThreat.san}`);
        if (jit.refutation) console.log(`refutation: ${jit.refutation.san}`);
        console.log("PROSE:");
        for (const p of prose) console.log(`  ${p}`);
      },
      300_000,
    );
  }
});