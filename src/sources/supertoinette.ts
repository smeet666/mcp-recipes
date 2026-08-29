/**
 * Supertoinette, as a source.
 *
 * A French recipe site addressing a recipe by a number. It prints no total on
 * a search page and publishes no nutrition panel, and both of those are stated
 * here as silence: a count nobody published is not a count of zero.
 */

import type { RecipeDetail, RecipeRow } from "../types.js";
import type { Claim, ReadRecipe, ReadRows, SourceAdapter } from "./adapter.js";
import {
  count,
  detailBase,
  namespacedId,
  readYieldSpan,
  required,
  rowsOf,
  text,
  textList,
} from "./adapter.js";

/** A search row, as Supertoinette's own reader publishes one. */
export interface SupertoinetteListingRow {
  id: string;
  title: string;
  title_as_published: string;
  url: string;
  image_url: string | null;
  description: string | null;
  categories: string[];
}

/** One line of an ingredient list, as that reader publishes it. */
export interface SupertoinetteIngredient {
  amount_text: string | null;
  label: string;
  /** The whole line as published, quantity included. */
  raw: string;
  /** The ingredient page the site linked the words to. Not read: the site
   * links the wrong page often enough that pairing recipes by it would pair
   * the wrong recipes. */
  sheet: unknown;
  is_heading: boolean;
}

/** A recipe, as Supertoinette's own reader publishes one. */
export interface SupertoinetteRecipe {
  id: string;
  title: string;
  title_as_published: string;
  url: string;
  description: string | null;
  yield_text: string | null;
  ingredients: SupertoinetteIngredient[];
  steps: string[];
  intro: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  /** Time the recipe stands, which the site prints on its own. */
  rest_minutes: number | null;
  category: string | null;
  author: string | null;
  rating: { value: number; count: number; scale: number } | null;
  /** The site publishes none, and the field says so rather than being absent. */
  nutrition: null;
  difficulty: { label: string } | null;
  cost_level: { label: string; level: number; scale: number } | null;
  images: string[];
  tags: unknown[];
  ingredient_sheets: unknown[];
  faq: unknown[];
}

interface SupertoinetteListing {
  results: SupertoinetteListingRow[];
  rows_published: number;
  total_available: null;
  last_page: number;
  facets: unknown[];
  matched_nothing: boolean;
  url: string;
}

/** The part of Supertoinette's client this server uses. */
export interface SupertoinetteReader {
  searchRecipes: (request: { query: string; page: number; category: string | null }) => Promise<{
    data: { listing: SupertoinetteListing; dropped_category: string | null };
    cached: boolean;
    skipped?: string[];
  }>;
  getRecipe: (
    id: string,
  ) => Promise<{ data: SupertoinetteRecipe; cached: boolean; skipped?: string[] }>;
}

export const SUPERTOINETTE_PROFILE = {
  id: "supertoinette",
  name: "Supertoinette",
  homeUrl: "https://www.supertoinette.com",
  language: "fr" as const,
  attribution: "Source: Supertoinette",
  // The reader sets aside any row that opens onto something other than a
  // recipe, so what arrives here is recipes.
  mixesReferencePages: false,
};

/** Recipe pages, whose address carries the number the site addresses it by. */
const SITE_RECIPE_URL = /^https?:\/\/(?:www\.)?supertoinette\.com\/recette\/([1-9][0-9]{0,9})\//i;
/** The shape Supertoinette mints: a number, and never a leading zero. */
const REFERENCE = /^[1-9][0-9]{0,9}$/;

/**
 * The site answers a wording it matches nothing for with an empty listing and
 * `matched_nothing`, so an absence arrives as an absence and there is no
 * failure here to read as one. Every error the reader raises is a real failure
 * and travels on as one.
 */
export function supertoinetteAdapter(reader: SupertoinetteReader): SourceAdapter {
  return {
    ...SUPERTOINETTE_PROFILE,

    claims(raw: string): Claim | null {
      const address = SITE_RECIPE_URL.exec(raw);
      if (address?.[1]) {
        return {
          reference: address[1],
          why: "the address is a Supertoinette recipe page",
          guess: false,
        };
      }
      if (REFERENCE.test(raw)) {
        return {
          reference: raw,
          why: "a bare number is the shape Supertoinette mints",
          guess: false,
        };
      }
      return null;
    },

    async search(query: string): Promise<ReadRows> {
      // The site pages rather than serving a longer first page, and a wording
      // is asked as one search rather than followed across pages. No category
      // is named, because a facet belongs to the site that writes it.
      const outcome = await reader.searchRecipes({ query, page: 1, category: null });
      const listing = (outcome.data?.listing ?? {}) as Partial<SupertoinetteListing>;
      const list = rowsOf<Partial<SupertoinetteListingRow>>(listing.results, SUPERTOINETTE_PROFILE);
      const rows: RecipeRow[] = [];
      // Rows the reader itself set aside, each with the reason it gave.
      let skipped = outcome.skipped?.length ?? 0;

      for (const summary of list) {
        const id = text(summary?.id);
        const title = text(summary?.title);
        const url = text(summary?.url);
        if (!(id && title && url)) {
          skipped += 1;
          continue;
        }
        rows.push({
          id: namespacedId(SUPERTOINETTE_PROFILE.id, id),
          source: SUPERTOINETTE_PROFILE.id,
          sourceName: SUPERTOINETTE_PROFILE.name,
          title,
          url,
          imageUrl: text(summary?.image_url),
          excerpt: text(summary?.description),
        });
      }

      return {
        rows,
        skipped,
        // The site prints no total anywhere on a search page. The rows of one
        // page are not put here in its place: the site pages, so they would
        // understate what it holds rather than count it.
        reportedTotal: null,
        reportedTotalMeans: null,
        cached: outcome.cached,
      };
    },

    async getRecipe(reference: string): Promise<ReadRecipe> {
      const outcome = await reader.getRecipe(reference);
      return { recipe: supertoinetteDetail(outcome.data), cached: outcome.cached };
    },
  };
}

export function supertoinetteDetail(payload: unknown): RecipeDetail {
  const recipe = (payload ?? {}) as Partial<SupertoinetteRecipe>;
  const rating = recipe.rating as Partial<NonNullable<SupertoinetteRecipe["rating"]>> | null;
  const value = count(rating?.value);

  // The site states its yield in words alone, so both the number and what it
  // counts are read back off the wording it published.
  const published = text(recipe.yield_text);
  const span = readYieldSpan(published);

  const lines = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

  return {
    ...detailBase(SUPERTOINETTE_PROFILE),
    id: namespacedId(SUPERTOINETTE_PROFILE.id, required(recipe.id, "id", SUPERTOINETTE_PROFILE)),
    title: required(recipe.title, "title", SUPERTOINETTE_PROFILE),
    url: required(recipe.url, "url", SUPERTOINETTE_PROFILE),
    imageUrl: text(recipe.images?.[0]),
    yieldCount: span.count,
    yieldMax: span.max,
    yieldText: published,
    yieldUnit: span.unit,
    // The whole line as printed, headings included: a heading dropped would
    // merge two groups of a recipe that may each call for the same thing.
    // The ingredient page the site links a line to is not carried, since the
    // site links the wrong page often enough that pairing recipes by it would
    // pair the wrong recipes.
    ingredients: lines
      .map((line) => text(line?.raw))
      .filter((line): line is string => line !== null),
    steps: textList(recipe.steps),
    publishedSections: null,
    prepMinutes: count(recipe.prep_minutes),
    cookMinutes: count(recipe.cook_minutes),
    totalMinutes: count(recipe.total_minutes),
    // The site prints this on its own, and its own total already holds it.
    // Adding it to anything here would count it twice.
    restMinutes: count(recipe.rest_minutes),
    // The reader hands over the steps it read and says nothing about whether
    // the page numbered them.
    stepsAsOneBlock: null,
    withheld: null,
    category: text(recipe.category),
    author: text(recipe.author),
    // The scale is published, so a value is never read against a guess.
    rating:
      value === null ? null : { value, count: count(rating?.count), max: count(rating?.scale) },
    // This site publishes no nutrition panel at all, so there is nothing here
    // to repeat. An empty panel would read as a page that printed one and left
    // every figure out.
    nutrition: null,
    equipment: [],
    tips: [],
    // The site states no licence on a recipe page, and silence is not a grant.
    license: null,
  };
}
