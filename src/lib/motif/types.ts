import type { Chess, Color } from "chess.js";

export type MotifFn = (board: Chess, color: Color) => boolean;

/**
 * Optional concrete facts for a motif, evaluated on positions where it holds:
 * specific squares, counts or pieces that make the explanation tangible
 * (e.g. "the e4 pawn controls d5 and f5"). Display-only; inference consumes
 * only the Boolean motif.
 */
export type MotifFactsFn = (board: Chess, color: Color) => string[];

export interface Motif {
  id: string;
  name: string;
  description: string;
  delta: number;
  /** BinProp library this motif originates from, if any. */
  library?: string;
  motif: MotifFn;
  /** Concrete facts, evaluated where the motif holds. */
  facts?: MotifFactsFn;
}

export function defineMotif(meta: Omit<Motif, "id"> & { id?: string }): Motif {
  const id = meta.id ?? meta.name;
  return { ...meta, id };
}
