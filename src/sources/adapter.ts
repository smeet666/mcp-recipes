/**
 * What a source has to provide to be one.
 *
 * Everything above this file is written for however many sources the registry
 * holds. A source knows four things nothing else does: what it is called, how
 * to recognise one of its own identifiers, how to search it, and how to read one
 * recipe off it. Adding a corpus is writing those four and registering it.
 *
 * The helpers below are the ones every adapter needs, because no source answers
 * with a contract: a field can arrive missing, null, or holding something other
 * than the type it usually holds.
 */

import { parseFailure } from "../errors.js";
import type { Language } from "../recipe/language.js";
import type { RecipeDetail, RecipeRow, SourceId, SourceProfile } from "../types.js";

/** Rows that could be read, and how many could not. */
export interface ReadRows {
  rows: RecipeRow[];
  /** Rows the source sent in a shape this server could not read. */
  skipped: number;
  /** Rows the source said it saw, in the terms that source counts in. */
  reportedTotal: number | null;
  /** What `reportedTotal` counts on this source, in words. Null when it states none. */
  reportedTotalMeans: string | null;
  cached: boolean;
}

export interface ReadRecipe {
  recipe: RecipeDetail;
  cached: boolean;
}

/** How a source recognised a raw identifier as one of its own. */
export interface Claim {
  /** The string this source's own reader takes. */
  reference: string;
  /** Why the shape was read this way, for an answer that has to say so. */
  why: string;
  /**
   * Whether reading it this way is a guess. A shape only this source mints is
   * not; a shape it would merely accept is, and the answer says so.
   */
  guess: boolean;
}

export interface SourceAdapter extends SourceProfile {
  /**
   * Recognise a raw identifier, or decline it.
   *
   * A source claims a shape it mints and declines everything else, so a string
   * no source claims is refused, instead of being sent somewhere that would
   * answer it with a confident absence.
   */
  claims: (raw: string) => Claim | null;
  search: (query: string, limit: number) => Promise<ReadRows>;
  getRecipe: (reference: string) => Promise<ReadRecipe>;
}

/* -------------------------------------------------------------------------- */
/* Reading a value a source sent, without trusting its shape                   */
/* -------------------------------------------------------------------------- */

/**
 * The distinction these draw is between a row and a record. One row this server
 * cannot read is dropped and counted, because the rest of the list is still a
 * good answer. A record it cannot read is `parse_failure`, because there is
 * nothing left to return and a caller told "network_error" would retry a source
 * that has actually changed.
 */
export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function required(value: unknown, field: string, source: SourceProfile): string {
  const found = text(value);
  if (found === null) {
    throw parseFailure(
      `${source.name} answered without a readable "${field}", so there is no recipe to return.`,
    );
  }
  return found;
}

export function rowsOf<T>(value: unknown, source: SourceProfile): T[] {
  if (!Array.isArray(value)) {
    throw parseFailure(
      `${source.name} answered in a shape this server could not read: the list of results was missing.`,
    );
  }
  return value as T[];
}

/** Build the identifier this server hands out for a row from a source. */
export function namespacedId(source: SourceId, reference: string): string {
  return `${source}:${reference}`;
}

/**
 * Keep the entries a page actually published.
 *
 * A nutrition panel arrives with a slot for every figure the source knows how
 * to print, and the slots a page left empty are null. Passing those through
 * would put "protein: null" in front of a reader as though the page had said
 * something about protein.
 *
 * The panel is walked rather than typed, because each source names its slots
 * differently and a figure is repeated as the page wrote it either way.
 */
export function publishedFigures(panel: unknown): Record<string, string> | null {
  if (typeof panel !== "object" || panel === null) {
    return null;
  }
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(panel)) {
    if (typeof value === "string" && value.trim() !== "") {
      kept[key] = value.trim();
    }
  }
  return Object.keys(kept).length > 0 ? kept : null;
}

/**
 * Read a yield that names a span rather than a number.
 *
 * "4 à 6 personnes" and "4 personnes" are different claims, and a source that
 * reports the first as a plain count of four hands this server a factor that is
 * too large for anyone at the upper end. The span is read back off the published
 * wording so the answer can say which end it scaled from.
 */
export function readYieldSpan(published: string | null): {
  count: number | null;
  max: number | null;
  unit: string | null;
} {
  if (published === null) {
    return { count: null, max: null, unit: null };
  }

  const span = /^\s*(\d+(?:[.,]\d+)?)\s*(?:à|a|to|-|–|—|ou|or)\s*(\d+(?:[.,]\d+)?)\s*(.*)$/i.exec(
    published,
  );
  if (span) {
    const [lowText = "", highText = ""] = span.slice(1);
    const low = Number(lowText.replace(",", "."));
    const high = Number(highText.replace(",", "."));
    if (Number.isFinite(low) && Number.isFinite(high) && high > low) {
      return { count: low, max: high, unit: text(span[3]) };
    }
  }

  const single = /^\s*(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(published);
  if (single) {
    const [figure = ""] = single.slice(1);
    const value = Number(figure.replace(",", "."));
    if (Number.isFinite(value)) {
      return { count: value, max: null, unit: text(single[2]) };
    }
  }

  return { count: null, max: null, unit: null };
}

/** Make the language a source publishes in available to whatever reads its lines. */
export function detailBase(source: SourceProfile): {
  source: SourceId;
  sourceName: string;
  language: Language;
  attribution: string;
} {
  return {
    source: source.id,
    sourceName: source.name,
    language: source.language,
    attribution: source.attribution,
  };
}
