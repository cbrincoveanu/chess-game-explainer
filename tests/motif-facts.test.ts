import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { LIBRARY } from "../src/lib/motif/library/index.ts";

function byName(name: string) {
  const found = LIBRARY.find((m) => m.name === name);
  if (!found?.facts) throw new Error(`missing facts for ${name}`);
  return found;
}

describe("motif facts (concrete parameterization)", () => {
  it("mobility_advantage reports move counts", () => {
    const m = byName("mobility_advantage");
    const board = new Chess("4k3/8/8/8/8/8/8/Q3K3 w - - 0 1");
    if (!m.motif(board, "w")) throw new Error("queen-up position should fire");
    const out = m.facts!(board, "w");
    expect(out.length).toBe(1);
    expect(out[0]).toMatch(/^\d+ legal moves for White vs \d+ for the opponent$/);
  });

  it("center_control lists occupied and attacked central squares", () => {
    const m = byName("center_control");
    const white = new Chess("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
    expect(m.motif(white, "w")).toBe(true);
    const out = m.facts!(white, "w");
    expect(out).toContain("occupies the central square e4");
    expect(out).toContain("attacks the central square d5");
  });

  it("rook file facts name the file", () => {
    const m = byName("stm_rook_open_or_semi_open_file");
    const board = new Chess("4k3/8/8/8/8/8/3P4/3RK3 w - - 0 1");
    expect(m.motif(board, "w")).toBe(true);
    expect(m.facts!(board, "w")[0]).toBe("the rook on d1 is on the semi-open d-file");
  });

  it("king exposure facts count shield pawns", () => {
    const m = byName("opponent_king_exposure");
    // Black king e8 with only the e7 pawn in front (f7/d7 missing).
    const board = new Chess("4k3/4p3/8/8/8/8/8/R3K3 w Q - 0 1");
    expect(m.motif(board, "w")).toBe(true);
    const out = m.facts!(board, "w");
    expect(out.length).toBe(1);
    expect(out[0]).toContain("only 1 shield pawn");
  });

  it("facts never throw on sparse positions", () => {
    const fen = "8/8/8/8/8/8/8/K6k w - - 0 1";
    for (const m of LIBRARY) {
      const { facts } = m;
      if (!facts) continue;
      expect(() => facts(new Chess(fen), "w")).not.toThrow();
    }
  });
});