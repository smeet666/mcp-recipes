/**
 * Stand-ins for the sources, and the fixed answers they give.
 *
 * Every value here is written out rather than captured from a live page, so no
 * third-party text lives in this repository and a test never depends on what a
 * source happens to publish today.
 */

import { RecipesClient } from "../../src/sources/client.js";
import type { Readers } from "../../src/sources/registry.js";
import { cookbookAdapter } from "../../src/sources/cookbook.js";
import type {
  CookbookReader,
  CookbookRecipe,
  CookbookSummary,
} from "../../src/sources/cookbook.js";
import { goodfoodAdapter } from "../../src/sources/goodfood.js";
import type {
  GoodFoodReader,
  GoodFoodRecipe,
  GoodFoodReport,
  GoodFoodRow,
} from "../../src/sources/goodfood.js";
import { marmitonAdapter } from "../../src/sources/marmiton.js";
import type {
  MarmitonReader,
  MarmitonRecipe,
  MarmitonSummary,
} from "../../src/sources/marmiton.js";
import { ptitchefAdapter } from "../../src/sources/ptitchef.js";
import type {
  PtitchefListing,
  PtitchefReader,
  PtitchefRecipe,
  PtitchefRow,
} from "../../src/sources/ptitchef.js";
import { pequerecetasAdapter } from "../../src/sources/pequerecetas.js";
import type {
  PequerecetasListingRow,
  PequerecetasPage,
  PequerecetasReader,
  PequerecetasRecipe,
} from "../../src/sources/pequerecetas.js";
import { supertoinetteAdapter } from "../../src/sources/supertoinette.js";
import type {
  SupertoinetteListingRow,
  SupertoinetteReader,
  SupertoinetteRecipe,
} from "../../src/sources/supertoinette.js";

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

/* -------------------------------------------------------------------------- */
/* Ptitchef                                                                    */
/* -------------------------------------------------------------------------- */

export const ptitchefRows: PtitchefRow[] = [
  {
    id: "recettes/dessert/crepes-de-la-chandeleur-fid-20001",
    title: "Crêpes de la Chandeleur",
    url: "https://www.ptitchef.com/recettes/dessert/crepes-de-la-chandeleur-fid-20001",
    image_url: "https://images.example/20001.jpg",
    rating: 4.2,
    rating_count: 80,
    review_count: 21,
    category: "Dessert",
    difficulty: "facile",
    total_minutes: 35,
    calories: "210 kcal / 1 crêpe",
    ingredients_preview: "farine, oeufs, lait",
  },
  {
    id: "recettes/dessert/crepes-au-sarrasin-fid-20002",
    title: "Crêpes au sarrasin",
    url: "https://www.ptitchef.com/recettes/dessert/crepes-au-sarrasin-fid-20002",
    image_url: null,
    rating: null,
    rating_count: null,
    review_count: null,
    category: null,
    difficulty: null,
    total_minutes: null,
    calories: null,
    ingredients_preview: null,
  },
];

export const ptitchefListing: PtitchefListing = {
  asked: "crepes",
  kind: "free_text",
  topic_slug: null,
  title: null,
  results: ptitchefRows,
  result_count: ptitchefRows.length,
  rows_seen: ptitchefRows.length,
  folded: 0,
  total_available: 2,
  page: 1,
  single_page: true,
  url: "https://www.ptitchef.com/recherche?q=crepes",
};

export const ptitchefRecipe: PtitchefRecipe = {
  id: "recettes/dessert/crepes-de-la-chandeleur-fid-20001",
  title: "Crêpes de la Chandeleur",
  url: "https://www.ptitchef.com/recettes/dessert/crepes-de-la-chandeleur-fid-20001",
  description: "Les crêpes de février",
  image_url: "https://images.example/20001.jpg",
  category: "Dessert",
  cuisine: "Fr",
  difficulty: "facile",
  author: "Camille",
  author_url: null,
  published: null,
  modified: null,
  rating: 4.2,
  rating_count: 80,
  review_count: 21,
  prep_minutes: 15,
  cook_minutes: 20,
  total_minutes: 35,
  yield_count: 4,
  yield_text: "4 personnes",
  yield_unit: "personnes",
  ingredients: ["300 g de farine", "3 oeufs", "600 ml de lait", "1 pincée de sel"],
  steps: [
    { text: "Mélanger la farine et les oeufs.", image_url: null },
    { text: "Verser le lait peu à peu.", image_url: null },
  ],
  steps_are_one_block: false,
  nutrition: { serving_size: "1 crêpe", calories: "210 kcal", protein: "6 g" },
  estimated_cost: "1,80 €",
  keywords: ["crêpes"],
  faq: [],
  translations: [],
};

/** A recipe whose method the site published as one block of prose. */
export const oneBlockRecipe: PtitchefRecipe = {
  ...ptitchefRecipe,
  id: "recettes/dessert/crepes-au-sarrasin-fid-20002",
  title: "Crêpes au sarrasin",
  url: "https://www.ptitchef.com/recettes/dessert/crepes-au-sarrasin-fid-20002",
  steps: [{ text: "Mélanger le tout, laisser reposer, puis cuire à feu vif.", image_url: null }],
  steps_are_one_block: true,
};

/* -------------------------------------------------------------------------- */
/* BBC Good Food                                                               */
/* -------------------------------------------------------------------------- */

export const goodfoodRows: GoodFoodRow[] = [
  {
    id: "recipes/classic-crepes",
    title: "Classic crêpes",
    url: "https://www.bbcgoodfood.com/recipes/classic-crepes",
    image_url: "https://images.example/crepes.jpg",
    rating: 4.6,
    rating_count: 150,
    premium: false,
    total_minutes: 30,
    difficulty: "Easy",
    author: "Good Food team",
  },
  {
    id: "recipes/crepes-suzette",
    title: "Crêpes Suzette",
    url: "https://www.bbcgoodfood.com/recipes/crepes-suzette",
    image_url: null,
    rating: null,
    rating_count: null,
    premium: true,
    total_minutes: null,
    difficulty: null,
    author: null,
  },
];

export const goodfoodReport: GoodFoodReport = {
  query: "crepes",
  results: goodfoodRows,
  result_count: goodfoodRows.length,
  total_available: 84,
  total_is_ceiling: false,
  rows_seen: goodfoodRows.length,
  restrictions_lifted: [],
};

export const goodfoodRecipe: GoodFoodRecipe = {
  id: "recipes/classic-crepes",
  title: "Classic crêpes",
  url: "https://www.bbcgoodfood.com/recipes/classic-crepes",
  premium: false,
  yield_text: "Serves 4",
  yield_count: 4,
  prep_minutes: 10,
  cook_minutes: 20,
  total_minutes: 30,
  difficulty: "Easy",
  diets: [],
  author: "Good Food team",
  rating: 4.6,
  rating_count: 150,
  description: "Thin pancakes",
  ingredients: [
    {
      heading: "For the batter",
      ingredients: [
        {
          text: "250g plain flour",
          amount: 250,
          unit: "g",
          item: "plain flour",
          note: null,
          term: "flour",
        },
        { text: "4 eggs", amount: 4, unit: null, item: "eggs", note: null, term: "egg" },
        { text: "500ml milk", amount: 500, unit: "ml", item: "milk", note: null, term: "milk" },
      ],
    },
    {
      heading: "To serve",
      ingredients: [
        {
          text: "1 tbsp caster sugar",
          amount: 1,
          unit: "tbsp",
          item: "caster sugar",
          note: null,
          term: "sugar",
        },
      ],
    },
  ],
  steps: ["Whisk the flour and eggs.", "Add the milk gradually.", "Fry each crêpe."],
  nutrition: [
    { label: "kcal", value: 280, unit: "" },
    { label: "fat", value: 9, unit: "g" },
  ],
  nutrition_per: "serving",
  us_edition: null,
};

/** A recipe whose ingredients and method the site keeps for its subscribers. */
export const withheldRecipe: GoodFoodRecipe = {
  ...goodfoodRecipe,
  id: "recipes/crepes-suzette",
  title: "Crêpes Suzette",
  url: "https://www.bbcgoodfood.com/recipes/crepes-suzette",
  premium: true,
  ingredients: [],
  steps: [],
};

/* -------------------------------------------------------------------------- */
/* Supertoinette                                                               */
/* -------------------------------------------------------------------------- */

export const supertoinetteRows: SupertoinetteListingRow[] = [
  {
    id: "5001",
    title: "Crêpes bretonnes",
    title_as_published: "Crêpes bretonnes",
    url: "https://www.supertoinette.com/recette/5001/crepes-bretonnes.html",
    image_url: "https://images.example/5001.jpg",
    description: "La pâte de la veille",
    categories: ["Desserts"],
  },
  {
    id: "5002",
    title: "Crêpes salées",
    title_as_published: "Crêpes salées",
    url: "https://www.supertoinette.com/recette/5002/crepes-salees.html",
    image_url: null,
    description: null,
    categories: [],
  },
];

export const supertoinetteRecipe: SupertoinetteRecipe = {
  id: "5001",
  title: "Crêpes bretonnes",
  title_as_published: "Crêpes bretonnes",
  url: "https://www.supertoinette.com/recette/5001/crepes-bretonnes.html",
  description: "La pâte de la veille",
  yield_text: "4 personnes",
  ingredients: [
    {
      amount_text: null,
      label: "Pour la pâte",
      raw: "Pour la pâte",
      sheet: null,
      is_heading: true,
    },
    {
      amount_text: "250 g",
      label: "farine",
      raw: "250 g de farine",
      sheet: null,
      is_heading: false,
    },
    { amount_text: "4", label: "oeufs", raw: "4 oeufs", sheet: null, is_heading: false },
    { amount_text: "50 cl", label: "lait", raw: "50 cl de lait", sheet: null, is_heading: false },
  ],
  steps: ["Mélanger la farine et les oeufs.", "Ajouter le lait.", "Laisser reposer deux heures."],
  intro: "Une pâte qui gagne à reposer.",
  prep_minutes: 15,
  cook_minutes: 20,
  total_minutes: 155,
  rest_minutes: 120,
  category: "Desserts",
  author: "Toinette",
  rating: { value: 4, count: 32, scale: 5 },
  nutrition: null,
  difficulty: { label: "Facile" },
  cost_level: { label: "Bon marché", level: 1, scale: 3 },
  images: ["https://images.example/5001.jpg"],
  tags: [],
  ingredient_sheets: [],
  faq: [],
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
  ptitchef?: {
    fail?: Error;
    failRecipe?: Error;
    rows?: PtitchefRow[];
    /** The whole listing, for a test about what the site's total counts. */
    listing?: PtitchefListing;
    recipe?: PtitchefRecipe;
    cached?: boolean;
  };
  goodfood?: {
    fail?: Error;
    failRecipe?: Error;
    rows?: GoodFoodRow[];
    report?: GoodFoodReport;
    recipe?: GoodFoodRecipe;
    cached?: boolean;
  };
  supertoinette?: {
    fail?: Error;
    failRecipe?: Error;
    rows?: SupertoinetteListingRow[];
    recipe?: SupertoinetteRecipe;
    cached?: boolean;
  };
  pequerecetas?: {
    fail?: Error;
    failRecipe?: Error;
    rows?: PequerecetasListingRow[];
    page?: PequerecetasPage;
    cached?: boolean;
  };
}

export function fakeMarmiton(options: NonNullable<FakeOptions["marmiton"]> = {}): MarmitonReader {
  return {
    async search() {
      if (options.fail) {
        throw options.fail;
      }
      return { data: options.rows ?? marmitonRows, cached: options.cached ?? false };
    },
    async getRecipe() {
      if (options.fail) {
        throw options.fail;
      }
      if (options.failRecipe) {
        throw options.failRecipe;
      }
      return { data: options.recipe ?? marmitonRecipe, cached: options.cached ?? false };
    },
  };
}

export function fakeCookbook(options: NonNullable<FakeOptions["cookbook"]> = {}): CookbookReader {
  return {
    async search() {
      if (options.fail) {
        throw options.fail;
      }
      return { data: { results: options.rows ?? cookbookRows }, cached: options.cached ?? false };
    },
    async getRecipe() {
      if (options.fail) {
        throw options.fail;
      }
      if (options.failRecipe) {
        throw options.failRecipe;
      }
      return { data: options.recipe ?? cookbookRecipe, cached: options.cached ?? false };
    },
  };
}

export function fakePtitchef(options: NonNullable<FakeOptions["ptitchef"]> = {}): PtitchefReader {
  return {
    async searchRecipes() {
      if (options.fail) {
        throw options.fail;
      }
      const rows = options.rows ?? ptitchefRows;
      const listing = options.listing ?? {
        ...ptitchefListing,
        results: rows,
        result_count: rows.length,
        rows_seen: rows.length,
        total_available: rows.length,
      };
      return { data: listing, cached: options.cached ?? false };
    },
    async getRecipe() {
      if (options.fail) {
        throw options.fail;
      }
      if (options.failRecipe) {
        throw options.failRecipe;
      }
      return { data: options.recipe ?? ptitchefRecipe, cached: options.cached ?? false };
    },
  };
}

export function fakeGoodFood(options: NonNullable<FakeOptions["goodfood"]> = {}): GoodFoodReader {
  return {
    async searchRecipes() {
      if (options.fail) {
        throw options.fail;
      }
      const rows = options.rows ?? goodfoodRows;
      const report = options.report ?? {
        ...goodfoodReport,
        results: rows,
        result_count: rows.length,
        rows_seen: rows.length,
      };
      return { data: report, cached: options.cached ?? false };
    },
    async getRecipe() {
      if (options.fail) {
        throw options.fail;
      }
      if (options.failRecipe) {
        throw options.failRecipe;
      }
      return { data: options.recipe ?? goodfoodRecipe, cached: options.cached ?? false };
    },
  };
}

export function fakeSupertoinette(
  options: NonNullable<FakeOptions["supertoinette"]> = {},
): SupertoinetteReader {
  return {
    async searchRecipes() {
      if (options.fail) {
        throw options.fail;
      }
      const rows = options.rows ?? supertoinetteRows;
      return {
        data: {
          listing: {
            results: rows,
            rows_published: rows.length,
            total_available: null,
            last_page: 1,
            facets: [],
            matched_nothing: rows.length === 0,
            url: "https://www.supertoinette.com/liste-recettes?q=crepes",
          },
          dropped_category: null,
        },
        cached: options.cached ?? false,
      };
    },
    async getRecipe() {
      if (options.fail) {
        throw options.fail;
      }
      if (options.failRecipe) {
        throw options.failRecipe;
      }
      return { data: options.recipe ?? supertoinetteRecipe, cached: options.cached ?? false };
    },
  };
}

export function fakePequerecetas(
  options: NonNullable<FakeOptions["pequerecetas"]> = {},
): PequerecetasReader {
  return {
    async searchRecipes() {
      if (options.fail) {
        throw options.fail;
      }
      return {
        data: {
          rows: options.rows ?? pequerecetasRows,
          page_served: 1,
          has_more: false,
        },
        cached: options.cached ?? false,
      };
    },
    async getRecipe() {
      if (options.fail) {
        throw options.fail;
      }
      if (options.failRecipe) {
        throw options.failRecipe;
      }
      return { data: options.page ?? pequerecetasPage, cached: options.cached ?? false };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Pequerecetas                                                                */
/* -------------------------------------------------------------------------- */

export const pequerecetasRows: PequerecetasListingRow[] = [
  {
    id: "crepes-caseras",
    title: "Crepes caseras",
    url: "https://www.pequerecetas.com/receta/crepes-caseras/",
    image_url: "https://images.example/crepes.jpg",
  },
  {
    id: "crepes-saladas",
    title: "Crepes saladas",
    url: "https://www.pequerecetas.com/receta/crepes-saladas/",
    image_url: null,
  },
];

export const pequerecetasRecipe: PequerecetasRecipe = {
  id: "crepes-caseras",
  title: "Crepes caseras",
  url: "https://www.pequerecetas.com/receta/crepes-caseras/",
  description: "Las crepes de toda la vida",
  published_at: "2024-01-20",
  modified_at: null,
  // Most of this site's recipes keep their ingredients in the body of the
  // article rather than in the block it writes for search engines.
  source_shape: "article",
  yield_text: "4 raciones",
  ingredients: [
    "250 g de harina",
    "4 huevos",
    "500 ml de leche",
    "1 pizca de sal",
    "Sartén antiadherente",
  ],
  steps: [
    { text: "Bate los huevos con la leche.", group: "Preparación", url: null, image: null },
    { text: "Añade la harina poco a poco.", group: "Preparación", url: null, image: null },
  ],
  prep_minutes: 10,
  cook_minutes: 15,
  total_minutes: 25,
  categories: ["Postres"],
  cuisines: ["Francesa"],
  keywords: ["crepes"],
  author: "Pequerecetas",
  author_url: "https://www.pequerecetas.com/autor/",
  rating: { value: 4.4, count: 96, scale: 5, worst: 1 },
  nutrition: { text: "180 Kcal", calories: 180 },
  images: ["https://images.example/crepes.jpg"],
};

export const pequerecetasPage: PequerecetasPage = {
  kind: "recipe",
  recipe: pequerecetasRecipe,
};

/** An article gathering recipes, served at the same kind of address as a recipe. */
export const pequerecetasCollectionPage: PequerecetasPage = {
  kind: "collection",
  collection: {
    id: "recetas-con-crepes",
    title: "Recetas con crepes",
    url: "https://www.pequerecetas.com/receta/recetas-con-crepes/",
    description: "Una selección",
    published_at: "2024-04-02",
    modified_at: null,
    headings: ["Dulces", "Saladas"],
    recipes: [
      {
        id: "crepes-caseras",
        title: "Crepes caseras",
        url: "https://www.pequerecetas.com/receta/crepes-caseras/",
        image_url: null,
      },
    ],
    images: [],
  },
};

export const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Stand-ins for every source the registry builds.
 *
 * Every one of them, always: a source left without one would be built as the
 * reader that talks to its site, and the unit suite would reach the network.
 * `test/unit/registry.test.ts` holds that line for whatever is registered next.
 */
export function fakeReaders(options: FakeOptions = {}): Required<Readers> {
  return {
    marmiton: fakeMarmiton(options.marmiton ?? {}),
    cookbook: fakeCookbook(options.cookbook ?? {}),
    ptitchef: fakePtitchef(options.ptitchef ?? {}),
    goodfood: fakeGoodFood(options.goodfood ?? {}),
    supertoinette: fakeSupertoinette(options.supertoinette ?? {}),
    pequerecetas: fakePequerecetas(options.pequerecetas ?? {}),
  };
}

export function fakeClient(options: FakeOptions = {}): RecipesClient {
  return new RecipesClient({ logger: silentLogger, readers: fakeReaders(options) });
}

/**
 * Every source but the named ones answering with nothing.
 *
 * A test about one source's rows says which source it means in one line, rather
 * than restating what every other source should return.
 */
export function onlyFrom(...kept: Array<keyof FakeOptions>): FakeOptions {
  const silenced: FakeOptions = {};
  for (const id of [
    "marmiton",
    "cookbook",
    "ptitchef",
    "goodfood",
    "supertoinette",
    "pequerecetas",
  ] as const) {
    if (!kept.includes(id)) {
      silenced[id] = { rows: [] };
    }
  }
  return silenced;
}

/** The text block a tool returned, which is what many clients render. */
export function textOf(result: { content: Array<{ text: string }> }): string {
  return result.content.map((part) => part.text).join("\n");
}

/** The structured payload a tool returned, which an error result does not have. */
export function payloadOf<T = Record<string, unknown>>(result: {
  structuredContent?: Record<string, unknown>;
}): T {
  if (!result.structuredContent) {
    throw new Error("the tool returned no structured content");
  }
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
  return {
    sections: ["ingredients"],
    max_steps: 20,
    max_gathered: 30,
    max_step_chars: 600,
    ...over,
  };
}

/** The arguments a caller sends compare_recipes, with the defaults filled in. */
export function compareArgs(
  over: Partial<import("../../src/tools/compareRecipes.js").CompareRecipesArgs> & { dish: string },
): import("../../src/tools/compareRecipes.js").CompareRecipesArgs {
  return { sections: ["ingredients"], max_steps: 10, max_step_chars: 600, ...over };
}

/** The source adapters a test resolves identifiers against. */
export function fakeSources() {
  return [
    marmitonAdapter(fakeMarmiton()),
    cookbookAdapter(fakeCookbook()),
    ptitchefAdapter(fakePtitchef()),
    goodfoodAdapter(fakeGoodFood()),
    supertoinetteAdapter(fakeSupertoinette()),
    pequerecetasAdapter(fakePequerecetas()),
  ];
}
