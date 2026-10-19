# chess-game-explainer

A static site that explains chess moves in plain language — interactively,
entirely in your browser.

Load a game (paste a PGN, a FEN, or start from the initial position) and
**drag pieces on the board** to explore: whatever position you look at is
evaluated by Stockfish (WASM, running locally — no backend), the move that led
there is classified (by win-probability loss), and it is explained in prose
with concrete facts: what the move does, which squares it controls, what it
pins or forks, what the engine prefers instead, and why. The PGN builds
itself as you play, variations included, and every explanation becomes a
PGN comment you can copy anywhere.

Built on the ideas of
[BinProp / ExplainThatMove](https://www.explainthatmove.com/)
("Explaining Chess and Go in Natural Language", Press & Golubev): moves are
explained by comparing *chess motifs* — reusable position predicates — across
the continuations after the engine's best alternatives vs. after the played
move.

## Try it

```bash
npm install
npm run dev     # http://localhost:5173
```

The first load fetches Stockfish (~2 MB) from your own dev server; in
production everything is bundled — the site is fully static (GitHub Pages
compatible).

## Features

- **Interactive analysis**: drag (or tap, with destination dots on pickup) to
  play from any position; just-in-time evaluation with progressive deepening
  (depth 8 → 12 → 16), so eval and best-move arrows refine live.
- **Explanations in prose** for *every* viewed move:
  - deterministic **move-effect facts** (chess.js only, no engine cost):
    captures, check / double check / discovered check, mate threats,
    value-aware forks (a knight forking king and queen counts; a queen
    "forking" two defended pawns does not), pins (line pieces only),
    center control with squares, pawn breaks and blocks, development,
    castling, promotion threats, opened lines, king-shield loosening;
  - **refutations**: for mistakes, the opponent's punishing reply
    ("Black answers Bxf2+, winning material");
  - **motif contrasts** against engine-verified comparison moves: good moves
    are compared against mediocre ones (value-banded, no random queen
    sacrifices), bad moves against the engine's pooled good alternatives;
    only motifs with ≥75% support fit are shown, and silence beats noise.
- **Game tree with variations**: branches are kept, navigable, and exported
  as standard PGN variations; nothing is ever lost by navigating back.
- **PGN / FEN panel**: auto-building export with comments, Clear/Load
  buttons, clipboard copy; state persists across reloads (localStorage).
- **Board flip**, eval readout with depth above the explanations, full
  navigation (|< < > >|, browser-style forward history) and Clear.

## How it works

```
board ──▶ GameTree (src/lib/game/tree.ts)        editable tree, PGN/FEN IO
              │  current position
              ▼
         evaluateJit (src/lib/engine/)           Stockfish WASM, multipv 4,
              │  cached, cancellable              progressive deepening
              ▼
         explainMove (src/lib/analysis/)         classify (win% drop) +
   ┌──────────┼──────────────┐                    refutation + mate threat
   ▼          ▼              ▼
move-effects  comparisonSets  inferMotifs          deterministic facts;
(facts)       (aggregate)    (fit × delta)        pools of continuation
              positions from good/mediocre moves; BinProp-style ranking
              ▼
         renderProse (src/ui/explain-text.ts)     plain-language paragraphs
```

Motif library: 44 motifs (`src/lib/motif/library/`), translated from the
[BinProp](https://github.com/oripress/BinProp) repositories' 192 published
chess motifs.

## Testing philosophy

The tricky part is chess logic, so it is tested from three sides:

1. **Differential tests** — every motif translation is executed against the
   *original Python (python-chess) implementation* on a 968-position corpus
   (`fixtures/`), plus BinProp's color-mirror symmetry check. Run
   `npm run gen:fixtures` to regenerate.
2. **Unit + engine tests** — `npm test` covers classification, tree
   serialization, move-effect facts, UCI parsing, and the real Stockfish
   WASM pipeline (Node transport).
3. **Review corpora** — env-gated runners print generated explanations for
   positions whose good annotations are known, for human/LLM review:

   ```bash
   GOLDEN=1   npx vitest run eval/golden.run.ts               # 16 hand-written cases
   LICHESS=1  npx vitest run eval/lichess.run.ts             # 31 mined theme cases
   IMMORTAL=1 npx vitest run tests/immortal.local.test.ts    # full-game regression
   ```

   The Lichess cases are mined from the
   [Puzzle Themes study](https://lichess.org/study/viiWlKjv) via
   `scripts/import_lichess_themes.py`.

## Development

```bash
npm run lint       # eslint
npm run typecheck   # tsc --noEmit (src, tests, eval)
npm test            # vitest (includes real-engine tests)
npm run build       # production bundle in dist/
```

CI (`.github/workflows/ci.yml`) runs lint + typecheck + tests + build on
every push/PR, and deploys `dist/` to GitHub Pages on `main` (enable once:
*Settings → Pages → Source: GitHub Actions*).

See `AGENTS.md` for the architecture map and conventions.

## Attribution & licenses

- **BinProp** motif sources and metadata: MIT, © Ori Press & Alexander
  Golubev (see `fixtures/binprop/`). Our TS translations are
  differential-tested against the originals.
- **Stockfish** and the vendored stockfish.js builds (`public/engine/`):
  GPLv3, see the headers in those files.
- **[chess.js](https://github.com/jhoff/chess.js)**: BSD 2-Clause.
- **[cm-chessboard](https://github.com/shaack/cm-chessboard)**: MIT.
- Test games (Morphy 1858, Kasparov–Topalov 1999, `fixtures/games/`) from
  Wikipedia; the Lichess Puzzle Themes study is © its authors, via lichess.org.

This project itself: MIT (see `LICENSE`).