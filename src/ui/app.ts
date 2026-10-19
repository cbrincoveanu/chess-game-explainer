import { Chess } from "chess.js";
import type { Color } from "chess.js";
import { winPercent } from "../lib/analysis/win-percent.ts";
import { EngineClient } from "../lib/engine/engine-client.ts";
import { createBrowserTransport } from "../lib/engine/transport.ts";
import { evaluateJit, type JitEval } from "../lib/engine/jit-eval.ts";
import { explainMove, type JitExplanation } from "../lib/analysis/explain-jit.ts";
import { GameTree } from "../lib/game/tree.ts";
import type { GameNode } from "../lib/game/tree.ts";
import { LIBRARY } from "../lib/motif/library/index.ts";
import { sanOf } from "../lib/chess/uci-san.ts";
import { BoardPanel } from "./board-panel.ts";
import { personalize, renderProse } from "./explain-text.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

export class App {
  private readonly board = new BoardPanel($("board"));
  private readonly explanationEl = $<HTMLDivElement>("explanation");
  private readonly statusEl = $<HTMLSpanElement>("status");
  private readonly evalEl = $<HTMLSpanElement>("eval");
  private readonly pgnEl = $<HTMLTextAreaElement>("pgn");
  private readonly fenEl = $<HTMLInputElement>("fen");

  private tree = new GameTree(new Chess().fen());
  private engine: EngineClient | null = null;
  private engineReady = false;
  /** Bumped on every refresh; in-flight evals/explanations abort when stale. */
  private navToken = 0;
  /** Moves visited before going back, for browser-style Forward navigation. */
  private forwardStack: GameNode[] = [];
  private evalCache = new Map<string, JitEval>();
  private explainCache = new Map<string, JitExplanation>();

  private static STORAGE_KEY = "chess-game-explainer:game";

  /** Saves the current game tree (PGN incl. variations + current path). */
  private saveState(): void {
    try {
      const path = this.tree.path
        .slice(1)
        .map((node) => node.san)
        .filter((san): san is string => san !== null);
      localStorage.setItem(
        App.STORAGE_KEY,
        JSON.stringify({ pgn: this.tree.toPgn(), path }),
      );
    } catch {
      // localStorage unavailable (private mode etc.) — analysis still works.
    }
  }

  /** Restores a saved game tree, if any (side effect: sets this.tree). */
  private restoreState(): void {
    try {
      const raw = localStorage.getItem(App.STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { pgn: string; path: string[] };
      const tree = GameTree.fromPgn(saved.pgn);
      if (!tree) return;
      for (const san of saved.path) {
        const node = tree.current.children.get(san);
        if (!node) break;
        tree.goTo(node);
      }
      this.tree = tree;
    } catch {
      // Corrupt or incompatible state — start from the initial position.
    }
  }

  constructor() {
    // Load the previously saved game, if any (side effect: sets this.tree).
    this.restoreState();
    $("flip").addEventListener("click", () => void this.board.flip());
    $("pgn-clear").addEventListener("click", () => this.clearGame());
    $("pgn-load").addEventListener("click", () => this.loadPgn());
    $("pgn-copy").addEventListener("click", () => void this.copy(this.pgnEl.value, "PGN copied"));
    $("fen-load").addEventListener("click", () => this.loadFen());
    $("fen-copy").addEventListener("click", () => void this.copy(this.fenEl.value, "FEN copied"));
    $("first").addEventListener("click", () => this.goFirst());
    $("back").addEventListener("click", () => this.goBack());
    $("forward").addEventListener("click", () => this.goForward());
    $("last").addEventListener("click", () => this.goLast());
    this.board.enableMoveInput({
      // Resolve the legal UCI for a drag (auto-queen promotion) or null.
      resolve: (from, to) => {
        const board = new Chess(this.tree.current.fen);
        for (const promotion of ["", "q", "r", "b", "n"]) {
          try {
            const move = board.move({
              from,
              to,
              ...(promotion ? { promotion } : {}),
            } as Parameters<typeof board.move>[0]);
            return move.lan;
          } catch {
            // try the next promotion piece
          }
        }
        return null;
      },
      // Legal destination squares for the picked-up piece (shown as dots).
      destinations: (from) => {
        const board = new Chess(this.tree.current.fen);
        try {
          return board.moves({ square: from as never, verbose: true }).map((m) => m.to);
        } catch {
          return [];
        }
      },
      onMove: (uci) => {
        this.tree.playMove(uci);
        this.forwardStack = [];
        this.refresh();
      },
    });

    void this.init();
    this.refresh();
  }

  private async init(): Promise<void> {
    try {
      const workerUrl = new URL("engine/stockfish-19-lite-single.js", document.baseURI);
      this.engine = await EngineClient.create(createBrowserTransport(workerUrl.href), {
        multipv: 2,
        hashMb: 32,
      });
      this.engineReady = true;
      this.statusEl.textContent = "Engine ready.";
      this.refresh();
    } catch (err) {
      this.statusEl.textContent = `Engine failed to start: ${String(err)}`;
    }
  }

  /** Back one move; the current move is remembered for Forward. */
  private goBack(): void {
    const parent = this.tree.current.parent;
    if (!parent) return;
    this.forwardStack.push(this.tree.current);
    this.tree.goTo(parent);
    this.refresh();
  }

  /** Back to the start; the current move is remembered for Forward. */
  private goFirst(): void {
    if (this.tree.current === this.tree.root) return;
    this.forwardStack.push(this.tree.current);
    this.tree.goToRoot();
    this.refresh();
  }

  /** Forward through the moves visited before going back. */
  private goForward(): void {
    const node = this.forwardStack.pop();
    if (!node) return;
    this.tree.goTo(node);
    this.refresh();
  }

  /** Jump to the end of the current line (following the first-child chain). */
  private goLast(): void {
    let node = this.tree.current;
    while (node.children.size > 0) {
      node = [...node.children.values()][0]!;
    }
    if (node === this.tree.current) return;
    this.forwardStack = [];
    this.tree.goTo(node);
    this.refresh();
  }

  /** Resets to the starting position with an empty game. */
  private clearGame(): void {
    this.tree = new GameTree(new Chess().fen());
    this.tree.headers = {};
    this.forwardStack = [];
    this.evalCache.clear();
    this.explainCache.clear();
    this.refresh();
  }

  /** Loads a PGN (from the box) into a fresh game tree. */
  private loadPgn(): void {
    const pgn = this.pgnEl.value.trim();
    if (!pgn) return;
    if (!this.loadPgnText(pgn)) {
      this.statusEl.textContent = "Could not parse PGN.";
    }
  }

  /** Loads a PGN string into a fresh game tree. */
  private loadPgnText(pgn: string): boolean {
    const tree = GameTree.fromPgn(pgn);
    if (!tree) return false;
    this.replaceTree(tree);
    return true;
  }

  private loadFen(): void {
    const fen = this.fenEl.value.trim();
    if (!fen) return;
    const tree = GameTree.fromFen(fen);
    if (!tree) {
      this.statusEl.textContent = "Could not parse FEN.";
      return;
    }
    this.replaceTree(tree);
  }

  private replaceTree(tree: GameTree): void {
    this.tree = tree;
    this.forwardStack = [];
    this.evalCache.clear();
    this.explainCache.clear();
    void this.board.setOrientation("w");
    this.refresh();
  }

  private async copy(text: string, doneMessage: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.statusEl.textContent = doneMessage;
    } catch {
      this.statusEl.textContent = "Clipboard unavailable in this browser.";
    }
  }

  /** Full refresh after a tree or engine change. */
  private refresh(): void {
    const token = ++this.navToken;
    void this.board.setPosition(this.tree.current.fen);
    this.board.showArrows(null);
    this.syncPgn();
    this.syncFen();
    this.saveState();
    if (!this.engineReady) this.statusEl.textContent = "Loading engine…";
    this.renderExplanationOrLoading();
    void this.analyzeCurrent(token);
  }

  /**
   * Shows the cached explanation instantly, a loading note while the engine
   * analyzes, or nothing at the starting position.
   */
  private renderExplanationOrLoading(): void {
    const node = this.tree.current;
    const parent = node.parent;
    if (!parent || !node.san) {
      this.explanationEl.replaceChildren();
      return;
    }
    const cached = this.explainCache.get(`${parent.fen}|${node.san}`);
    if (cached) {
      this.renderJitExplanation(cached);
      return;
    }
    this.explanationEl.replaceChildren();
    const p = document.createElement("p");
    p.className = "loading";
    p.textContent = this.engineReady ? "Analyzing position…" : "Loading engine…";
    this.explanationEl.appendChild(p);
  }

  private async analyzeCurrent(token: number): Promise<void> {
    if (!this.engine || !this.engineReady) return;
    const fen = this.tree.current.fen;
    const stale = () => token !== this.navToken;
    const cached = this.evalCache.get(fen);
    if (cached) this.showEvalAndBestArrow(cached);
    const result = await evaluateJit(this.engine, fen, {
      shouldStop: stale,
      onIteration: (r) => {
        if (stale()) return;
        this.evalCache.set(fen, r);
        this.showEvalAndBestArrow(r);
      },
    });
    if (stale()) return;
    if (result) {
      this.evalCache.set(fen, result);
      this.showEvalAndBestArrow(result);
    }
    await this.explainCurrent(token);
  }

  private showEvalAndBestArrow(r: JitEval): void {
    const stm = r.fen.split(" ")[1] === "w" ? "White" : "Black";
    const sign = r.cp !== null && r.cp > 0 ? "+" : "";
    const score =
      r.mateIn !== null ? `mate in ${Math.abs(r.mateIn)}` : `${sign}${(r.cp ?? 0) / 100}`;
    this.evalEl.textContent =
      `${stm} to move: ${score} (${winPercent(r.cp ?? 0).toFixed(0)}%) · depth ${r.depth}`;
    this.board.showArrows({ best: r.bestMoveUci, played: null, same: false });
  }

  private async explainCurrent(token: number): Promise<void> {
    const node = this.tree.current;
    const parent = node.parent;
    if (!this.engine || !parent || !node.uci || !node.san || !node.color) {
      this.explanationEl.replaceChildren();
      return;
    }
    const stale = () => token !== this.navToken;
    const key = `${parent.fen}|${node.san}`;
    const cached = this.explainCache.get(key);
    if (cached) {
      this.renderJitExplanation(cached);
      return;
    }
    // Reuse the cached JIT eval (multipv) so the explanation and the eval
    // readout agree on the engine's opinion of this position.
    const evalResult = this.evalCache.get(parent.fen)?.evalResult ?? null;
    const result = await explainMove(
      this.engine,
      parent.fen,
      node.uci,
      node.san,
      node.color,
      {
        motifs: LIBRARY,
        evalDepth: 12,
        evalResult,
        shouldStop: stale,
      },
    );
    if (stale() || !result) return;
    this.explainCache.set(key, result);
    this.renderJitExplanation(result);
  }

  private renderJitExplanation(jit: JitExplanation): void {
    const info = jit.info;
    const node = this.tree.current;
    // Move number from the current path (plies from the root).
    const plyIndex = Math.max(0, this.tree.path.length - 1);

    const prose = renderProse({
      san: info.san,
      color: info.color,
      moveNumber: Math.floor(plyIndex / 2) + 1,
      classification: info.classification,
      drop: info.drop,
      bestSan: sanOf(info.beforeFen, info.bestMoveUci),
      moveEffects: jit.moveEffects,
      mateThreat: jit.mateThreat,
      refutation: jit.refutation,
      motifs: [...jit.selected]
        .sort((a, b) => b.supportFit - a.supportFit)
        .filter((m) => m.supportFit >= 0.75)
        .slice(0, 2)
        .map((m) => ({
          name: m.name,
          text: personalize(m.description, info.color === "w" ? "White" : "Black"),
          fit: m.supportFit,
          facts: m.facts.slice(0, 2),
        })),
      target: jit.target,
      negativePooledSan: jit.negativePooledSan,
    });

    this.explanationEl.replaceChildren();
    for (const paragraph of prose) {
      const p = document.createElement("p");
      p.textContent = paragraph;
      this.explanationEl.appendChild(p);
    }

    // The explanation becomes the move's PGN comment (auto-synced export).
    if (node.san && node.parent) {
      node.comment = prose.join(" ");
    }
    this.syncPgn();
  }

  /** PGN panel: the whole tree (main line + variations), auto-built. */
  private syncPgn(): void {
    this.pgnEl.value = this.tree.toPgn().trimEnd();
  }

  /** FEN panel: the current position. */
  private syncFen(): void {
    this.fenEl.value = this.tree.current.fen;
  }
}

export type { Color };