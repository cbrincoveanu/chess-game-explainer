import { describe, expect, it } from "vitest";
import { describeMoveEffects } from "../src/lib/analysis/move-effects.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_1D4 = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";
const AFTER_1E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

describe("describeMoveEffects", () => {
  it("1...d5 blocks the d-pawn and stakes out the center", () => {
    const facts = describeMoveEffects(AFTER_1D4, "d7d5");
    expect(facts.some((f) => f.includes("blocks the advance of White's d-pawn"))).toBe(true);
    expect(
      facts.some((f) => f.includes("stakes out the central square d5, controlling c4 and e4")),
    ).toBe(true);
  });

  it("Nf3 develops the knight and attacks the center", () => {
    const facts = describeMoveEffects(AFTER_1E4_E5, "g1f3");
    expect(facts.some((f) => f.includes("attacks d4 and e5"))).toBe(true);
    expect(facts.some((f) => f.includes("brings the knight into the game on f3"))).toBe(true);
  });

  it("castling is named with rook connection", () => {
    const facts = describeMoveEffects(
      "r3k2r/pppqpppp/2n2n2/3p4/3P4/2N2N2/PPPQPPPP/R3K2R w KQkq - 0 1",
      "e1g1",
    );
    expect(facts.some((f) => f.includes("castles short"))).toBe(true);
  });

  it("captures name the victim", () => {
    const facts = describeMoveEffects(
      "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      "e4d5",
    );
    expect(facts.some((f) => f.includes("takes the black pawn on d5"))).toBe(true);
  });

  it("checkmate ends the fact list", () => {
    const facts = describeMoveEffects(
      "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
      "h5f7",
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toBe("is checkmate — the game ends here");
  });

  it("gives check", () => {
    const checks = describeMoveEffects("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "a1a8");
    expect(checks.some((f) => f.includes("gives check"))).toBe(true);
  });

  it("routine pawn moves stay quiet (no shield/line boilerplate)", () => {
    // 1.e4: central staking only; no "loosens the shield", no "opens lines".
    const facts = describeMoveEffects(START, "e2e4");
    expect(facts).toEqual(["stakes out the central square e4, controlling d5 and f5"]);
  });

  it("shield loosening fires only when the square is attacked", () => {
    // g3 with a black bishop eyeing g2: leaving the king's shield really
    // weakens it; the routine version (no attacker) stays silent.
    const weak = describeMoveEffects("5k2/8/8/8/4b3/8/6PP/5RK1 w - - 0 1", "g2g3");
    expect(weak.some((f) => f.includes("loosens the shield"))).toBe(true);
    const routine = describeMoveEffects("5k2/8/8/8/8/8/6PP/5RK1 w - - 0 1", "g2g3");
    expect(routine.some((f) => f.includes("loosens the shield"))).toBe(false);
  });

  it("discovered attacks are value-ranked and named", () => {
    // 17.Ne6 (girlfriend-game refutation): Rd1 -> Qd8 discovered attack.
    const facts = describeMoveEffects(
      "r2q1rk1/p3npbp/1p4p1/2n1p3/2PN4/4B2P/PPQ2PP1/1N1R1RK1 w - - 0 17",
      "d4e6",
    );
    expect(
      facts.some((f) => f.includes("gives a discovered attack with the rook on d1 on the queen on d8")),
    ).toBe(true);
  });

  it("illegal or nonsense uci yields no facts", () => {
    expect(describeMoveEffects(START, "e2e5")).toEqual([]);
  });
});
describe("describeMoveEffects — forks, pins, discovered checks (value-aware)", () => {
  it("16...e4+ forks the king and the knight", () => {
    const facts = describeMoveEffects(
      "2r1k2r/pp1bn1pp/1q3p2/3pp3/PP5P/2PK1N2/5bP1/R1BQ1N1R b k - 1 15",
      "e5e4",
    );
    expect(facts.some((f) => f.includes("gives check"))).toBe(true);
    expect(
      facts.some((f) => f.includes("forks the king") && f.includes("knight on f3")),
    ).toBe(true);
  });

  it("a queen forking two defended pawns is NOT a fork", () => {
    // Queen lands on d4 attacking the defended pawns c5/e5: not a fork.
    const facts = describeMoveEffects(
      "4k3/ppp2ppp/8/2p1p3/8/8/PPPQ1PPP/4K3 w - - 0 1",
      "d2d4",
    );
    expect(facts.some((f) => f.includes("forks"))).toBe(false);
  });

  it("a knight forking king and rook is a fork", () => {
    // Nd5-e7+ forks the king on g8 and the rook on c8.
    const facts = describeMoveEffects(
      "2r3k1/8/8/3N4/8/8/8/4K3 w - - 0 1",
      "d5e7",
    );
    expect(facts.some((f) => f.includes("gives check"))).toBe(true);
    expect(
      facts.some((f) => f.includes("forks the king") && f.includes("rook on c8")),
    ).toBe(true);
  });

  it("detects pins by the moved piece (line pieces only)", () => {
    // Rook lands e1: pins the e7 knight to the king on e8 (file ray).
    const rookFacts = describeMoveEffects("4k3/4n3/8/8/8/8/8/R5K1 w - - 0 1", "a1e1");
    expect(
      rookFacts.some((f) => f.includes("pins the knight on e7 to the king")),
    ).toBe(true);
    // Bishop lands c4: pins the e6 knight to the king on g8 (diagonal ray).
    const bishopFacts = describeMoveEffects("6k1/8/4n3/8/8/8/8/4KB2 w - - 0 1", "f1c4");
    expect(
      bishopFacts.some((f) => f.includes("pins the knight on e6 to the king")),
    ).toBe(true);
  });

  it("pawns and knights never pin", () => {
    // 1...e5: the pawn attacks d4/f4 diagonally; nothing is "pinned".
    const pawnFacts = describeMoveEffects(
      "rnbqkbnr/pppp1ppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      "e7e5",
    );
    expect(pawnFacts.some((f) => f.includes("pins"))).toBe(false);
    // Knight landing near a king+piece line: no pin (knights jump).
    const knightFacts = describeMoveEffects("4k3/8/8/8/8/8/8/1N2K3 w - - 0 1", "b1c3");
    expect(knightFacts.some((f) => f.includes("pins"))).toBe(false);
  });

  it("detects discovered check", () => {
    // White knight on e5 blocks the e1 rook's check to the black king on e8;
    // moving the knight away uncovers the check.
    const facts = describeMoveEffects(
      "4k3/8/8/4N3/8/8/8/4R1K1 w - - 0 1",
      "e5g4",
    );
    expect(facts.some((f) => f.includes("gives discovered check"))).toBe(true);
  });
});

describe("describeMoveEffects — repertoire endgame pins", () => {
  it("Bf6 pins the rook to the king in the K7/rook endgame (Lichess-verified)", () => {
    const facts = describeMoveEffects("K7/8/6P1/8/3r3B/8/1k6/8 w - - 0 1", "h4f6");
    expect(
      facts.some((f) => f.includes("pins the rook on d4 to the king")),
    ).toBe(true);
    expect(facts.some((f) => f.includes("attacks the rook on d4"))).toBe(true);
  });
});

describe("describeMoveEffects — theme-mined facts", () => {
  it("double check (Lichess theme corpus)", () => {
    const facts = describeMoveEffects(
      "rn1k1b1r/ppp2pp1/4b1np/4P3/2p5/2N2N2/PP1BPPPP/2KR1B1R w - - 4 9",
      "d2g5",
    );
    expect(facts.some((f) => f.includes("gives double check"))).toBe(true);
    expect(facts.some((f) => f === "gives check, forcing the opponent to respond")).toBe(false);
    // No misleading hanging claim while giving check:
    expect(facts.some((f) => f.includes("attacked and undefended"))).toBe(false);
  });

  it("discovered check (Lichess theme corpus)", () => {
    const facts = describeMoveEffects(
      "4k3/8/8/4N3/8/8/8/4R1K1 w - - 0 1",
      "e5g4",
    );
    expect(facts.some((f) => f.includes("gives discovered check"))).toBe(true);
  });

  it("promotion threat (Lichess theme corpus)", () => {
    const facts = describeMoveEffects(
      "8/6kp/1qPN2p1/3Pb3/2P1P2P/8/6P1/5R1K w - - 4 35",
      "c6c7",
    );
    expect(facts.some((f) => f.includes("one step from promotion"))).toBe(true);
  });

  it("own piece left hanging (Lichess theme corpus)", () => {
    const facts = describeMoveEffects(
      "6k1/7p/1p4p1/2b5/8/5NP1/P3RP1P/3r1BK1 w - - 1 34",
      "e2e7",
    );
    expect(
      facts.some((f) => f.includes("leaves the rook on e7 attacked and undefended")),
    ).toBe(true);
  });
});
