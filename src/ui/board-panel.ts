import { Chessboard, FEN, type ChessboardProps } from "cm-chessboard";
import { Arrows, ARROW_TYPE } from "cm-chessboard/src/extensions/arrows/Arrows.js";
import { Markers, MARKER_TYPE } from "cm-chessboard/src/extensions/markers/Markers.js";

export interface MoveArrows {
  /** Engine's best move in UCI, if known. */
  best: string | null;
  /** The played move in UCI, if it should be highlighted. */
  played: string | null;
  /** Whether the played move is the best move. */
  same: boolean;
}

export class BoardPanel {
  private readonly board: Chessboard;
  private orientation: "w" | "b" = "w";

  constructor(container: HTMLElement) {
    const props: ChessboardProps = {
      position: FEN.start,
      responsive: true,
      assetsUrl: new URL("cm-chessboard/", document.baseURI).href,
      style: {
        cssClass: "green",
        showCoordinates: true,
        borderType: "thin",
        animationDuration: 200,
      },
      extensions: [
        { class: Arrows, props: {} },
        { class: Markers, props: {} },
      ],
    };
    this.board = new Chessboard(container, props);
  }

  async setPosition(fen: string): Promise<void> {
    await this.board.setPosition(fen, true);
  }

  async setOrientation(color: "w" | "b"): Promise<void> {
    this.orientation = color;
    await this.board.setOrientation(color, true);
  }

  getOrientation(): "w" | "b" {
    return this.orientation;
  }

  async flip(): Promise<void> {
    await this.setOrientation(this.orientation === "w" ? "b" : "w");
  }

  showArrows(arrows: MoveArrows | null): void {
    this.board.removeArrows();
    if (!arrows) return;
    if (arrows.best && !arrows.same) {
      this.board.addArrow(ARROW_TYPE.success, arrows.best.slice(0, 2), arrows.best.slice(2, 4));
    }
    if (arrows.played) {
      const type = arrows.same ? ARROW_TYPE.info : ARROW_TYPE.danger;
      this.board.addArrow(type, arrows.played.slice(0, 2), arrows.played.slice(2, 4));
    }
  }

  private clearDestinationDots(): void {
    this.board.removeMarkers();
  }

  /**
   * Enables drag-and-drop (and touch) move input with cm-chessboard's
   * callback contract: `validateMoveInput` decides whether the drag may be
   * committed visually (and is the only place to reject), `moveInputFinished`
   * commits afterwards. Picking up a piece shows dots on its legal
   * destination squares (from `destinations`), which also makes
   * tap-then-tap input discoverable on touch devices.
   *
   * `resolve(from, to)` must return the legal UCI for the drag (adding a
   * promotion suffix if needed) or null if the move is illegal;
   * `onMove(uci)` then commits it (the tree + refresh).
   */
  enableMoveInput(handlers: {
    resolve: (from: string, to: string) => string | null;
    onMove: (uci: string) => void;
    destinations?: (from: string) => string[];
  }): void {
    let pending: string | null = null;
    (this.board as unknown as {
      enableMoveInput: (callback: (event: unknown) => boolean) => void;
    }).enableMoveInput((event) => {
      const detail = event as {
        type?: string;
        squareFrom?: string;
        squareTo?: string;
      };
      if (detail.type === "moveInputStarted") {
        this.clearDestinationDots();
        const from = detail.squareFrom;
        if (from && handlers.destinations) {
          for (const square of handlers.destinations(from)) {
            this.board.addMarker(MARKER_TYPE.dot, square);
          }
        }
        return true;
      }
      if (detail.type === "moveInputCanceled") {
        this.clearDestinationDots();
        pending = null;
        return true;
      }
      if (detail.type === "validateMoveInput") {
        const { squareFrom, squareTo } = detail;
        if (!squareFrom || !squareTo) return false;
        pending = handlers.resolve(squareFrom, squareTo);
        return pending !== null;
      }
      if (detail.type === "moveInputFinished") {
        this.clearDestinationDots();
        const uci = pending;
        pending = null;
        if (uci) handlers.onMove(uci);
      }
      return true;
    });
  }
}