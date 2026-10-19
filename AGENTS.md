# AGENTS.md

Guidance for AI coding agents (and humans) working on this repository.

## Commands

```bash
npm run lint        # eslint
npm run typecheck   # tsc --noEmit (covers src/, tests/, eval/)
npm test            # vitest run (unit + engine + differential tests)
npm run dev         # vite dev server
npm run build       # production build to dist/
```

All three checks must pass before committing. `npm test` includes real-engine
tests (Stockfish WASM in Node), so it needs a few seconds.

## Review corpora (env-gated, skipped in CI — run them before changing explanations)

```bash
GOLDEN=1  npx vitest run eval/golden.run.ts        # hand-written golden cases
LICHESS=1 npx vitest run eval/lichess.run.ts       # mined Lichess theme cases
IMMORTAL=1 npx vitest run tests/immortal.local.test.ts  # full-game regression
```

Read the printed output against the `reference` annotations and report a
delta (mentioned / missing / misleading) — these are review benchmarks, not
asserted unit tests.

## Regenerating fixtures

```bash
pip install chess                                    # python-chess
npm run gen:fixtures                                 # fixtures/motifs/*.json + mirror.json
python3 scripts/import_lichess_themes.py <study.pgn> # eval/lichess-themes.json
```

Never hand-edit `fixtures/motifs/*.json` — they are the differential-test
contract between the TS motif library and the original BinProp Python.

## Architecture map

- `src/lib/engine/` — Stockfish (lite single-threaded WASM, vendored in
  `public/engine/`) behind a promise-based UCI client; JIT progressive
  deepening (`jit-eval.ts`); Node transport for tests.
- `src/lib/game/tree.ts` — the editable game tree (variations, PGN/FEN IO).
- `src/lib/analysis/` — classification (`classify.ts`, win% curve),
  move-effect facts (`move-effects.ts`, deterministic chess.js-only),
  continuation pools (`continuation.ts`), comparison set logic
  (`aggregate.ts`), the JIT explanation pipeline (`explain-jit.ts`).
- `src/lib/motif/` — BinProp-style motif library (`library/group-*.ts`),
  inference (`inference.ts`, support fit × delta), differential-tested
  helpers.
- `src/ui/` — the app board panel, prose renderer (`explain-text.ts`).
- `eval/` + `scripts/` — review corpora and their importers.

## Conventions

- Strict TypeScript, `exactOptionalPropertyTypes` on; no `any` where avoidable.
- Motif detection stays binary (Boolean) — concrete strings for the UI go in
  optional `facts` functions or `move-effects.ts`, never into detection.
- Explanations must never contradict the eval readout: reuse the cached JIT
  evaluation (`evalResult` option in `explain-jit.ts`).
- Soft phrasing by default; strong claims ("clearly best") need a ≥5%
  win-probability margin over every alternative.