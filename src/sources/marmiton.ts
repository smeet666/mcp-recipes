/**
 * Marmiton, as a source.
 *
 * A French recipe site with reader ratings, whose identifiers are digits and
 * whose search serves a single page it disallows paging past.
 */

import type { RecipeDetail } from "../types.js";
import type { Claim, ReadRecipe, ReadRows, SourceAdapter } from "./adapter.js";
import {
  count,
  detailBase,
  namespacedId,
  publishedFigures,
  readYieldSpan,
  required,
  rowsOf,
  text,
  textList,
} from "./adapter.js";

/** A search row, as Marmiton's own reader publishes one. */
export interface MarmitonSummary {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
}

/** A recipe, as Marmiton's own reader publishes one. */
export interface MarmitonRecipe {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
  ingredients: string[];
  steps: string[];
  recipeYield: { count: number | null; unit: string | null; text: string };
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  category: string | null;
  author: string | null;
  rating: { value: number; count: number | null; best: number | null } | null;
  nutrition: unknown;
}

/** The part of Marmiton's client this server uses. */
export interface MarmitonReader {
  search(query: string): Promise<{ data: MarmitonSummary[]; cached: boolean }>;
  getRecipe(ref: { id?: string; url?: string }): Promise<{ data: MarmitonRecipe; cached: boolean }>;
}

export const MARMITON_PROFILE = {
  id: "marmiton",
  name: "Marmiton",
  homeUrl: "https://www.marmiton.org",
  language: "fr" as const,
  attribution: "Source: Marmiton",
  // Every page the search returns is a recipe.
  mixesReferencePages: false,
};

/** Recipe pages, whose address ends in the numeric identifier. */
const SITE_URL = /^https?:\/\/(?:www\.)?marmiton\.org\//i;
/** The shape Marmiton mints: digits and nothing else. */
const REFERENCE = /^\d+$/;

export function marmitonAdapter(reader: MarmitonReader): SourceAdapter {
  return {
    ...MARMITON_PROFILE,

    claims(raw: string): Claim | null {
      if (SITE_URL.test(raw)) {
        return { reference: raw, why: "the address is a Marmiton page", guess: false };
      }
      if (REFERENCE.test(raw)) {
        return {
          reference: raw,
          why: "a bare number is the shape Marmiton mints",
          guess: false,
        };
      }
      return null;
    },

    async search(query: string): Promise<ReadRows> {
      const outcome = await reader.search(query);
      const list = rowsOf<Partial<MarmitonSummary>>(outcome.data, MARMITON_PROFILE);
      const rows = [];
      let skipped = 0;

      for (const summary of list) {
        // A row needs something to call it, somewhere to send a reader, and an
        // identifier that reads back. A row missing any of them is dropped
        // rather than returned with a hole in it.
        const id = text(summary?.id);
        const title = text(summary?.title);
        const url = text(summary?.url);
        if (!id || !title || !url) {
          skipped += 1;
          continue;
        }
        rows.push({
          id: namespacedId(MARMITON_PROFILE.id, id),
          source: MARMITON_PROFILE.id,
          sourceName: MARMITON_PROFILE.name,
          title,
          url,
          imageUrl: text(summary?.imageUrl),
          // The result list carries a title and a picture and no prose, so
          // there is nothing to quote here.
          excerpt: null,
        });
      }

      return {
        rows,
        skipped,
        // Rows on the page, including the ones this server could not read: the
        // site saw them, and reporting only the readable ones would understate
        // what it holds.
        reportedTotal: rows.length + skipped,
        reportedTotalMeans:
          "rows on the single page of results Marmiton serves; the site disallows paging, so this is not a catalogue count",
        cached: outcome.cached,
      };
    },

    async getRecipe(reference: string): Promise<ReadRecipe> {
      // The reader takes an identifier or an address and tells them apart.
      const ref = /^https?:\/\//i.test(reference) ? { url: reference } : { id: reference };
      const outcome = await reader.getRecipe(ref);
      return { recipe: marmitonDetail(outcome.data), cached: outcome.cached };
    },
  };
}

export function marmitonDetail(payload: unknown): RecipeDetail {
  const recipe = (payload ?? {}) as Partial<MarmitonRecipe>;
  const yields = (recipe.recipeYield ?? {}) as Partial<MarmitonRecipe["recipeYield"]>;
  const rating = recipe.rating as Partial<NonNullable<MarmitonRecipe["rating"]>> | null | undefined;
  const value = count(rating?.value);

  // The reader splits the published yield at the first number, which leaves the
  // rest of a span sitting where the word being counted belongs: "4 à 6
  // personnes" arrives as a count of four and a unit of "à 6 personnes". The
  // wording is read again here so both ends of the span are known.
  const published = text(yields.text);
  const span = readYieldSpan(published);

  return {
    ...detailBase(MARMITON_PROFILE),
    id: namespacedId(MARMITON_PROFILE.id, required(recipe.id, "id", MARMITON_PROFILE)),
    title: required(recipe.title, "title", MARMITON_PROFILE),
    url: required(recipe.url, "url", MARMITON_PROFILE),
    imageUrl: text(recipe.imageUrl),
    yieldCount: span.count ?? count(yields.count),
    yieldMax: span.max,
    yieldText: published,
    yieldUnit: span.unit ?? text(yields.unit),
    ingredients: textList(recipe.ingredients),
    steps: textList(recipe.steps),
    prepMinutes: count(recipe.prepMinutes),
    cookMinutes: count(recipe.cookMinutes),
    totalMinutes: count(recipe.totalMinutes),
    category: text(recipe.category),
    author: text(recipe.author),
    rating: value === null ? null : { value, count: count(rating?.count), max: count(rating?.best) },
    nutrition: publishedFigures(recipe.nutrition),
    equipment: [],
    tips: [],
    // Marmiton states no licence on a recipe page, and silence is not a grant.
    license: null,
  };
}
