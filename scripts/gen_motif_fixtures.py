#!/usr/bin/env python3
"""Generate differential-test fixtures for the TS motif translations.

Runs the original BinProp Python motifs (python-chess) on a corpus of FENs and
writes expected outputs to fixtures/motifs/<slug>.json. Also writes
fixtures/mirror.json with python-chess Board.mirror() FENs so the TS
mirrorFen() implementation can be verified against the exact same semantics.

Run:  python3 scripts/gen_motif_fixtures.py     (requires: pip install chess)

Everything is deterministic: fixed seed for random games, fixed handcrafted
positions, fixed example PGNs from examples/.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

import chess
import chess.pgn

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "fixtures"

RANDOM_GAMES = 6
RANDOM_PLIES = 60
RANDOM_SEED = 42


def replay_pgn(path: Path) -> list[str]:
    game = chess.pgn.read_game(path.open())
    assert game is not None, f"unreadable PGN: {path}"
    board = game.board()
    fens = [board.fen()]
    for move in game.mainline_moves():
        board.push(move)
        fens.append(board.fen())
    return fens


def random_game(rng: random.Random, plies: int) -> list[str]:
    board = chess.Board()
    fens = [board.fen()]
    for _ in range(plies):
        moves = list(board.legal_moves)
        if not moves:
            break
        board.push(rng.choice(moves))
        fens.append(board.fen())
    return fens


HANDCRAFTED_FENS = [
    # starting position
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    # Ruy Lopez tabiya
    "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
    # isolated queen pawn middlegame
    "r1bq1rk1/pp2bppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 12",
    # king and pawn vs king and pawn
    "8/8/8/8/8/2k5/1p6/1K6 w - - 0 1",
    # Lucena-style rook endgame
    "1K1k4/1P6/8/8/8/8/r7/2R5 b - - 0 1",
    # bishop pair vs knight pair
    "4k3/8/8/4b3/8/2n5/8/4K3 w - - 0 1",
    # passed pawns for both sides
    "8/1P6/8/8/8/8/1p6/4K2k w - - 0 1",
    # knight on d5 (unsupported outpost)
    "r1bqk2r/pp3ppp/2n5/3N4/8/5N2/PPP2PPP/R1BQ1RK1 b kq - 0 11",
    # double fianchetto, symmetric structure
    "r1bq1rk1/pp1nbppp/2p2n2/3p4/3P4/2N2N2/PP1PBPPP/R1BQ1RK1 w - - 0 9",
    # hanging queen attacked by pawn
    "rnb1kbnr/pppp1ppp/8/4p3/6q1/5P2/PPPPP1PP/RNBQKBNR w KQkq - 1 2",
    # king attack with open lines
    "r1bq1r1k/ppp2ppp/2n5/3p4/1bP5/2N1BN2/PP1P1PPP/R2QK2R w KQ - 0 10",
    # en passant is legal (after 1.e4 a6 2.e5 d5)
    "rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3",
    # asymmetric castling rights
    "r3k2r/pppqpppp/2n2n2/3p4/3P4/2N2N2/PPPQPPPP/R3K2R w Kq - 0 1",
    # Carlsen-Firouzja 2021 continuation endpoints (BinProp paper example)
    "2r3k1/1p4p1/3n2r1/3P1p2/1RP5/3B4/1P6/1K1R4 w - - 1 36",
    "5k2/1p4p1/p2n1rP1/3r1p2/3p4/1P1B4/1PP1R3/1K4R1 w - - 2 35",
    # lone passed pawn endgame, king and pawn vs king
    "8/8/8/4pk2/8/2K5/8/8 w - - 0 1",
]


def build_corpus() -> list[str]:
    rng = random.Random(RANDOM_SEED)
    fens: list[str] = []
    for name in ("morphy-duke-count-1858.pgn", "kasparov-topalov-1999.pgn"):
        fens.extend(replay_pgn(ROOT / "examples" / name))
    for _ in range(RANDOM_GAMES):
        fens.extend(random_game(rng, RANDOM_PLIES))
    fens.extend(HANDCRAFTED_FENS)

    seen: set[str] = set()
    unique: list[str] = []
    for fen in fens:
        if fen not in seen:
            seen.add(fen)
            unique.append(fen)
    # every fen must be a legal position
    for fen in unique:
        assert chess.Board(fen).is_valid(), f"invalid corpus fen: {fen}"
    return unique


def build_cases(corpus: list[str]) -> list[dict]:
    """One case per (fen, color) where forcing turn to color stays legal.

    The stored fen already has the turn set to color, exactly like
    BinProp's evaluate(fen, color) does before calling motif(fen).
    """
    cases: list[dict] = []
    seen: set[str] = set()
    skipped = 0
    for fen in corpus:
        for color in (chess.WHITE, chess.BLACK):
            board = chess.Board(fen)
            board.turn = color
            if not board.is_valid():
                skipped += 1
                continue
            case_fen = board.fen()
            if case_fen in seen:
                continue
            seen.add(case_fen)
            cases.append(
                {"fen": case_fen, "color": "w" if color == chess.WHITE else "b"}
            )
    print(f"cases: {len(cases)} (skipped {skipped} invalid forced-turn positions)")
    return cases


def compile_motifs() -> list[tuple[dict, object]]:
    compiled = []
    for path in sorted((FIXTURES / "binprop" / "motifs").glob("*.json")):
        motif = json.loads(path.read_text())
        # BinProp's runtime injects `chess` into the exec namespace; some
        # motif sources rely on that instead of importing it.
        namespace: dict[str, object] = {"chess": chess}
        exec(motif["source"], namespace)  # noqa: S102 - trusted, vendored sources
        fn = namespace["motif"]
        assert namespace["MOTIF_NAME"] == motif["name"], path
        compiled.append((motif, fn))
    return compiled


def slug(name: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in name.lower()).strip("_")


def main() -> int:
    corpus = build_corpus()
    cases = build_cases(corpus)

    motifs_dir = FIXTURES / "motifs"
    motifs_dir.mkdir(exist_ok=True)
    for motif, fn in compile_motifs():
        rows = []
        errors = 0
        for case in cases:
            try:
                value = bool(fn(case["fen"]))
            except Exception as exc:  # noqa: BLE001
                errors += 1
                print(f"ERROR {motif['name']} on {case['fen']}: {exc}")
                value = None
            rows.append({**case, "value": value})
        if errors:
            raise SystemExit(f"{motif['name']} failed on {errors} positions")
        out = {
            "name": motif["name"],
            "description": motif["description"],
            "delta": motif["delta"],
            "library": motif["library"],
            "num_true": sum(1 for r in rows if r["value"] is True),
            "cases": rows,
        }
        path = motifs_dir / f"{slug(motif['name'])}.json"
        path.write_text(json.dumps(out, indent=1) + "\n")
        print(f"{motif['name']}: {out['num_true']}/{len(rows)} true -> {path}")

    mirror = [
        {"fen": fen, "mirrored": chess.Board(fen).mirror().fen()} for fen in corpus
    ]
    (FIXTURES / "mirror.json").write_text(json.dumps(mirror, indent=1) + "\n")
    print(f"mirror fixtures: {len(mirror)} -> fixtures/mirror.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
