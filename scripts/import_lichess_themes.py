#!/usr/bin/env python3
"""Convert a Lichess study of themed puzzle chapters into a review corpus.

Each chapter of the "Puzzle Themes" study (https://lichess.org/study/viiWlKjv)
starts from a FEN whose first move demonstrates the chapter's theme, with
human comments as reference annotations. This script parses the study PGN
and emits eval/lichess-themes.json: one case per chapter with the theme, the
position, the themed move, and the original comments as the reference.

Run:  python3 scripts/import_lichess_themes.py <study.pgn>
     (fetch the study PGN from https://lichess.org/study/<id>.pgn first)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import chess
import chess.pgn

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "eval" / "lichess-themes.json"


def strip_arrow_annotations(text: str) -> str:
    """Remove [%cal ...] / [%csl ...] annotation markers from comments."""
    return re.sub(r"\s*\[%c(?:al|sl) [^\]]*\]", "", text).strip()


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: import_lichess_themes.py <study.pgn>", file=sys.stderr)
        return 2
    source = Path(sys.argv[1])
    cases = []
    with source.open() as handle:
        while True:
            game = chess.pgn.read_game(handle)
            if game is None:
                break
            headers = game.headers
            theme = headers.get("ChapterName", "?")
            fen = headers.get("FEN") or chess.STARTING_FEN
            chapter_url = headers.get("ChapterURL", "")
            board = chess.Board(fen)

            # Collect the first move with its preceding and following comments.
            node = game
            comments = []
            for comment in node.comment.split("\n"):
                comment = strip_arrow_annotations(comment)
                if comment:
                    comments.append(comment)
            first_move = None
            node = node.next()
            if node is None:
                continue
            first_move = node.move
            move_color = "w" if board.turn == chess.WHITE else "b"
            san = board.san(first_move)
            uci = first_move.uci()
            for comment in node.comment.split("\n"):
                comment = strip_arrow_annotations(comment)
                if comment:
                    comments.append(comment)

            cases.append(
                {
                    "id": re.sub(r"[^a-z0-9]+", "-", theme.lower()).strip("-"),
                    "theme": theme,
                    "before": fen,
                    "played": uci,
                    "san": san,
                    "color": move_color,
                    "reference": " ".join(comments),
                    "source": chapter_url,
                    "mined": True,
                }
            )

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"cases": cases}, indent=2) + "\n")
    print(f"wrote {len(cases)} cases to {OUT}")
    for case in cases:
        print(f"  {case['theme']}: {case['san']} ({case['color']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())