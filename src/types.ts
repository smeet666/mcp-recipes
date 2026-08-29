/** The shapes the source layer produces. Nothing here knows about MCP. */

import type { Language } from "./recipe/language.js";
import type { PagePart } from "./recipe/sections.js";

/**
 * Which corpus a row, a recipe or a failure came from.
 *
 * A plain string rather than a closed set of names: the sources this server
 * reads are registered rather than compiled in, so adding one is an entry in
 * the registry and changes nothing here. What the server reads today is
 * whatever the registry holds, and an answer names it.
 */
export type SourceId = string;

/** What a source is called, where it lives, and what it asks of a reader. */
export interface SourceProfile {
  id: SourceId;
  /** What to call the source in prose and in a credit line. */
  name: string;
  /** The source's own home, for a reader who wants to go there. */
  homeUrl: string;
  /** The language the source publishes in, which its lines are read in. */
  language: Language;
  /** What a caller has to say when repeating the source's text. */
  attribution: string;
  /**
   * Whether the corpus files pages about ingredients beside recipes using
   * them. Where it does, a search row can be either, and only reading the page
   * tells them apart, so an answer holding rows from such a source says so.
   */
  mixesReferencePages: boolean;
}

/** A search row, trimmed to what picks one recipe out of a list. */
export interface RecipeRow {
  /** Carries the source, and the string get_recipe takes back. */
  id: string;
  source: SourceId;
  sourceName: string;
  title: string;
  url: string;
  imageUrl: string | null;
  /** The gloss or the matching passage the source offered, when it offered one. */
  excerpt: string | null;
}

/** A rating, always with the scale it sits on. */
export interface Rating {
  value: number;
  count: number | null;
  /** The top of the scale. A rating read without it means nothing. */
  max: number | null;
}

/** One recipe, in the shape every source is read into. */
export interface RecipeDetail {
  id: string;
  source: SourceId;
  sourceName: string;
  /** The language this recipe's lines are written in. */
  language: Language;
  title: string;
  url: string;
  imageUrl: string | null;
  /** Servings the page states as a number, when it states one. */
  yieldCount: number | null;
  /**
   * The upper end when the page states a range, as in "4 à 6 personnes". Null
   * when the page names one number, which is the ordinary case.
   */
  yieldMax: number | null;
  /** The yield exactly as published, which can be "4 à 6 personnes" or "24 balls". */
  yieldText: string | null;
  /** What the yield counts, when it counts something other than people. */
  yieldUnit: string | null;
  /** The lines as published, before any scaling. */
  ingredients: string[];
  steps: string[];
  /**
   * The headings the page carries, in the order it carries them, from a source
   * that reports them. Null from a source that does not, which says nothing
   * about how the page is laid out.
   *
   * They are the evidence that separates a part of a recipe this server failed
   * to read from a part the page never published, so an answer can state which
   * of the two it is looking at.
   */
  publishedSections: string[] | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  /**
   * Time the recipe stands, from a source that publishes it apart from
   * preparation and cooking. It belongs to no other source's cooking time, and
   * a source publishing none says null, which is not a dish that needs no rest.
   */
  restMinutes: number | null;
  /**
   * Whether the source publishes the method as one block of prose rather than
   * as steps of its own. Null from a source that says neither, since a single
   * entry can be one block or a method of one step and only the source knows.
   */
  stepsAsOneBlock: boolean | null;
  /**
   * A part the source published nothing of because it keeps it for its
   * subscribers, and the words that say so.
   *
   * Null from a source that withholds nothing. That is a different statement
   * from an empty list: a part withheld is a part the page has, and an answer
   * that read it as a part this server failed to read would say something the
   * page never said.
   */
  withheld: { parts: PagePart[]; why: string } | null;
  category: string | null;
  author: string | null;
  rating: Rating | null;
  /** The panel as published, key by key, with what the page left out omitted. */
  nutrition: Record<string, string> | null;
  equipment: string[];
  tips: string[];
  /** Terms the page is published under, when the source states them. */
  license: { title: string; url: string } | null;
  attribution: string;
}

/**
 * One wording sent to one source, and what came of it.
 *
 * A question is asked in several wordings, so an answer that named only the
 * question would leave a reader unable to tell which of them the rows came
 * from, or whether the widest one was ever tried. Every wording is listed,
 * including the ones held back, so the search can be redone by hand.
 */
export interface WordingAttempt {
  query: string;
  /** How this wording was derived from the question, in words. */
  derivation: string;
  ran: boolean;
  /** Rows this wording returned. Null when it did not run. */
  count: number | null;
  /** Rows it returned that no earlier wording had. Null when it did not run. */
  added: number | null;
  /** Why it was held back, in words. Null when it ran. */
  notRunBecause: string | null;
  /** Why this wording failed. Null when it ran or was held back. */
  error: { code: string; message: string; hint?: string } | null;
}

/**
 * What one source answered, or why it did not.
 *
 * The two travel together so an answer can never read as an absence: a caller
 * seeing `status: "failed"` knows the source was asked and did not reply, which
 * is a different statement from a source that answered and holds nothing.
 */
export interface SourceReport {
  source: SourceId;
  name: string;
  status: "answered" | "failed";
  /** Rows this source contributed to the answer. */
  count: number;
  /**
   * Rows the source said it saw, in the terms that source counts in, for the
   * first wording it answered. A source asked several wordings publishes a
   * number per wording and none across them, so this is never a total of the
   * rows in the answer.
   */
  reportedTotal: number | null;
  /** What `reportedTotal` counts on this source, in words. */
  reportedTotalMeans: string | null;
  /** Every wording this source was sent or held back from, in the order tried. */
  wordings: WordingAttempt[];
  /**
   * Whether this source's rows were arranged so the ones whose title names the
   * dish come first. Done only where several wordings contributed, so a page of
   * near-misses cannot fill the limit and cut away what a later wording found.
   */
  preferredByName: boolean;
  /** Rows the source sent that could not be read, and were left out. */
  skipped: number;
  /** Whether this source files reference pages beside recipes. */
  mixesReferencePages: boolean;
  cached: boolean;
  error: { code: string; message: string; hint?: string } | null;
}

export interface MergedSearch {
  rows: RecipeRow[];
  reports: SourceReport[];
}
