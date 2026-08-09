/**
 * Stand-ins for the sources, and the fixed answers they give.
 *
 * Every value here is written out rather than captured from a live page, so no
 * third-party text lives in this repository and a test never depends on what a
 * source happens to publish today.
 */

import { RecipesClient } from "../../src/sources/client.js";
import { cookbookAdapter } from "../../src/sources/cookbook.js";
import type {
  CookbookReader,
  CookbookRecipe,
  CookbookSummary,
} from "../../src/sources/cookbook.js";
import { marmitonAdapter } from "../../src/sources/marmiton.js";
import type {
  MarmitonReader,
  MarmitonRecipe,
  MarmitonSummary,
} from "../../src/sources/marmiton.js";

/** A failure shaped the way a source's own reader raises one. */
export class FakeSourceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: { hint?: string } = {},
  ) {
    super(message);
    this.name = "FakeSourceError";
  }
}

export const marmitonRows: MarmitonSummary[] = [
  {
    id: "1001",
    title: "Crêpes de la Chandeleur",
    url: "https://www.marmiton.org/recettes/recette_r_1001.aspx",
    imageUrl: "https://assets.example/1001.jpg",
  },
  {
    id: "1002",
    title: "Pâte à crêpes sans repos",
    url: "https://www.marmiton.org/recettes/recette_r_1002.aspx",
    imageUrl: null,
  },
];

export const cookbookRows: CookbookSummary[] = [
  {
    key: "Cookbook:Crepes",
    title: "Cookbook:Crepes",
    description: "A thin pancake",
    excerpt: "Crepes are thin pancakes cooked on a flat pan.",
    imageUrl: null,
    sourceUrl: "https://en.wikibooks.org/wiki/Cookbook:Crepes",
  },
  {
    key: "Cookbook:Buckwheat Crepes",
    title: "Cookbook:Buckwheat Crepes",
    description: null,
    excerpt: null,
    imageUrl: null,
    sourceUrl: "https://en.wikibooks.org/wiki/Cookbook:Buckwheat_Crepes",
  },
];

export const marmitonRecipe: MarmitonRecipe = {
  id: "1001",
  title: "Crêpes de la Chandeleur",
  url: "https://www.marmiton.org/recettes/recette_r_1001.aspx",
  imageUrl: "https://assets.example/1001.jpg",
  ingredients: [
    "250 g de farine",
    "4 oeufs",
    "1/2 litre de lait",
    "une pincée de sel",
    "1 cuillère à soupe de rhum",
    "sucre",
  ],
  steps: ["Mélanger la farine et les oeufs.", "Ajouter le lait peu à peu.", "Laisser reposer."],
  recipeYield: { count: 4, unit: "personnes", text: "4 personnes" },
  prepMinutes: 10,
  cookMinutes: 20,
  totalMinutes: 30,
  category: "Dessert",
  author: "Chandeleur",
  rating: { value: 4.7, count: 240, best: 5 },
  nutrition: { calories: "320 kcal", protein: null, servingSize: "1 crêpe" },
};

export const cookbookRecipe: CookbookRecipe = {
  key: "Cookbook:Crepes",
  title: "Cookbook:Crepes",
  sourceUrl: "https://en.wikibooks.org/wiki/Cookbook:Crepes",
  license: {
    title: "Creative Commons Attribution-Share Alike 4.0",
    url: "https://creativecommons.org/licenses/by-sa/4.0/deed.en",
  },
  description: "Thin pancakes.",
  category: "Pancake recipes",
  servings: 8,
  yieldText: "8",
  yieldUnit: null,
  totalMinutes: 45,
  ingredients: [
    "250 g (2 cups) flour",
    "4 eggs",
    "500 ml milk",
    "a pinch of salt",
    "1 tablespoon rum",
    "Sugar, to taste",
  ],
  equipment: ["A flat pan"],
  steps: ["Whisk the flour and the eggs.", "Add the milk gradually.", "Rest the batter."],
  tips: ["A rested batter cooks more evenly."],
  nutrition: null,
  sectionTitles: ["Ingredients", "Procedure", "Notes, tips, and variations"],
};

/**
 * A page heading an ingredient list that came back holding no line, which is
 * what a list written in a layout the reader cannot follow looks like.
 */
export const unreadIngredientsRecipe: CookbookRecipe = {
  ...cookbookRecipe,
  key: "Cookbook:Almond Cake",
  title: "Cookbook:Almond Cake",
  sourceUrl: "https://en.wikibooks.org/wiki/Cookbook:Almond_Cake",
  ingredients: [],
  sectionTitles: ["Ingredients", "Cake", "Glaze", "Procedure"],
};

/** A page heading a method that came back holding no step. */
export const unreadStepsRecipe: CookbookRecipe = {
  ...cookbookRecipe,
  key: "Cookbook:Almond Tart",
  title: "Cookbook:Almond Tart",
  sourceUrl: "https://en.wikibooks.org/wiki/Cookbook:Almond_Tart",
  steps: [],
  sectionTitles: ["Ingredients", "Procedure", "Cake", "Glaze"],
};

/** A page listing other pages, which heads neither part of a recipe. */
export const referencePage: CookbookRecipe = {
  ...cookbookRecipe,
  key: "Cookbook:Cake",
  title: "Cookbook:Cake",
  sourceUrl: "https://en.wikibooks.org/wiki/Cookbook:Cake",
  ingredients: [],
  steps: [],
  tips: [],
  equipment: [],
  sectionTitles: ["Recipes", "Variations"],
};

/** A page whose yield the source never stated, which cannot be rescaled. */
export const yieldlessRecipe: CookbookRecipe = {
  ...cookbookRecipe,
  key: "Cookbook:Pancake Batter",
  title: "Cookbook:Pancake Batter",
  sourceUrl: "https://en.wikibooks.org/wiki/Cookbook:Pancake_Batter",
  servings: null,
  yieldText: null,
  sectionTitles: ["Ingredients", "Procedure"],
};

export interface FakeOptions {
  marmiton?: {
    /** Fails everything this source is asked. */
    fail?: Error;
    /** Fails only the read of one recipe, so a search still offers a row. */
    failRecipe?: Error;
    rows?: MarmitonSummary[];
    recipe?: MarmitonRecipe;
    cached?: boolean;
  };
  cookbook?: {
    fail?: Error;
    failRecipe?: Error;
    rows?: CookbookSummary[];
    recipe?: CookbookRecipe;
    cached?: boolean;
  };
}

export function fakeMarmiton(options: NonNullable<FakeOptions["marmiton"]> = {}): MarmitonReader {
  return {
    async search() {
      if (options.fail) throw options.fail;
      return { data: options.rows ?? marmitonRows, cached: options.cached ?? false };
    },
    async getRecipe() {
      if (options.fail) throw options.fail;
      if (options.failRecipe) throw options.failRecipe;
      return { data: options.recipe ?? marmitonRecipe, cached: options.cached ?? false };
    },
  };
}

export function fakeCookbook(options: NonNullable<FakeOptions["cookbook"]> = {}): CookbookReader {
  return {
    async search() {
      if (options.fail) throw options.fail;
      return { data: { results: options.rows ?? cookbookRows }, cached: options.cached ?? false };
    },
    async getRecipe() {
      if (options.fail) throw options.fail;
      if (options.failRecipe) throw options.failRecipe;
      return { data: options.recipe ?? cookbookRecipe, cached: options.cached ?? false };
    },
  };
}

export const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function fakeClient(options: FakeOptions = {}): RecipesClient {
  return new RecipesClient({
    logger: silentLogger,
    readers: {
      marmiton: fakeMarmiton(options.marmiton ?? {}),
      cookbook: fakeCookbook(options.cookbook ?? {}),
    },
  });
}

/** The text block a tool returned, which is what many clients render. */
export function textOf(result: { content: Array<{ text: string }> }): string {
  return result.content.map((part) => part.text).join("\n");
}

/** The structured payload a tool returned, which an error result does not have. */
export function payloadOf<T = Record<string, unknown>>(result: {
  structuredContent?: Record<string, unknown>;
}): T {
  if (!result.structuredContent) throw new Error("the tool returned no structured content");
  return result.structuredContent as T;
}

/** The arguments a caller sends search_recipes, with the defaults filled in. */
export function searchArgs(
  over: Partial<import("../../src/tools/searchRecipes.js").SearchRecipesArgs> & { query: string },
): import("../../src/tools/searchRecipes.js").SearchRecipesArgs {
  return { limit_per_source: 5, fan_out: true, ...over };
}

/** The arguments a caller sends get_recipe, with the defaults the schema fills in. */
export function recipeArgs(
  over: Partial<import("../../src/tools/getRecipe.js").GetRecipeArgs> & { id: string },
): import("../../src/tools/getRecipe.js").GetRecipeArgs {
  return { sections: ["ingredients"], max_steps: 20, max_step_chars: 600, ...over };
}

/** The arguments a caller sends compare_recipes, with the defaults filled in. */
export function compareArgs(
  over: Partial<import("../../src/tools/compareRecipes.js").CompareRecipesArgs> & { dish: string },
): import("../../src/tools/compareRecipes.js").CompareRecipesArgs {
  return { sections: ["ingredients"], max_steps: 10, max_step_chars: 600, ...over };
}

/** The source adapters a test resolves identifiers against. */
export function fakeSources() {
  return [marmitonAdapter(fakeMarmiton()), cookbookAdapter(fakeCookbook())];
}
