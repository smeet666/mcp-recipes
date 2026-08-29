/**
 * BBC Good Food, as a source.
 *
 * An English recipe site addressing a recipe by the path of its page. Two of
 * its statements need care. Its total can sit on the largest number of rows one
 * search will serve, where it states a floor rather than a count. And it keeps
 * some recipes' ingredients and method for its subscribers while publishing the
 * rest of the page, which is a part withheld rather than a part this server
 * failed to read.
 *
 * A difficulty the site writes in a word of its own is not carried, since it
 * publishes no scale for it. Its rendition for readers in the United States is
 * not read either: taking lines from both would make a list in two measuring
 * systems that the site never published as one.
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
} from "./adapter.js";

/** A search row, as BBC Good Food's own reader publishes one. */
export interface GoodFoodRow {
  id: string;
  title: string;
  url: string;
  image_url: string | null;
  rating: number | null;
  rating_count: number | null;
  /** True where the recipe sits behind the site's subscription. */
  premium: boolean;
  total_minutes: number | null;
  difficulty: string | null;
  author: string | null;
}

/** A listing, as that reader publishes one. */
export interface GoodFoodReport {
  query: string;
  results: GoodFoodRow[];
  result_count: number;
  total_available: number | null;
  /** True where the total sits on the largest number of rows one search serves. */
  total_is_ceiling: boolean;
  rows_seen: number;
  restrictions_lifted: string[];
}

/** One line of an ingredient list, as that reader publishes it. */
export interface GoodFoodIngredient {
  text: string;
  amount: number | null;
  unit: string | null;
  item: string;
  note: string | null;
  /** The site's own normalised name for it, which no other source publishes. */
  term: string | null;
}

export interface GoodFoodGroup {
  heading: string | null;
  ingredients: GoodFoodIngredient[];
}

/** A recipe, as that reader publishes one. */
export interface GoodFoodRecipe {
  id: string;
  title: string;
  url: string;
  premium: boolean;
  yield_text: string | null;
  yield_count: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  difficulty: string | null;
  diets: string[];
  author: string | null;
  rating: number | null;
  rating_count: number | null;
  description: string | null;
  /** Empty where the recipe sits behind the subscription. */
  ingredients: GoodFoodGroup[];
  /** Empty where the recipe sits behind the subscription. */
  steps: string[];
  nutrition: Array<{ label: string; value: number | null; unit: string }>;
  nutrition_per: string | null;
  us_edition: unknown;
}

/** The part of BBC Good Food's client this server uses. */
export interface GoodFoodReader {
  searchRecipes: (
    query: string,
    options?: { limit?: number },
  ) => Promise<{ data: GoodFoodReport; cached: boolean; skipped?: string[] }>;
  getRecipe: (id: string) => Promise<{ data: GoodFoodRecipe; cached: boolean; skipped?: string[] }>;
}

export const GOODFOOD_PROFILE = {
  id: "goodfood",
  name: "BBC Good Food",
  homeUrl: "https://www.bbcgoodfood.com",
  language: "en" as const,
  attribution: "Source: BBC Good Food",
  // The search serves recipe pages; a question aimed at the site's reviews and
  // buying guides is answered with recipes all the same.
  mixesReferencePages: false,
};

const SITE_URL = /^https?:\/\/(?:www\.)?bbcgoodfood\.com\//i;
/** The shape BBC Good Food mints: a recipe path. */
const REFERENCE = /^recipes\/[^/]+$/;
/** A segment walking up out of the path it was written in. The site names none. */
const DOT_SEGMENT = /(?:^|\/)\.\.?(?:\/|$)/;
const LEADING_SLASH = /^\/+/;

function asReference(raw: string): string | null {
  const path = raw.replace(LEADING_SLASH, "");
  return REFERENCE.test(path) && !DOT_SEGMENT.test(`/${path}`) ? path : null;
}

/** What the total counts, in words, for the way the site published it. */
export function meansFor(report: Partial<GoodFoodReport>): string | null {
  if (count(report.total_available) === null) {
    return null;
  }
  return report.total_is_ceiling === true
    ? "recipes BBC Good Food says its catalogue matches this wording, cut at the largest number of rows one search will serve, so it states a floor rather than a count"
    : "recipes BBC Good Food says its whole catalogue matches this wording; it counts the catalogue rather than the rows served";
}

/**
 * Repeat the panel the page published, in the site's own wording.
 *
 * The panel arrives as a list rather than as an object, and a figure the page
 * left empty carries a null value: passing it through would put a nutrient in
 * front of a reader that the page said nothing about.
 */
function nutritionPanel(recipe: Partial<GoodFoodRecipe>): Record<string, string> | null {
  const facts = Array.isArray(recipe.nutrition) ? recipe.nutrition : [];
  const kept: Record<string, string> = {};

  for (const fact of facts) {
    const label = text(fact?.label);
    const value = count(fact?.value);
    if (label === null || value === null) {
      continue;
    }
    const unit = text(fact?.unit);
    kept[label] = unit === null ? String(value) : `${value} ${unit}`;
  }

  const per = text(recipe.nutrition_per);
  if (Object.keys(kept).length === 0) {
    return null;
  }
  // What the figures are stated per is part of the panel: a figure without it
  // is a number nobody can put beside another recipe's.
  if (per !== null) {
    kept.per = per;
  }
  return kept;
}

/**
 * The site answers a wording it matches nothing for with a total of zero and no
 * rows, so an absence arrives as an absence and there is no failure here to
 * read as one. Every error the reader raises is a real failure and travels on
 * as one.
 */
export function goodfoodAdapter(reader: GoodFoodReader): SourceAdapter {
  return {
    ...GOODFOOD_PROFILE,

    claims(raw: string): Claim | null {
      if (SITE_URL.test(raw)) {
        const path = asReference(new URL(raw).pathname);
        return path === null
          ? null
          : { reference: path, why: "the address is a BBC Good Food recipe page", guess: false };
      }
      const path = asReference(raw);
      return path === null
        ? null
        : {
            reference: path,
            why: "the path is the shape BBC Good Food mints for a recipe",
            guess: false,
          };
    },

    async search(query: string, limit: number): Promise<ReadRows> {
      // Only the page size is passed. The site's facets and its sort orders are
      // its own vocabulary, and ranking one source's rows while four others are
      // unranked would make a merged list that looks ordered and is not.
      const outcome = await reader.searchRecipes(query, { limit });
      const report = (outcome.data ?? {}) as Partial<GoodFoodReport>;
      const list = rowsOf<Partial<GoodFoodRow>>(report.results, GOODFOOD_PROFILE);
      const rows: RecipeRow[] = [];
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
          id: namespacedId(GOODFOOD_PROFILE.id, id),
          source: GOODFOOD_PROFILE.id,
          sourceName: GOODFOOD_PROFILE.name,
          title,
          url,
          imageUrl: text(summary?.image_url),
          // A row carries a title and a picture and no prose.
          excerpt: null,
        });
      }

      return {
        rows,
        skipped,
        reportedTotal: count(report.total_available),
        reportedTotalMeans: meansFor(report),
        cached: outcome.cached,
      };
    },

    async getRecipe(reference: string): Promise<ReadRecipe> {
      const outcome = await reader.getRecipe(reference);
      return { recipe: goodfoodDetail(outcome.data), cached: outcome.cached };
    },
  };
}

export function goodfoodDetail(payload: unknown): RecipeDetail {
  const recipe = (payload ?? {}) as Partial<GoodFoodRecipe>;

  const published = text(recipe.yield_text);
  const span = readYieldSpan(published);
  const value = count(recipe.rating);

  const groups = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const lines: string[] = [];
  for (const group of groups) {
    // A heading is kept as a line of its own: dropped, two groups that each
    // call for cream would read as the same thing asked for twice.
    const heading = text(group?.heading);
    if (heading !== null) {
      lines.push(heading);
    }
    for (const entry of group?.ingredients ?? []) {
      const line = text(entry?.text);
      if (line !== null) {
        lines.push(line);
      }
    }
  }

  return {
    ...detailBase(GOODFOOD_PROFILE),
    id: namespacedId(GOODFOOD_PROFILE.id, required(recipe.id, "id", GOODFOOD_PROFILE)),
    title: required(recipe.title, "title", GOODFOOD_PROFILE),
    url: required(recipe.url, "url", GOODFOOD_PROFILE),
    // A row carries the picture; the recipe page's own is not read.
    imageUrl: null,
    yieldCount: count(recipe.yield_count) ?? span.count,
    yieldMax: span.max,
    yieldText: published,
    yieldUnit: span.unit,
    ingredients: lines,
    steps: Array.isArray(recipe.steps)
      ? recipe.steps.filter((step): step is string => typeof step === "string")
      : [],
    publishedSections: null,
    prepMinutes: count(recipe.prep_minutes),
    cookMinutes: count(recipe.cook_minutes),
    totalMinutes: count(recipe.total_minutes),
    // The site publishes no resting time of its own.
    restMinutes: null,
    stepsAsOneBlock: null,
    // The page carries these and the site sells access to them. What is said
    // here is what the site did, so an answer never reports a wall as a page
    // this server could not read.
    withheld:
      recipe.premium === true
        ? {
            parts: ["ingredients", "method"],
            why: "BBC Good Food keeps this recipe's ingredients and method for its subscribers, and publishes its title, its times, its rating and its nutrition",
          }
        : null,
    // The site files a recipe under collections rather than under one category
    // on the page itself.
    category: null,
    author: text(recipe.author),
    rating: value === null ? null : { value, count: count(recipe.rating_count), max: 5 },
    nutrition: nutritionPanel(recipe),
    equipment: [],
    tips: [],
    // The site states no licence on a recipe page, and silence is not a grant.
    license: null,
  };
}
