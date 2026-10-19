import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { LIBRARY } from "../src/lib/motif/library/index.ts";

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

describe("differential: TS motifs vs python-chess originals", () => {
  for (const { name, motif } of LIBRARY) {
    const doc = JSON.parse(
      readFileSync(`fixtures/motifs/${slug(name)}.json`, "utf8"),
    ) as { name: string; num_true: number; cases: { fen: string; color: "w" | "b"; value: boolean }[] };

    it(`${name} matches on all ${doc.cases.length} cases`, () => {
      expect(doc.name).toBe(name);
      const mismatches: { fen: string; color: string; expected: boolean; actual: boolean }[] = [];
      for (const { fen, color, value } of doc.cases) {
        const board = new Chess(fen);
        expect(board.turn()).toBe(color);
        const actual = motif(board, color);
        if (actual !== value) {
          mismatches.push({ fen, color, expected: value, actual });
        }
      }
      if (mismatches.length > 0) {
        console.error(`first 5 mismatches for ${name}:`, mismatches.slice(0, 5));
      }
      expect(mismatches).toEqual([]);
    });
  }
});
