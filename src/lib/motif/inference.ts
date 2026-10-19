import { Chess } from "chess.js";
import type { Color } from "chess.js";
import type { Motif } from "./types.ts";

export interface PoolPosition {
  fen: string;
  color: Color;
}

export interface SelectedMotif {
  id: string;
  name: string;
  description: string;
  delta: number;
  positiveTrueRate: number;
  negativeFalseRate: number;
  /** min(positiveTrueRate, negativeFalseRate), BinProp support fit. */
  supportFit: number;
  /** supportFit * delta. */
  weightedScore: number;
  /** Concrete facts from the motif's facts function, evaluated on positive
   * positions where it holds (deduplicated). Display-only. */
  facts: string[];
}

export interface InferenceResult {
  selected: SelectedMotif[];
  ranked: SelectedMotif[];
  usedFallback: boolean;
  errors: { name: string; error: string }[];
}

export interface InferOptions {
  topK?: number;
  minFit?: number;
}

/** Maximum concrete facts kept per selected motif. */
const MAX_FACTS = 6;

/**
 * BinProp inference ("support-fit-delta-v1"): evaluate every motif on the two
 * continuation pools, rank by fit times delta, keep the top motifs with
 * support fit >= 0.5 (default 3); fall back to the single best-ranked motif
 * when none qualifies. Mirrors binary_properties.inference.infer.
 */
export function inferMotifs(
  motifs: Motif[],
  positive: PoolPosition[],
  negative: PoolPosition[],
  options?: InferOptions,
): InferenceResult {
  const topK = options?.topK ?? 3;
  const minFit = options?.minFit ?? 0.5;
  const ranked: SelectedMotif[] = [];
  const errors: { name: string; error: string }[] = [];
  if (positive.length === 0 || negative.length === 0) {
    return { selected: [], ranked: [], usedFallback: false, errors };
  }
  for (const motif of motifs) {
    if (!Number.isFinite(motif.delta) || motif.delta <= 0) continue;
    try {
      const boards = [...positive, ...negative].map(
        (p) => ({ board: new Chess(p.fen), color: p.color }),
      );
      const values = boards.map(({ board, color }) => motif.motif(board, color));
      const posValues = values.slice(0, positive.length);
      const negValues = values.slice(positive.length);
      const positiveTrueRate = posValues.filter(Boolean).length / posValues.length;
      const negativeFalseRate = negValues.filter((v) => !v).length / negValues.length;
      const supportFit = Math.min(positiveTrueRate, negativeFalseRate);

      const facts: string[] = [];
      if (motif.facts) {
        const seen = new Set<string>();
        boards.slice(0, positive.length).forEach(({ board, color }, i) => {
          if (!values[i]) return;
          for (const fact of motif.facts!(board, color)) {
            if (!seen.has(fact)) {
              seen.add(fact);
              if (facts.length < MAX_FACTS) facts.push(fact);
            }
          }
        });
      }

      ranked.push({
        id: motif.id,
        name: motif.name,
        description: motif.description,
        delta: motif.delta,
        positiveTrueRate,
        negativeFalseRate,
        supportFit,
        weightedScore: supportFit * motif.delta,
        facts,
      });
    } catch (error) {
      errors.push({ name: motif.name, error: String(error) });
    }
  }
  ranked.sort(
    (a, b) =>
      b.weightedScore - a.weightedScore ||
      b.supportFit - a.supportFit ||
      b.delta - a.delta ||
      a.name.localeCompare(b.name),
  );
  const qualifying = ranked.filter((m) => m.supportFit >= minFit);
  const selected = qualifying.length > 0 ? qualifying.slice(0, topK) : ranked.slice(0, 1);
  return {
    selected,
    ranked,
    usedFallback: selected.length > 0 && qualifying.length === 0,
    errors,
  };
}
