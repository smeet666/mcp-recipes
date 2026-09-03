/**
 * The Cookbook on the English Wikibooks, as a source.
 *
 * A wiki written by whoever edits it, published under a licence that requires
 * attribution, with no author and no reader rating by nature. Its identifiers
 * are page keys carrying the namespace every Cookbook page lives in.
 */

import { invalidInput } from "../errors.js";
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
  textList,
} from "./adapter.js";

/** A search row, as the Cookbook's own reader publishes one. */
export interface CookbookSummary {
  key: string;
  title: string;
  description: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  sourceUrl: string;
}

/** A page, as the Cookbook's own reader publishes one. */
export interface CookbookRecipe {
  key: string;
  title: string;
  sourceUrl: string;
  license: { title: string; url: string } | null;
  description: string | null;
  category: string | null;
  servings: number | null;
  yieldText: string | null;
  yieldUnit: string | null;
  totalMinutes: number | null;
  ingredients: string[];
  equipment: string[];
  steps: string[];
  tips: string[];
  nutrition: unknown;
  sectionTitles: string[];
}

/** The part of the Cookbook's client this server uses. */
export interface CookbookReader {
  search: (
    query: string,
    limit: number,
  ) => Promise<{ data: { results: CookbookSummary[] }; cached: boolean }>;
  getRecipe: (reference: string) => Promise<{ data: CookbookRecipe; cached: boolean }>;
}

export const COOKBOOK_PROFILE = {
  id: "cookbook",
  name: "Wikibooks Cookbook",
  homeUrl: "https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents",
  language: "en" as const,
  attribution: "Source: Wikibooks Cookbook",
  rowsThatAreNotRecipes: "a page about an ingredient",
};

const SITE_URL = /^https?:\/\/en\.wikibooks\.org\/wiki\//i;
/** The namespace every page in the Cookbook lives under. */
const NAMESPACE = /^cookbook\s*:/i;

/**
 * Every page in the Cookbook is filed under one namespace, so its title arrives
 * as "Cookbook:Spaghetti alla Carbonara". The prefix is where the page lives on
 * the wiki rather than what the dish is called, and repeating it on every row of
 * a list says nothing and crowds out the names. The key keeps it, because that
 * is the string the site resolves.
 */
function dishName(title: string): string {
  return title.replace(NAMESPACE, "").trim() || title;
}

export function cookbookAdapter(reader: CookbookReader): SourceAdapter {
  return {
    ...COOKBOOK_PROFILE,

    claims(raw: string): Claim | null {
      if (SITE_URL.test(raw)) {
        let key: string;
        try {
          key = decodeURIComponent(raw.replace(SITE_URL, "")).replace(/_/g, " ");
        } catch (cause) {
          // A percent sign that opens no escape is common in a wiki title, and
          // it is the caller's string rather than a site that failed.
          throw invalidInput(
            `"${raw}" carries a percent sign that is not a valid escape, so the page name cannot be read.`,
            "Pass the id search_recipes returned instead of the address.",
            cause,
          );
        }
        return {
          reference: key,
          why: "the address is a page on the English Wikibooks",
          guess: false,
        };
      }

      if (NAMESPACE.test(raw)) {
        return {
          reference: raw,
          why: "the name opens with the namespace every Cookbook page lives under",
          guess: false,
        };
      }

      return null;
    },

    async search(query: string, limit: number): Promise<ReadRows> {
      const outcome = await reader.search(query, limit);
      const list = rowsOf<Partial<CookbookSummary>>(
        (outcome.data as { results?: unknown })?.results,
        COOKBOOK_PROFILE,
      );
      const rows: RecipeRow[] = [];
      let skipped = 0;

      for (const summary of list) {
        const key = text(summary?.key);
        const title = text(summary?.title) ?? key;
        const url = text(summary?.sourceUrl);
        if (!(key && title && url)) {
          skipped += 1;
          continue;
        }
        rows.push({
          id: namespacedId(COOKBOOK_PROFILE.id, key),
          source: COOKBOOK_PROFILE.id,
          sourceName: COOKBOOK_PROFILE.name,
          title: dishName(title),
          url,
          imageUrl: text(summary?.imageUrl),
          excerpt: text(summary?.excerpt) ?? text(summary?.description),
        });
      }

      return {
        rows,
        skipped,
        // The gateway states no total and offers no second page, so there is no
        // number to report. Counting the rows returned and calling it a total
        // would invent one.
        reportedTotal: null,
        reportedTotalMeans: null,
        cached: outcome.cached,
      };
    },

    async getRecipe(reference: string): Promise<ReadRecipe> {
      const outcome = await reader.getRecipe(reference);
      return { recipe: cookbookDetail(outcome.data), cached: outcome.cached };
    },
  };
}

export function cookbookDetail(payload: unknown): RecipeDetail {
  const recipe = (payload ?? {}) as Partial<CookbookRecipe>;
  const license = recipe.license as Partial<NonNullable<CookbookRecipe["license"]>> | null;
  const licenseTitle = text(license?.title);
  const licenseUrl = text(license?.url);

  const published = text(recipe.yieldText);
  const span = readYieldSpan(published);

  return {
    ...detailBase(COOKBOOK_PROFILE),
    id: namespacedId(COOKBOOK_PROFILE.id, required(recipe.key, "key", COOKBOOK_PROFILE)),
    title: dishName(required(recipe.title ?? recipe.key, "title", COOKBOOK_PROFILE)),
    url: required(recipe.sourceUrl, "url", COOKBOOK_PROFILE),
    // The page source carries no picture this server can address.
    imageUrl: null,
    yieldCount: count(recipe.servings) ?? span.count,
    yieldMax: span.max,
    yieldText: published,
    yieldUnit: text(recipe.yieldUnit) ?? span.unit,
    ingredients: textList(recipe.ingredients),
    steps: textList(recipe.steps),
    // The page's own headings, which the reader reports. An answer holding no
    // ingredient line uses them to say whether the page announced a list.
    publishedSections: Array.isArray(recipe.sectionTitles) ? textList(recipe.sectionTitles) : null,
    // The Cookbook publishes one time for a recipe rather than splitting it.
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: count(recipe.totalMinutes),
    gathers: null,
    category: text(recipe.category),
    // The page is written by everyone who edited it, so it credits nobody in
    // particular and carries no reader rating.
    author: null,
    rating: null,
    nutrition: publishedFigures(recipe.nutrition),
    equipment: textList(recipe.equipment),
    tips: textList(recipe.tips),
    // The Cookbook publishes no resting time, says nothing about how a page
    // lays its method out, and keeps nothing behind a subscription.
    restMinutes: null,
    stepsAsOneBlock: null,
    withheld: null,
    // A licence is only stated when both halves of it arrived: a name with no
    // address, or an address with no name, is not terms anyone can follow.
    license: licenseTitle && licenseUrl ? { title: licenseTitle, url: licenseUrl } : null,
  };
}
