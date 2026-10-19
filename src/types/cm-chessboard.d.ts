/**
 * Minimal ambient declarations for cm-chessboard (ships untyped ES modules).
 * Only the API surface used by this project is declared.
 */

declare module "cm-chessboard" {
  export const COLOR: { white: "w"; black: "b" };
  export const BORDER_TYPE: { none: "none"; thin: "thin"; frame: "frame" };
  export const FEN: { start: string; empty: string };

  export interface ChessboardProps {
    position?: string;
    orientation?: "w" | "b";
    responsive?: boolean;
    assetsUrl?: string;
    assetsCache?: boolean;
    style?: {
      cssClass?: string;
      showCoordinates?: boolean;
      borderType?: "none" | "thin" | "frame";
      aspectRatio?: number;
      pieces?: { type?: string; file?: string; tileSize?: number };
      animationDuration?: number;
    };
    extensions?: { class: new (chessboard: Chessboard, props?: unknown) => unknown; props?: unknown }[];
  }

  export class Chessboard {
    constructor(element: string | HTMLElement, props: ChessboardProps);
    setPosition(fen: string, animated?: boolean): Promise<unknown>;
    setOrientation(color: "w" | "b", animated?: boolean): Promise<unknown>;
    addArrow(type: unknown, from: string, to: string): void;
    removeArrows(): void;
    addMarker(type: unknown, square: string): void;
    removeMarkers(type?: unknown, square?: string): void;
    destroy(): void;
  }
}

declare module "cm-chessboard/src/extensions/arrows/Arrows.js" {
  export const ARROW_TYPE: {
    default: { class: string };
    success: { class: string };
    secondary: { class: string };
    warning: { class: string };
    info: { class: string };
    danger: { class: string };
  };
  export class Arrows {
    constructor(chessboard: unknown, props?: unknown);
  }
}

declare module "cm-chessboard/src/extensions/markers/Markers.js" {
  export const MARKER_TYPE: {
    frame: { class: string };
    square: { class: string };
    dot: { class: string };
    circle: { class: string };
  };
  export class Markers {
    constructor(chessboard: unknown, props?: unknown);
  }
}
