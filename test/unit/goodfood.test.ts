/**
 * BBC Good Food, read as a source.
 *
 * Two things are particular to this source: a total that can sit on the largest
 * number of rows one search serves, and a recipe whose ingredients and method
 * the site keeps for its subscribers while publishing everything else. Both are
 * statements the site makes, and both have to arrive as statements rather than
 * as zero or as an empty list. Every answer below is written out rather than
 * captured from a page.
 */

import { describe, expect, it } from "vitest";
import { GOODFOOD_PROFILE, goodfoodAdapter, goodfoodDetail } from "../../src/sources/goodfood.js";
import type {
  GoodFoodReader,
  GoodFoodRecipe,
  GoodFoodReport,
  GoodFoodRow,
} from "../../src/sources/goodfood.js";

const rows: GoodFoodRow[] = [
  {
    id: "recipes/spaghetti-carbonara",
    title: "Spaghetti carbonara",
    url: "https://www.bbcgoodfood.com/recipes/spaghetti-carbonara",
    image_url: "https://images.example/carbonara.jpg",
    rating: 4.6,
    rating_count: 210,
    premium: false,
    total_minutes: 30,
    difficulty: "Easy",
    author: "Good Food team",
  },
  {
    id: "recipes/carbonara-pie",
    title: "Carbonara pie",
    url: "https://www.bbcgoodfood.com/recipes/carbonara-pie",
    image_url: null,
    rating: null,
    rating_count: null,
    premium: true,
    total_minutes: null,
    difficulty: null,
    author: null,
  },
];

function report(over: Partial<GoodFoodReport> = {}): GoodFoodReport {
  return {
    query: "carbonara",
    results: rows,
    result_count: rows.length,
    total_available: 226,
    total_is_ceiling: false,
    rows_seen: rows.length,
    restrictions_lifted: [],
    ...over,
  };
}

const recipe: GoodFoodRecipe = {
  id: "recipes/spaghetti-carbonara",
  title: "Spaghetti carbonara",
  url: "https://www.bbcgoodfood.com/recipes/spaghetti-carbonara",
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
  rating_count: 210,
  description: "A Roman classic",
  ingredients: [
    {
      heading: "For the pasta",
      ingredients: [
        {
          text: "350g spaghetti",
          amount: 350,
          unit: "g",
          item: "spaghetti",
          note: null,
          term: "spaghetti",
        },
      ],
    },
    {
      heading: "For the sauce",
      ingredients: [
        {
          text: "3 large eggs",
          amount: 3,
          unit: null,
          item: "large eggs",
          note: null,
          term: "egg",
        },
        {
          text: "100g pancetta, diced",
          amount: 100,
          unit: "g",
          item: "pancetta",
          note: "diced",
          term: "pancetta",
        },
      ],
    },
  ],
  steps: ["Boil the pasta.", "Fry the pancetta.", "Fold it all together."],
  nutrition: [
    { label: "kcal", value: 655, unit: "" },
    { label: "fat", value: 31, unit: "g" },
    { label: "salt", value: null, unit: "g" },
  ],
  nutrition_per: "serving",
  us_edition: null,
};

const behindTheWall: GoodFoodRecipe = {
  ...recipe,
  id: "recipes/carbonara-pie",
  title: "Carbonara pie",
  url: "https://www.bbcgoodfood.com/recipes/carbonara-pie",
  premium: true,
  ingredients: [],
  steps: [],
};

function reader(over: Partial<GoodFoodReader> = {}): GoodFoodReader {
  return {
    async searchRecipes() {
      return { data: report(), cached: false };
    },
    async getRecipe() {
      return { data: recipe, cached: false };
    },
    ...over,
  };
}

describe("recognising an identifier", () => {
  const adapter = goodfoodAdapter(reader());

  it("claims the path shape the site mints", () => {
    const claim = adapter.claims("recipes/spaghetti-carbonara");

    expect(claim?.reference).toBe("recipes/spaghetti-carbonara");
    expect(claim?.guess).toBe(false);
  });

  it("claims one of its own addresses, reduced to that path", () => {
    const claim = adapter.claims("https://www.bbcgoodfood.com/recipes/spaghetti-carbonara");

    expect(claim?.reference).toBe("recipes/spaghetti-carbonara");
  });

  it("declines a path that walks out of itself", () => {
    expect(adapter.claims("recipes/../../etc/passwd")).toBeNull();
  });

  it("declines a bare number and another site's address", () => {
    expect(adapter.claims("44078")).toBeNull();
    expect(adapter.claims("https://www.marmiton.org/recettes/recette_r_1001.aspx")).toBeNull();
  });
});

describe("what the reported total counts", () => {
  async function meansOf(over: Partial<GoodFoodReport>) {
    const read = await goodfoodAdapter(
      reader({
        async searchRecipes() {
          return { data: report(over), cached: false };
        },
      }),
    ).search("carbonara", 10);
    return { total: read.reportedTotal, means: read.reportedTotalMeans };
  }

  it("counts the catalogue when the site published a plain total", async () => {
    const { total, means } = await meansOf({ total_available: 226, total_is_ceiling: false });

    expect(total).toBe(226);
    expect(means).toContain("catalogue");
    expect(means).not.toContain("floor");
  });

  it("says a total sitting on the ceiling states a floor rather than a count", async () => {
    const { total, means } = await meansOf({ total_available: 10_000, total_is_ceiling: true });

    expect(total).toBe(10_000);
    expect(means).toContain("floor");
  });

  it("keeps a total of zero as zero, because the site did search", async () => {
    const { total, means } = await meansOf({
      results: [],
      result_count: 0,
      rows_seen: 0,
      total_available: 0,
    });

    expect(total).toBe(0);
    expect(means).not.toBeNull();
  });

  it("states no total where the site published none", async () => {
    const { total, means } = await meansOf({ total_available: null });

    expect(total).toBeNull();
    expect(means).toBeNull();
  });
});

describe("searching", () => {
  it("names the source on every row and prefixes its identifier", async () => {
    const read = await goodfoodAdapter(reader()).search("carbonara", 10);

    expect(read.rows[0]?.id).toBe("goodfood:recipes/spaghetti-carbonara");
    expect(read.rows[0]?.source).toBe(GOODFOOD_PROFILE.id);
  });

  it("drops a row it cannot read and counts it", async () => {
    const read = await goodfoodAdapter(
      reader({
        async searchRecipes() {
          return {
            data: report({ results: [...rows, { id: "x" } as GoodFoodRow] }),
            cached: false,
          };
        },
      }),
    ).search("carbonara", 10);

    expect(read.rows).toHaveLength(2);
    expect(read.skipped).toBe(1);
  });

  it("reads a wording the site matched nothing for as an answer, not a failure", async () => {
    const read = await goodfoodAdapter(
      reader({
        async searchRecipes() {
          return {
            data: report({ results: [], result_count: 0, rows_seen: 0, total_available: 0 }),
            cached: false,
          };
        },
      }),
    ).search("zzz", 10);

    expect(read.rows).toEqual([]);
    expect(read.reportedTotal).toBe(0);
  });
});

describe("reading one recipe", () => {
  const detail = goodfoodDetail(recipe);

  it("keeps each group's heading as a line, so two groups stay two groups", () => {
    expect(detail.ingredients).toEqual([
      "For the pasta",
      "350g spaghetti",
      "For the sauce",
      "3 large eggs",
      "100g pancetta, diced",
    ]);
  });

  it("repeats the nutrition panel in the site's own wording", () => {
    expect(detail.nutrition).toEqual({ kcal: "655", fat: "31 g", per: "serving" });
  });

  it("leaves out a figure the page published no value for", () => {
    expect(detail.nutrition).not.toHaveProperty("salt");
  });

  it("states no nutrition where the page published no panel", () => {
    expect(goodfoodDetail({ ...recipe, nutrition: [], nutrition_per: null }).nutrition).toBeNull();
  });

  it("reads the rating against the scale the site publishes", () => {
    expect(detail.rating).toEqual({ value: 4.6, count: 210, max: 5 });
  });

  it("withholds nothing on a recipe the site publishes in full", () => {
    expect(detail.withheld).toBeNull();
  });

  it("publishes no resting time and says nothing about how the method is laid out", () => {
    expect(detail.restMinutes).toBeNull();
    expect(detail.stepsAsOneBlock).toBeNull();
  });

  it("carries no difficulty, which sits on no scale the site publishes", () => {
    expect(Object.keys(detail)).not.toContain("difficulty");
  });

  it("refuses a recipe with no readable identifier rather than returning a hole", () => {
    expect(() => goodfoodDetail({ ...recipe, id: "" })).toThrow(/parse_failure|Good Food/);
  });
});

describe("a recipe the site keeps for its subscribers", () => {
  const detail = goodfoodDetail(behindTheWall);

  it("says which parts are kept back, and why", () => {
    expect(detail.withheld).not.toBeNull();
    expect(detail.withheld?.parts).toEqual(["ingredients", "method"]);
    expect(detail.withheld?.why).toContain("subscribers");
    expect(detail.withheld?.why).toContain("BBC Good Food");
  });

  it("leaves the lists empty rather than reconstructing what the site walled off", () => {
    expect(detail.ingredients).toEqual([]);
    expect(detail.steps).toEqual([]);
  });

  it("still carries everything the page does publish", () => {
    expect(detail.title).toBe("Carbonara pie");
    expect(detail.totalMinutes).toBe(30);
    expect(detail.rating).toEqual({ value: 4.6, count: 210, max: 5 });
    expect(detail.nutrition).not.toBeNull();
    expect(detail.yieldCount).toBe(4);
  });
});
