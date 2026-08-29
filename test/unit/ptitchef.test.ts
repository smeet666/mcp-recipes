/**
 * Ptitchef, read as a source.
 *
 * The site answers a search in several ways and prints one total for all of
 * them, so what that total counts changes with the answer. It also prints two
 * counts of readers beside a rating, and publishes some methods as one block of
 * prose. Every answer below is written out rather than captured from a page.
 */

import { describe, expect, it } from "vitest";
import { PTITCHEF_PROFILE, ptitchefAdapter, ptitchefDetail } from "../../src/sources/ptitchef.js";
import type {
  PtitchefListing,
  PtitchefReader,
  PtitchefRecipe,
  PtitchefRow,
} from "../../src/sources/ptitchef.js";

const rows: PtitchefRow[] = [
  {
    id: "recettes/dessert/gateau-au-chocolat-fid-12345",
    title: "Gâteau au chocolat",
    url: "https://www.ptitchef.com/recettes/dessert/gateau-au-chocolat-fid-12345",
    image_url: "https://images.example/12345.jpg",
    rating: 4.5,
    rating_count: 40,
    review_count: 12,
    category: "Dessert",
    difficulty: "facile",
    total_minutes: 45,
    calories: "295 kcal / 1 part",
    ingredients_preview: "chocolat, beurre, farine",
  },
  {
    id: "recettes/dessert/fondant-fid-12346",
    title: "Fondant au chocolat",
    url: "https://www.ptitchef.com/recettes/dessert/fondant-fid-12346",
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

function listing(over: Partial<PtitchefListing> = {}): PtitchefListing {
  return {
    asked: "gateau au chocolat",
    kind: "free_text",
    topic_slug: null,
    title: null,
    results: rows,
    result_count: rows.length,
    rows_seen: rows.length,
    folded: 0,
    total_available: 2,
    page: 1,
    single_page: true,
    url: "https://www.ptitchef.com/recherche?q=gateau",
    ...over,
  };
}

const recipe: PtitchefRecipe = {
  id: "recettes/dessert/gateau-au-chocolat-fid-12345",
  title: "Gâteau au chocolat",
  url: "https://www.ptitchef.com/recettes/dessert/gateau-au-chocolat-fid-12345",
  description: "Un classique",
  image_url: "https://images.example/12345.jpg",
  category: "Dessert",
  cuisine: "Fr",
  difficulty: "facile",
  author: "Camille",
  author_url: null,
  published: null,
  modified: null,
  rating: 4.5,
  rating_count: 40,
  review_count: 12,
  prep_minutes: 15,
  cook_minutes: 30,
  total_minutes: 45,
  yield_count: 6,
  yield_text: "6 personnes",
  yield_unit: "personnes",
  ingredients: ["200 g de chocolat noir", "100 g de beurre", "3 œufs"],
  steps: [
    { text: "Faire fondre le chocolat.", image_url: null },
    { text: "Ajouter les œufs.", image_url: null },
  ],
  steps_are_one_block: false,
  nutrition: {
    serving_size: "1 part",
    calories: "295 kcal",
    carbohydrate: "30 g",
    fat: null,
    saturated_fat: null,
    protein: "5 g",
    fibre: null,
    sugar: null,
    sodium: null,
  },
  estimated_cost: "2,50 €",
  keywords: ["chocolat"],
  faq: [],
  translations: [],
};

function reader(over: Partial<PtitchefReader> = {}): PtitchefReader {
  return {
    async searchRecipes() {
      return { data: listing(), cached: false };
    },
    async getRecipe() {
      return { data: recipe, cached: false };
    },
    ...over,
  };
}

describe("recognising an identifier", () => {
  const adapter = ptitchefAdapter(reader());

  it("claims the path shape the site mints", () => {
    const claim = adapter.claims("recettes/dessert/gateau-au-chocolat-fid-12345");

    expect(claim?.reference).toBe("recettes/dessert/gateau-au-chocolat-fid-12345");
    expect(claim?.guess).toBe(false);
  });

  it("claims one of its own addresses, reduced to that path", () => {
    const claim = adapter.claims(
      "https://www.ptitchef.com/recettes/dessert/gateau-au-chocolat-fid-12345",
    );

    expect(claim?.reference).toBe("recettes/dessert/gateau-au-chocolat-fid-12345");
  });

  it("declines a path that walks out of itself", () => {
    expect(adapter.claims("recettes/../../etc/passwd-fid-1")).toBeNull();
  });

  it("declines a bare number, which is not a shape this site mints", () => {
    expect(adapter.claims("12345")).toBeNull();
  });

  it("declines another site's address", () => {
    expect(adapter.claims("https://www.marmiton.org/recettes/recette_r_1001.aspx")).toBeNull();
  });
});

describe("what the reported total counts", () => {
  async function meansOf(over: Partial<PtitchefListing>): Promise<{
    total: number | null;
    means: string | null;
  }> {
    const read = await ptitchefAdapter(
      reader({
        async searchRecipes() {
          return { data: listing(over), cached: false };
        },
      }),
    ).search("gateau", 10);
    return { total: read.reportedTotal, means: read.reportedTotalMeans };
  }

  it("counts the rows served when the site answered on its own terms", async () => {
    const { total, means } = await meansOf({ kind: "free_text", total_available: 2 });

    expect(total).toBe(2);
    expect(means).toContain("rows");
    expect(means).not.toContain("category");
  });

  it("counts a category, and says so, when the site answered with one of its pages", async () => {
    const { total, means } = await meansOf({ kind: "topic", total_available: 480 });

    expect(total).toBe(480);
    expect(means).toContain("category");
    expect(means).toContain("rather than");
  });

  it("says the same of a category listing read directly", async () => {
    const { means } = await meansOf({ kind: "category", total_available: 480 });

    expect(means).toContain("category");
  });

  it("counts the one recipe the site opened onto", async () => {
    const { total, means } = await meansOf({ kind: "recipe", total_available: 1 });

    expect(total).toBe(1);
    expect(means).toContain("one recipe");
  });

  it("states no total for a guide, which the site publishes none for", async () => {
    const { total, means } = await meansOf({ kind: "guide", total_available: null });

    expect(total).toBeNull();
    expect(means).toBeNull();
  });

  it("states no total for a wording the site matched nothing for", async () => {
    const { total, means } = await meansOf({
      kind: "unmatched",
      results: [],
      result_count: 0,
      rows_seen: 0,
      total_available: null,
    });

    expect(total).toBeNull();
    expect(means).toBeNull();
  });

  it("states no total where the site published none, whatever the kind", async () => {
    const { total, means } = await meansOf({ kind: "free_text", total_available: null });

    expect(total).toBeNull();
    expect(means).toBeNull();
  });
});

describe("searching", () => {
  it("reads a wording the site matched nothing for as an answer, not a failure", async () => {
    const read = await ptitchefAdapter(
      reader({
        async searchRecipes() {
          return {
            data: listing({
              kind: "unmatched",
              results: [],
              result_count: 0,
              rows_seen: 0,
              total_available: null,
            }),
            cached: false,
          };
        },
      }),
    ).search("zzz", 10);

    expect(read.rows).toEqual([]);
    expect(read.skipped).toBe(0);
  });

  it("names the source on every row and prefixes its identifier", async () => {
    const read = await ptitchefAdapter(reader()).search("gateau", 10);

    expect(read.rows[0]?.id).toBe("ptitchef:recettes/dessert/gateau-au-chocolat-fid-12345");
    expect(read.rows[0]?.source).toBe(PTITCHEF_PROFILE.id);
    expect(read.rows[0]?.excerpt).toBe("chocolat, beurre, farine");
    expect(read.rows[1]?.excerpt).toBeNull();
  });

  it("drops a row it cannot read and counts it", async () => {
    const read = await ptitchefAdapter(
      reader({
        async searchRecipes() {
          return {
            data: listing({ results: [...rows, { id: "x" } as PtitchefRow] }),
            cached: false,
          };
        },
      }),
    ).search("gateau", 10);

    expect(read.rows).toHaveLength(2);
    expect(read.skipped).toBe(1);
  });
});

describe("reading one recipe", () => {
  const detail = ptitchefDetail(recipe);

  it("keeps the two counts of readers apart, and reports only the one that rated", () => {
    expect(detail.rating).toEqual({ value: 4.5, count: 40, max: 5 });
  });

  it("reads the rating against the scale the site states", () => {
    expect(detail.rating?.max).toBe(5);
  });

  it("hands the ingredient lines on as published", () => {
    expect(detail.ingredients).toEqual(["200 g de chocolat noir", "100 g de beurre", "3 œufs"]);
  });

  it("takes the words of each step and leaves its picture", () => {
    expect(detail.steps).toEqual(["Faire fondre le chocolat.", "Ajouter les œufs."]);
  });

  it("carries whether the site published the method as one block", () => {
    expect(detail.stepsAsOneBlock).toBe(false);
    expect(ptitchefDetail({ ...recipe, steps_are_one_block: true }).stepsAsOneBlock).toBe(true);
  });

  it("keeps the figures the page published and drops the slots it left empty", () => {
    expect(detail.nutrition).toEqual({
      serving_size: "1 part",
      calories: "295 kcal",
      carbohydrate: "30 g",
      protein: "5 g",
    });
  });

  it("states no nutrition where the page published no panel", () => {
    expect(ptitchefDetail({ ...recipe, nutrition: null }).nutrition).toBeNull();
  });

  it("carries no cost, which is a price on this site and a rank on others", () => {
    expect(Object.keys(detail)).not.toContain("cost");
    expect(JSON.stringify(detail)).not.toContain("2,50");
  });

  it("publishes no resting time and withholds nothing", () => {
    expect(detail.restMinutes).toBeNull();
    expect(detail.withheld).toBeNull();
  });

  it("reads the yield the page states, in the page's own words", () => {
    expect(detail.yieldCount).toBe(6);
    expect(detail.yieldText).toBe("6 personnes");
    expect(detail.yieldUnit).toBe("personnes");
  });

  it("refuses a recipe with no readable identifier rather than returning a hole", () => {
    expect(() => ptitchefDetail({ ...recipe, id: "" })).toThrow(/parse_failure|Ptitchef/);
  });

  it("prefixes the identifier it hands back", async () => {
    const read = await ptitchefAdapter(reader()).getRecipe(
      "recettes/dessert/gateau-au-chocolat-fid-12345",
    );

    expect(read.recipe.id).toBe("ptitchef:recettes/dessert/gateau-au-chocolat-fid-12345");
  });
});
