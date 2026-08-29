/**
 * Ptitchef, as a source.
 *
 * A French recipe site addressing a recipe by the path of its page. It answers
 * a search in several ways and prints one total for all of them, so the same
 * number counts a category on one answer and the rows served on another; what
 * it counts is said in words beside it rather than left to be guessed.
 *
 * Two figures the site publishes are not carried. It estimates what a recipe
 * costs in euros, which is a price where another source ranks a recipe inside
 * its own list, and one field holding both would invite the two to be compared.
 * It writes a difficulty in a word of its own and states no scale for it, so
 * the word sits on no axis a caller could put beside another source's.
 */

import type { RecipeDetail, RecipeRow } from "../types.js";
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
} from "./adapter.js";

/** How the site answered a wording, as its own reader reports it. */
export type PtitchefKind =
  | "topic"
  | "free_text"
  | "category"
  | "guide"
  | "standing"
  | "fridge"
  | "recipe"
  | "unmatched";

/** A search row, as Ptitchef's own reader publishes one. */
export interface PtitchefRow {
  id: string;
  title: string;
  url: string;
  image_url: string | null;
  rating: number | null;
  /** How many readers rated it. */
  rating_count: number | null;
  /** How many wrote a review, which counts a different thing. */
  review_count: number | null;
  category: string | null;
  difficulty: string | null;
  total_minutes: number | null;
  calories: string | null;
  ingredients_preview: string | null;
}

/** A listing, as that reader publishes one. */
export interface PtitchefListing {
  asked: string;
  kind: PtitchefKind;
  topic_slug: string | null;
  title: string | null;
  results: PtitchefRow[];
  result_count: number;
  rows_seen: number;
  folded: number;
  total_available: number | null;
  page: number;
  single_page: boolean;
  url: string;
}

/** A recipe, as that reader publishes one. */
export interface PtitchefRecipe {
  id: string;
  title: string;
  url: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  cuisine: string | null;
  difficulty: string | null;
  author: string | null;
  author_url: string | null;
  published: string | null;
  modified: string | null;
  rating: number | null;
  rating_count: number | null;
  review_count: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  yield_count: number | null;
  yield_text: string | null;
  yield_unit: string | null;
  ingredients: string[];
  steps: Array<{ text: string; image_url: string | null }>;
  /** True where the site published its method as one block of prose. */
  steps_are_one_block: boolean;
  /** The panel as the site prints it, slot by slot, unread slots left null. */
  nutrition: unknown;
  estimated_cost: string | null;
  keywords: string[];
  faq: unknown[];
  translations: unknown[];
}

/** The part of Ptitchef's client this server uses. */
export interface PtitchefReader {
  searchRecipes: (
    query: string,
  ) => Promise<{ data: PtitchefListing; cached: boolean; skipped?: string[] }>;
  getRecipe: (id: string) => Promise<{ data: PtitchefRecipe; cached: boolean; skipped?: string[] }>;
}

export const PTITCHEF_PROFILE = {
  id: "ptitchef",
  name: "Ptitchef",
  homeUrl: "https://www.ptitchef.com",
  language: "fr" as const,
  attribution: "Source: Ptitchef",
  // Every row a listing serves names a recipe; a topic the site answers with a
  // guide of its own groups recipes under headings rather than mixing in pages
  // about ingredients.
  mixesReferencePages: false,
};

const SITE_URL = /^https?:\/\/(?:www\.)?ptitchef\.com\//i;
/** The shape Ptitchef mints: a recipe path ending on the page's number. */
const REFERENCE = /^recettes\/[^/]+\/[^/]+-fid-\d+$/;
/** A segment walking up out of the path it was written in. The site names none. */
const DOT_SEGMENT = /(?:^|\/)\.\.?(?:\/|$)/;

const LEADING_SLASH = /^\/+/;

function asReference(raw: string): string | null {
  const path = raw.replace(LEADING_SLASH, "");
  return REFERENCE.test(path) && !DOT_SEGMENT.test(`/${path}`) ? path : null;
}

/**
 * What the one total the site prints counts, in words, for the way it answered.
 *
 * The site reads a wording and may send the reader to a category page of its
 * own, whose total counts that category rather than what the words matched.
 * Reporting the two the same way would let a caller read a count of a whole
 * category as a count of what it searched for.
 */
export function meansFor(listing: Partial<PtitchefListing>): string | null {
  if (count(listing.total_available) === null) {
    return null;
  }
  switch (listing.kind) {
    case "topic":
    case "category":
    case "standing":
      return "recipes Ptitchef says the category page it answered this wording with holds; it counts that page rather than what the words matched";
    case "free_text":
    case "fridge":
      return "rows Ptitchef served on the single page it answered this wording with; the site offers no more for it";
    case "recipe":
      return "the one recipe Ptitchef answered this wording with, by opening its page";
    default:
      // A guide states no total of its own, and a wording the site matched
      // nothing for was never counted.
      return null;
  }
}

/**
 * The site answers a wording it matches nothing for with `kind: "unmatched"`,
 * no rows and no total, so an absence arrives as an absence and there is no
 * failure here to read as one. Every error the reader raises is a real failure
 * and travels on as one.
 */
export function ptitchefAdapter(reader: PtitchefReader): SourceAdapter {
  return {
    ...PTITCHEF_PROFILE,

    claims(raw: string): Claim | null {
      if (SITE_URL.test(raw)) {
        const path = asReference(new URL(raw).pathname);
        return path === null
          ? null
          : { reference: path, why: "the address is a Ptitchef recipe page", guess: false };
      }
      const path = asReference(raw);
      return path === null
        ? null
        : {
            reference: path,
            why: "the path is the shape Ptitchef mints for a recipe",
            guess: false,
          };
    },

    async search(query: string): Promise<ReadRows> {
      // The wording is asked as the site's own search. Its categories and its
      // fridge listing are vocabularies of its own, and a slug from one of them
      // names nothing on any other source.
      const outcome = await reader.searchRecipes(query);
      const listing = (outcome.data ?? {}) as Partial<PtitchefListing>;
      const list = rowsOf<Partial<PtitchefRow>>(listing.results, PTITCHEF_PROFILE);
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
          id: namespacedId(PTITCHEF_PROFILE.id, id),
          source: PTITCHEF_PROFILE.id,
          sourceName: PTITCHEF_PROFILE.name,
          title,
          url,
          imageUrl: text(summary?.image_url),
          excerpt: text(summary?.ingredients_preview),
        });
      }

      return {
        rows,
        skipped,
        reportedTotal: count(listing.total_available),
        reportedTotalMeans: meansFor(listing),
        cached: outcome.cached,
      };
    },

    async getRecipe(reference: string): Promise<ReadRecipe> {
      const outcome = await reader.getRecipe(reference);
      return { recipe: ptitchefDetail(outcome.data), cached: outcome.cached };
    },
  };
}

export function ptitchefDetail(payload: unknown): RecipeDetail {
  const recipe = (payload ?? {}) as Partial<PtitchefRecipe>;

  const published = text(recipe.yield_text);
  const span = readYieldSpan(published);
  const value = count(recipe.rating);

  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const lines = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

  return {
    ...detailBase(PTITCHEF_PROFILE),
    id: namespacedId(PTITCHEF_PROFILE.id, required(recipe.id, "id", PTITCHEF_PROFILE)),
    title: required(recipe.title, "title", PTITCHEF_PROFILE),
    url: required(recipe.url, "url", PTITCHEF_PROFILE),
    imageUrl: text(recipe.image_url),
    yieldCount: count(recipe.yield_count) ?? span.count,
    yieldMax: span.max,
    yieldText: published,
    yieldUnit: text(recipe.yield_unit) ?? span.unit,
    ingredients: lines.filter((line): line is string => typeof line === "string"),
    // A step carries a picture of itself, which is not part of the method.
    steps: steps.map((step) => text(step?.text)).filter((step): step is string => step !== null),
    publishedSections: null,
    prepMinutes: count(recipe.prep_minutes),
    cookMinutes: count(recipe.cook_minutes),
    totalMinutes: count(recipe.total_minutes),
    // The site publishes no resting time of its own.
    restMinutes: null,
    stepsAsOneBlock:
      typeof recipe.steps_are_one_block === "boolean" ? recipe.steps_are_one_block : null,
    withheld: null,
    category: text(recipe.category),
    author: text(recipe.author),
    // The site prints two counts beside a rating, one of readers who rated and
    // one of readers who wrote. Only the first is what a rating rests on, and
    // adding them would count twice anyone who did both.
    rating: value === null ? null : { value, count: count(recipe.rating_count), max: 5 },
    nutrition: publishedFigures(recipe.nutrition),
    equipment: [],
    tips: [],
    // The site states no licence on a recipe page, and silence is not a grant.
    license: null,
  };
}
