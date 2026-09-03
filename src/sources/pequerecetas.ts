/**
 * Pequerecetas, as a source.
 *
 * A Spanish home-cooking site addressing a recipe by the slug in its address.
 * Two of its habits shape this adapter. It publishes no total anywhere, so an
 * answer states none: the rows of one page would count the page rather than
 * what the site holds. And it serves two different things at the same kind of
 * address, a recipe and an article that gathers other recipes, describing both
 * with the same structured type; a record therefore says which came back, since
 * reading the second as a recipe would offer a dish nobody can cook.
 *
 * The site writes what a recipe is cooked with inside the list it writes the
 * ingredients in, so a line naming a pan arrives among the food. The lines are
 * carried as published and the scaler is what recognises them, which is where
 * that reading belongs: it holds for a list from anywhere.
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

/** A listing row, as Pequerecetas' own reader publishes one. */
export interface PequerecetasListingRow {
  id: string;
  title: string;
  url: string;
  image_url: string | null;
}

/** A page of a listing. The site publishes no total, so none is carried. */
export interface PequerecetasListing {
  rows: PequerecetasListingRow[];
  /** The page the site actually served, which a request past the end never is. */
  page_served: number;
  has_more: boolean;
}

/** One step, with the heading the page grouped it under when it grouped one. */
export interface PequerecetasStep {
  text: string;
  group: string | null;
  url: string | null;
  image: string | null;
}

/** A recipe, as that reader publishes one. */
export interface PequerecetasRecipe {
  id: string;
  title: string;
  url: string;
  description: string | null;
  published_at: string | null;
  modified_at: string | null;
  /**
   * Where the ingredients were read: inside the block the page publishes for
   * search engines, or in the body of the article. It qualifies the reading
   * rather than the recipe, so it is not carried into an answer that stands
   * beside other sources.
   */
  source_shape: "structured" | "article";
  yield_text: string | null;
  /** The lines as published, equipment among them. */
  ingredients: string[];
  steps: PequerecetasStep[];
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  categories: string[];
  cuisines: string[];
  keywords: string[];
  author: string | null;
  author_url: string | null;
  rating: { value: number; count: number; scale: number; worst: number } | null;
  /** A single energy figure, in the words the page printed it with. */
  nutrition: { text: string; calories: number | null } | null;
  images: string[];
}

/** An article that gathers recipes. */
export interface PequerecetasCollection {
  id: string;
  title: string;
  url: string;
  description: string | null;
  published_at: string | null;
  modified_at: string | null;
  /** The headings the article is built from, in the order it prints them. */
  headings: string[];
  recipes: PequerecetasListingRow[];
  images: string[];
}

/** What one address in the recipe section turned out to hold. */
export type PequerecetasPage =
  | { kind: "recipe"; recipe: PequerecetasRecipe }
  | { kind: "collection"; collection: PequerecetasCollection };

/** The part of Pequerecetas' client this server uses. */
export interface PequerecetasReader {
  searchRecipes: (
    query: string,
  ) => Promise<{ data: PequerecetasListing; cached: boolean; skipped?: string[] }>;
  getRecipe: (
    id: string,
  ) => Promise<{ data: PequerecetasPage; cached: boolean; skipped?: string[] }>;
}

export const PEQUERECETAS_PROFILE = {
  id: "pequerecetas",
  name: "Pequerecetas",
  homeUrl: "https://www.pequerecetas.com",
  language: "es" as const,
  attribution: "Source: Pequerecetas",
  rowsThatAreNotRecipes: "an article gathering other recipes",
};

/** Recipe pages, whose address carries the slug the site addresses one by. */
const SITE_RECIPE_URL =
  /^https?:\/\/(?:www\.)?pequerecetas\.com\/receta\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/i;
/**
 * The shape Pequerecetas mints: lowercase words joined by hyphens.
 *
 * Several sites could accept such a string, so a bare slug is claimed as a
 * guess. The hyphen is required, which keeps a single word from being claimed
 * by every source that would take one.
 */
const REFERENCE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

export function pequerecetasAdapter(reader: PequerecetasReader): SourceAdapter {
  return {
    ...PEQUERECETAS_PROFILE,

    claims(raw: string): Claim | null {
      const address = SITE_RECIPE_URL.exec(raw);
      if (address?.[1]) {
        return {
          reference: address[1],
          why: "the address is a Pequerecetas recipe page",
          guess: false,
        };
      }
      if (REFERENCE.test(raw)) {
        return {
          reference: raw,
          why: "hyphenated lowercase words are the shape Pequerecetas mints",
          guess: true,
        };
      }
      return null;
    },

    async search(query: string): Promise<ReadRows> {
      // The site serves one page of results and answers a request for a second
      // with the first again, so nothing here pages. Every readable row is
      // handed over and the caller cuts the list: a row dropped here would be
      // one a second wording could no longer be found to have added, and the
      // count this answer reports would mean fewer rows than the page held.
      const outcome = await reader.searchRecipes(query);
      const listing = (outcome.data ?? {}) as Partial<PequerecetasListing>;
      const list = rowsOf<Partial<PequerecetasListingRow>>(listing.rows, PEQUERECETAS_PROFILE);
      const rows: RecipeRow[] = [];
      let skipped = outcome.skipped?.length ?? 0;

      for (const summary of list) {
        const row = toRow(summary);
        if (row === null) {
          skipped += 1;
          continue;
        }
        rows.push(row);
      }

      return {
        rows,
        skipped,
        // The site prints no count of what a search matched, and the rows of
        // one page are not put here in its place.
        reportedTotal: null,
        reportedTotalMeans: null,
        cached: outcome.cached,
      };
    },

    async getRecipe(reference: string): Promise<ReadRecipe> {
      const outcome = await reader.getRecipe(reference);
      return { recipe: pequerecetasDetail(outcome.data), cached: outcome.cached };
    },
  };
}

/** A listing row, or null when the site sent one this server could not read. */
function toRow(summary: Partial<PequerecetasListingRow> | undefined): RecipeRow | null {
  const id = text(summary?.id);
  const title = text(summary?.title);
  const url = text(summary?.url);
  if (!(id && title && url)) {
    return null;
  }
  return {
    id: namespacedId(PEQUERECETAS_PROFILE.id, id),
    source: PEQUERECETAS_PROFILE.id,
    sourceName: PEQUERECETAS_PROFILE.name,
    title,
    url,
    imageUrl: text(summary?.image_url),
    // A listing row carries no gloss on this site.
    excerpt: null,
  };
}

export function pequerecetasDetail(payload: unknown): RecipeDetail {
  const page = (payload ?? {}) as Partial<PequerecetasPage>;
  if (page.kind === "collection") {
    return collectionDetail((page as { collection?: unknown }).collection);
  }
  return recipeDetail((page as { recipe?: unknown }).recipe);
}

function recipeDetail(payload: unknown): RecipeDetail {
  const recipe = (payload ?? {}) as Partial<PequerecetasRecipe>;
  const rating = recipe.rating as Partial<NonNullable<PequerecetasRecipe["rating"]>> | null;
  const value = count(rating?.value);

  // The site states its yield in words alone, so both the number and what it
  // counts are read back off the wording it published.
  const published = text(recipe.yield_text);
  const span = readYieldSpan(published);

  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const energy = recipe.nutrition as Partial<NonNullable<PequerecetasRecipe["nutrition"]>> | null;
  const figure = text(energy?.text);

  return {
    ...detailBase(PEQUERECETAS_PROFILE),
    id: namespacedId(PEQUERECETAS_PROFILE.id, required(recipe.id, "id", PEQUERECETAS_PROFILE)),
    title: required(recipe.title, "title", PEQUERECETAS_PROFILE),
    url: required(recipe.url, "url", PEQUERECETAS_PROFILE),
    imageUrl: text(recipe.images?.[0]),
    yieldCount: span.count,
    yieldMax: span.max,
    yieldText: published,
    yieldUnit: span.unit,
    // Carried as published, equipment among them: the site writes what a
    // recipe is cooked with in this list, and telling the two apart is the
    // scaler's work rather than this adapter's.
    ingredients: textList(recipe.ingredients),
    steps: steps.map((step) => text(step?.text)).filter((step): step is string => step !== null),
    // The headings the site groups its steps under belong to the method rather
    // than to the page's layout, so no list of published sections is claimed.
    publishedSections: null,
    prepMinutes: count(recipe.prep_minutes),
    cookMinutes: count(recipe.cook_minutes),
    totalMinutes: count(recipe.total_minutes),
    restMinutes: null,
    // The reader hands over the steps it read and says nothing about whether
    // the page numbered them.
    stepsAsOneBlock: null,
    withheld: null,
    gathers: null,
    category: text(recipe.categories?.[0]),
    author: text(recipe.author),
    // The scale is published, so a value is never read against a guess.
    rating:
      value === null ? null : { value, count: count(rating?.count), max: count(rating?.scale) },
    // One figure, repeated in the words the page printed it with. The site
    // states no serving size, so nothing is divided: an amount per serving
    // would be arithmetic the page never showed.
    nutrition: figure === null ? null : { calories: figure },
    // The site keeps no list of its own: what a recipe is cooked with is
    // written among the ingredients.
    equipment: [],
    tips: [],
    // The site states no licence on a recipe page, and silence is not a grant.
    license: null,
  };
}

/**
 * An article that gathers recipes, read as what it is.
 *
 * It carries no ingredients and no method, and that is the page rather than a
 * failure to read it. What it does carry is worth following: the headings it is
 * built from and the recipes it points at.
 */
function collectionDetail(payload: unknown): RecipeDetail {
  const collection = (payload ?? {}) as Partial<PequerecetasCollection>;
  const listed = Array.isArray(collection.recipes) ? collection.recipes : [];

  return {
    ...detailBase(PEQUERECETAS_PROFILE),
    id: namespacedId(PEQUERECETAS_PROFILE.id, required(collection.id, "id", PEQUERECETAS_PROFILE)),
    title: required(collection.title, "title", PEQUERECETAS_PROFILE),
    url: required(collection.url, "url", PEQUERECETAS_PROFILE),
    imageUrl: text(collection.images?.[0]),
    yieldCount: null,
    yieldMax: null,
    yieldText: null,
    yieldUnit: null,
    ingredients: [],
    steps: [],
    publishedSections: null,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    restMinutes: null,
    stepsAsOneBlock: null,
    withheld: null,
    gathers: {
      headings: textList(collection.headings),
      rows: listed.map(toRow).filter((row): row is RecipeRow => row !== null),
    },
    category: null,
    author: null,
    rating: null,
    nutrition: null,
    equipment: [],
    tips: [],
    license: null,
  };
}
