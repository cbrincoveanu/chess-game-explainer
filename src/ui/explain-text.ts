import type { PlyAnalysis, Explanation } from "../lib/analysis/types.ts";
import type { LineStep } from "../lib/analysis/continuation.ts";
import { sanOf } from "../lib/chess/uci-san.ts";

/** Maximum number of motifs shown per explanation. */
export const MAX_SHOWN_MOTIFS = 5;
/** Below this support fit a motif is marked as a rough indication. */
export const WEAK_FIT = 0.6;
/** Win% margin over every alternative required to claim "clearly best". */
export const CLEARLY_BEST_MARGIN = 5;

function playerOf(ply: PlyAnalysis): string {
  return ply.color === "w" ? "White" : "Black";
}

function opponentOf(ply: PlyAnalysis): string {
  return ply.color === "w" ? "Black" : "White";
}

/** Rewrites "the side to move" in BinProp descriptions to the player name. */
export function personalize(description: string, player: string): string {
  return description
    .replace(/^The side to move/, player)
    .replace(/^the side to move/, player)
    .replace(/^Side to move/, player)
    .replace(/\bThe side to move\b/g, player)
    .replace(/\bthe side to move\b/g, player.toLowerCase())
    .replace(/\bSide to move\b/g, player)
    .replace(/\bside to move\b/g, player.toLowerCase());
}

export interface RenderedMotif {
  name: string;
  text: string;
  fit: number;
  /** Below WEAK_FIT: a rough indication rather than a sharp contrast. */
  weak: boolean;
  /** Concrete facts (squares, counts) evaluated where the motif holds. */
  facts: string[];
}

export interface RenderedExplanation {
  headline: string;
  motifs: RenderedMotif[];
  note: string | null;
  positiveLine: LineStep[];
  negativeLine: LineStep[];
  positiveLabel: string;
  negativeLabel: string;
}

export function renderExplanation(
  ply: PlyAnalysis,
  explanation: Explanation,
): RenderedExplanation {
  const player = playerOf(ply);
  const opponent = opponentOf(ply);
  const bestSan = sanOf(ply.beforeFen, ply.bestMoveUci);
  const altSan =
    ply.secondLine && ply.secondLine.pv[0] ? sanOf(ply.beforeFen, ply.secondLine.pv[0]) : null;

  const motifs: RenderedMotif[] = [...explanation.selected]
    .sort((a, b) => b.supportFit - a.supportFit)
    .slice(0, MAX_SHOWN_MOTIFS)
    .map((m) => ({
      name: m.name,
      text: personalize(m.description, player),
      fit: m.supportFit,
      weak: m.supportFit < WEAK_FIT,
      facts: m.facts.slice(0, 3),
    }));

  const pooled = (sans: string[]): string =>
    sans.length > 0 ? ` (pooled with ${sans.join(", ")})` : "";

  const positiveLabel = `Engine line — as if ${player} played ${bestSan}${pooled(explanation.positivePooledSan)}:`;
  const negativeLabel =
    explanation.target === "second-best"
      ? `Line after the alternative ${altSan ?? "???"}${pooled(explanation.negativePooledSan)}:`
      : `Line after ${ply.san} (as played)${pooled(explanation.negativePooledSan)}:`;

  if (explanation.target === "second-best") {
    if (explanation.negativeCount === 0 && explanation.selected.length === 0) {
      return {
        headline: `${ply.san} is the only move.`,
        motifs: [],
        note: null,
        positiveLine: explanation.positiveLine,
        negativeLine: explanation.negativeLine,
        positiveLabel,
        negativeLabel,
      };
    }
    // Soft phrasing by default; "clearly best" only with a real margin
    // over every alternative.
    const clearlyBest =
      ply.marginOverSecond !== null &&
      ply.marginOverSecond >= CLEARLY_BEST_MARGIN;
    const alternative =
      explanation.negativePooledSan.length > 0
        ? `the alternatives (${[altSan, ...explanation.negativePooledSan].filter(Boolean).join(", ")})`
        : altSan
          ? `${altSan}`
          : "every alternative";
    const headline = clearlyBest
      ? explanation.selected.length > 0
        ? `${ply.san} is clearly best — unlike ${alternative}, it would keep:`
        : `${ply.san} is clearly best, but no available motif separates it from ${alternative}.`
      : explanation.selected.length > 0
        ? `${ply.san} is a good move — unlike ${alternative}, it would keep:`
        : `${ply.san} is a good move (one of the engine's top choices).`;
    const note =
      explanation.usedFallback && explanation.selected.length > 0
        ? "These motifs are a rough indication rather than a sharp contrast."
        : null;
    return {
      headline,
      motifs,
      note,
      positiveLine: explanation.positiveLine,
      negativeLine: explanation.negativeLine,
      positiveLabel,
      negativeLabel,
    };
  }

  if (explanation.negativeCount === 0 && explanation.selected.length === 0) {
    if (ply.playedCp !== null && Math.abs(ply.playedCp) > 90000) {
      return {
        headline: `${ply.san} ends the game.`,
        motifs: [],
        note: null,
        positiveLine: explanation.positiveLine,
        negativeLine: explanation.negativeLine,
        positiveLabel,
        negativeLabel,
      };
    }
    return {
      headline: `No available motif distinguishes ${ply.san} from the engine's ${bestSan}.`,
      motifs: [],
      note: null,
      positiveLine: explanation.positiveLine,
      negativeLine: explanation.negativeLine,
      positiveLabel,
      negativeLabel,
    };
  }

  if (explanation.selected.length === 0) {
    return {
      headline: `No available motif clearly separates ${ply.san} from the engine's ${bestSan}.`,
      motifs: [],
      note: null,
      positiveLine: explanation.positiveLine,
      negativeLine: explanation.negativeLine,
      positiveLabel,
      negativeLabel,
    };
  }

  // Conditional mood: the engine line is hypothetical, not "what happened".
  const goodMoves =
    explanation.positivePooledSan.length > 0
      ? `${bestSan} (or ${explanation.positivePooledSan.join(" or ")})`
      : bestSan;
  const headline =
    `${ply.san} lets ${opponent} take over the initiative. ` +
    `Playing ${goodMoves} instead, ${player} would have kept:`;
  const note = explanation.usedFallback
    ? "These motifs are a rough indication rather than a sharp contrast."
    : explanation.positivePooledSan.length > 0
      ? "The engine lines above are hypothetical — pooled over the engine's best alternatives, not what happened in the game."
      : "The engine line above is hypothetical — it shows what the analysis compared, not what happened in the game.";
  return {
    headline,
    motifs,
    note,
    positiveLine: explanation.positiveLine,
    negativeLine: explanation.negativeLine,
    positiveLabel,
    negativeLabel,
  };
}
/** Join phrase fragments into one sentence: "a, b, and c." */
export function joinFragments(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
}

const QUALITY_SENTENCE: Record<string, (drop: number | null) => string> = {
  best: () => "is the engine's top choice",
  great: () => "is a great move",
  excellent: () => "is an excellent move",
  good: () => "is a good move",
  inaccuracy: (drop) => `is a slight inaccuracy (loses ${drop!.toFixed(1)}% win probability)`,
  mistake: (drop) => `is a mistake (loses ${drop!.toFixed(1)}% win probability)`,
  blunder: (drop) => `is a blunder (loses ${drop!.toFixed(1)}% win probability)`,
};

export interface ProseInput {
  san: string;
  color: "w" | "b";
  moveNumber: number;
  classification: string;
  drop: number | null;
  bestSan: string;
  moveEffects: string[];
  mateThreat: { san: string; mateIn: number } | null;
  /** The opponent's punishing reply, for bad moves. */
  refutation: {
    san: string;
    uci: string;
    capture: boolean;
    mate: boolean;
    effects: string[];
  } | null;
  motifs: { name: string; text: string; fit: number; facts: string[] }[];
  target: "played" | "second-best";
  negativePooledSan: string[];
}

/**
 * Renders an explanation as prose paragraphs: what the move is, what it
 * does, and the positional contrast against the comparison moves.
 */
export function renderProse(input: ProseInput): string[] {
  const player = input.color === "w" ? "White" : "Black";
  const opponent = input.color === "w" ? "Black" : "White";
  const label = `${input.moveNumber}${input.color === "w" ? "." : "..."} ${input.san}`;
  const paragraphs: string[] = [];

  // Paragraph 1: quality + what the move does + threat.
  const quality = (QUALITY_SENTENCE[input.classification] ?? QUALITY_SENTENCE.good!)(input.drop);
  const sentences: string[] = [`${label} ${quality}.`];

  const mate = input.moveEffects.find((f) => f.startsWith("is checkmate"));
  if (mate) {
    sentences.push(`${input.san} ${mate}.`);
  } else {
    const fragments = input.moveEffects.filter((f) => !f.startsWith("is checkmate"));
    if (fragments.length > 0) {
      sentences.push(`It ${joinFragments(fragments)}.`);
    }
    if (input.mateThreat) {
      sentences.push(
        `It also creates a mating threat: ${input.mateThreat.san} would be checkmate if ${opponent} does not stop it.`,
      );
    }
    if (input.refutation) {
      const ref = input.refutation;
      const consequence = ref.mate
        ? "with mate to follow"
        : ref.capture
          ? "winning material"
          : "";
      const why = ref.effects.slice(0, 3).join(" and ");
      sentences.push(
        `${opponent} answers ${ref.san}${consequence ? `, ${consequence}` : ""}` +
          `${why ? ` — it ${why}` : ""}.`,
      );
    }
  }
  paragraphs.push(sentences.join(" "));

  // Paragraph 2: positional contrast, in prose — good moves only. For
  // mistakes and blunders the refutation above carries the story; adding a
  // positional contrast there mostly produces noise.
  const isBad =
    input.classification === "inaccuracy" ||
    input.classification === "mistake" ||
    input.classification === "blunder";
  if (input.motifs.length > 0 && !isBad) {
    const motifProse = input.motifs
      .slice(0, 3)
      .map((m) => {
        const base = personalize(m.text, player);
        const fact = m.facts[0];
        return fact ? `${base} (${fact})` : base;
      })
      .join("; ");
    if (input.target === "played") {
      paragraphs.push(
        `After ${input.san}, ${opponent} takes the initiative: in the engine's lines after ${input.bestSan} instead, ${player} would consistently keep ${motifProse}.`,
      );
    } else {
      const negatives = input.negativePooledSan.join(" or ");
      const weakRef = negatives ? `Compared with weaker moves like ${negatives}` : "Compared with the weaker alternatives";
      paragraphs.push(
        `${weakRef}, the engine's lines after ${input.san} tend to keep: ${motifProse}.`,
      );
    }
  }

  return paragraphs;
}
