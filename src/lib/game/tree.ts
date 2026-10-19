import { Chess, validateFen } from "chess.js";
import type { Color, Square } from "chess.js";

export interface GameNode {
  /** FEN before the move (the position this node represents). */
  fen: string;
  /** SAN of the move that led here; null on the root. */
  san: string | null;
  /** UCI of the move that led here; null on the root. */
  uci: string | null;
  /** Color of the move that led here; null on the root. */
  color: Color | null;
  parent: GameNode | null;
  /** Child nodes keyed by SAN. */
  children: Map<string, GameNode>;
  /** Annotation comment for this move, exported as PGN {...}; null/absent otherwise. */
  comment?: string;
}

export function createNode(
  fen: string,
  san: string | null,
  uci: string | null,
  color: Color | null,
  parent: GameNode | null,
): GameNode {
  return { fen, san, uci, color, parent, children: new Map() };
}

/**
 * An editable game tree: the root is a starting position (default start,
 * an imported FEN, or the start of an imported PGN); moves played on the board
 * append child nodes, so variations branch naturally.
 */
export class GameTree {
  readonly root: GameNode;
  private current_: GameNode;

  constructor(fen: string) {
    this.root = createNode(fen, null, null, null, null);
    this.current_ = this.root;
  }

  get current(): GameNode {
    return this.current_;
  }

  /** Path of nodes from the root to the current node (root included). */
  get path(): GameNode[] {
    const out: GameNode[] = [];
    let node: GameNode | null = this.current_;
    while (node) {
      out.unshift(node);
      node = node.parent;
    }
    return out;
  }

  /** Depth-first main-line traversal: first child at each level. */
  mainLine(): GameNode[] {
    const out: GameNode[] = [this.root];
    let node = this.root;
    while (node.children.size > 0) {
      node = [...node.children.values()][0]!;
      out.push(node);
    }
    return out;
  }

  goTo(node: GameNode): void {
    this.current_ = node;
  }

  goToRoot(): void {
    this.current_ = this.root;
  }

  /** Plays a move on the current node, creating a child (or reusing one). */
  playMove(uci: string): GameNode | null {
    const board = new Chess(this.current_.fen);
    try {
      const step: { from: Square; to: Square; promotion?: string } = {
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
      };
      if (uci.length > 4 && uci[4] !== undefined) step.promotion = uci[4];
      const move = board.move(step);
      const san = move.san;
      const existing = this.current_.children.get(san);
      if (existing) {
        this.current_ = existing;
        return existing;
      }
      const child = createNode(
        board.fen(),
        san,
        move.lan,
        move.color,
        this.current_,
      );
      this.current_.children.set(san, child);
      this.current_ = child;
      return child;
    } catch {
      return null;
    }
  }

  goToMainLineIndex(ply: number): GameNode {
    const line = this.mainLine();
    const node = line[Math.min(ply, line.length - 1)]!;
    this.current_ = node;
    return node;
  }

  /** Serializes the current line (root → current) as SAN pairs. */
  toSanPairs(): { number: number; san: string; color: Color }[] {
    return this.path
      .slice(1)
      .map((node, i) => ({
        number: Math.floor(i / 2) + 1,
        san: node.san!,
        color: node.color!,
      }));
  }

  /**
   * Serializes the whole tree as a PGN: the main line inline, and every
   * variation as a parenthesized continuation placed immediately after the
   * main-line move it replaces (standard PGN). Node comments are emitted as
   * {...} after their move. Navigating the tree never changes this export —
   * sidelines and comments are kept.
   */
  toPgn(): string {
    const tokens: string[] = [];
    const moveNumberAt = (depth: number): number => Math.floor((depth - 1) / 2) + 1;
    const push = (token: string): void => {
      const needsSpace =
        tokens.length > 0 && token !== ")" && !tokens[tokens.length - 1]!.endsWith("(");
      tokens.push(needsSpace ? ` ${token}` : token);
    };
    const emitMove = (san: string, depth: number, forceNumber: boolean): void => {
      const isWhite = depth % 2 === 1;
      if (isWhite) push(`${moveNumberAt(depth)}.`);
      else if (forceNumber) push(`${moveNumberAt(depth)}...`);
      push(san);
    };
    const emitComment = (comment: string | undefined): void => {
      if (comment) push(`{${comment.replace(/[{}]/g, "")}}`);
    };
    const emit = (node: GameNode, depth: number): void => {
      const children = [...node.children.values()];
      if (children.length === 0) return;
      const main = children[0]!;
      emitMove(main.san!, depth + 1, false);
      emitComment(main.comment);
      // Variations sit directly after the main-line move they replace,
      // before the main line continues (standard PGN placement).
      for (const child of children.slice(1)) {
        push("(");
        emitMove(child.san!, depth + 1, true);
        emitComment(child.comment);
        emit(child, depth + 1);
        push(")");
      }
      emit(main, depth + 1);
    };
    emitComment(this.root.comment);
    emit(this.root, 0);

    const text = tokens.join("");
    const wrapped: string[] = [];
    {
      let current = "";
      for (const token of text.split(" ")) {
        if (current && current.length + 1 + token.length > 79) {
          wrapped.push(current);
          current = token;
        } else {
          current = current ? `${current} ${token}` : token;
        }
      }
      if (current) wrapped.push(current);
    }

    const headers = Object.entries(this.headers)
      .filter(([key]) => key.length > 0)
      .map(([key, value]) => `[${key} "${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`);
    return headers.length > 0
      ? `${headers.join("\n")}\n\n${wrapped.join("\n")}\n`
      : `${wrapped.join("\n")}\n`;
  }

  /** Loads a PGN's main line into a fresh tree. Returns null on parse error. */
  static fromPgn(pgn: string): GameTree | null {
    try {
      const loaded = new Chess();
      loaded.loadPgn(pgn);
      const headers = loaded.getHeaders();
      const fen = headers.FEN ?? new Chess().fen();
      const tree = new GameTree(fen);
      const board = new Chess(fen);
      for (const san of loaded.history()) {
        const move = board.move(san);
        const node = createNode(
          board.fen(),
          move.san,
          move.lan,
          move.color,
          tree.current_,
        );
        tree.current_.children.set(move.san, node);
        tree.current_ = node;
      }
      tree.headers = headers;
      return tree;
    } catch {
      return null;
    }
  }

  /** Loads a FEN into a fresh tree (headers parsed from the FEN if legal). */
  static fromFen(fen: string): GameTree | null {
    const check = validateFen(fen);
    if (!check.ok) return null;
    try {
      const board = new Chess(fen);
      const tree = new GameTree(board.fen());
      tree.headers = { FEN: board.fen() };
      return tree;
    } catch {
      return null;
    }
  }

  headers: Record<string, string> = {};
}