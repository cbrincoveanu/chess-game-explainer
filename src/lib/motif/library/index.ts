import { SPIKE_MOTIFS } from "./group-spike.ts";
import { MATERIAL_MOTIFS } from "./group-material.ts";
import { PAWN_MOTIFS } from "./group-pawns.ts";
import { DEVELOPMENT_MOTIFS } from "./group-development.ts";
import { KING_SAFETY_MOTIFS } from "./group-king-safety.ts";
import { PIECE_MOTIFS } from "./group-pieces.ts";
import { ACTIVITY_MOTIFS } from "./group-activity.ts";
import { FILE_MOTIFS } from "./group-files.ts";
import { OUTPOST_MOTIFS } from "./group-outposts.ts";
import { ATTACK_MOTIFS } from "./group-attack.ts";
import { TACTICS_MOTIFS } from "./group-tactics.ts";
import type { Motif } from "../types.ts";

/**
 * The curated motif library: TS translations of BinProp chess motifs,
 * each differentially tested against its Python original.
 */
export const LIBRARY: Motif[] = [
  ...SPIKE_MOTIFS,
  ...MATERIAL_MOTIFS,
  ...PAWN_MOTIFS,
  ...DEVELOPMENT_MOTIFS,
  ...KING_SAFETY_MOTIFS,
  ...PIECE_MOTIFS,
  ...ACTIVITY_MOTIFS,
  ...FILE_MOTIFS,
  ...OUTPOST_MOTIFS,
  ...ATTACK_MOTIFS,
  ...TACTICS_MOTIFS,
];
