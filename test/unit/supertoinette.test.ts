/**
 * Supertoinette, read as a source.
 *
 * The two things this source is careful about are absences: it prints no total
 * on a search page and publishes no nutrition panel at all, and both have to
 * arrive as silence rather than as a zero. Every answer below is written out
 * rather than captured from a page.
 */

import { describe, expect, it } from "vitest";
import {
  SUPERTOINETTE_PROFILE,
  supertoinetteAdapter,
  supertoinetteDetail,
} from "../../src/sources/supertoinette.js";
import type {
  SupertoinetteListingRow,
  SupertoinetteReader,
  SupertoinetteRecipe,
} from "../../src/sources/supertoinette.js";

const rows: SupertoinetteListingRow[] = [
  {
    id: "4210",
    title: "Tarte aux pommes de la ferme",
    title_as_published: "Tarte aux pommes de la ferme",
    url: "https://www.supertoinette.com/recette/4210/tarte-aux-pommes.html",
    image_url: "https://images.example/4210.jpg",
    description: "Une tarte de fin d'été",
    categories: ["Desserts"],
  },
  {
    id: "4211",
    title: "Tarte fine aux pommes",
    title_as_published: "Tarte fine aux pommes",
    url: "https://www.supertoinette.com/recette/4211/tarte-fine.html",
    image_url: null,
    description: null,
    categories: [],
  },
];

const recipe: SupertoinetteRecipe = {
  id: "4210",
  title: "Tarte aux pommes de la ferme",
  title_as_published: "Tarte aux pommes de la ferme",
  url: "https://www.supertoinette.com/recette/4210/tarte-aux-pommes.html",
  description: "Une tarte de fin d'été",
  yield_text: "6 personnes",
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
      sheet: { label: "farine", url: "https://www.supertoinette.com/fiche-cuisine/1/farine.html" },
      is_heading: false,
    },
    {
      amount_text: "800 g",
      label: "pommes",
      raw: "800 g de pommes",
      sheet: null,
      is_heading: false,
    },
  ],
  steps: ["Préparer la pâte.", "Éplucher les pommes.", "Enfourner 40 minutes."],
  intro: "Une recette de saison.",
  prep_minutes: 20,
  cook_minutes: 40,
  total_minutes: 180,
  rest_minutes: 120,
  category: "Desserts",
  author: "Toinette",
  rating: { value: 4, count: 18, scale: 5 },
  nutrition: null,
  difficulty: { label: "Facile" },
  cost_level: { label: "Bon marché", level: 1, scale: 3 },
  images: [],
  tags: [],
  ingredient_sheets: [],
  faq: [],
};

function reader(over: Partial<SupertoinetteReader> = {}): SupertoinetteReader {
  return {
    async searchRecipes() {
      return {
        data: {
          listing: {
            results: rows,
            rows_published: rows.length,
            total_available: null,
            last_page: 4,
            facets: [],
            matched_nothing: false,
            url: "https://www.supertoinette.com/recherche?q=tarte",
          },
          dropped_category: null,
        },
        cached: false,
      };
    },
    async getRecipe() {
      return { data: recipe, cached: false };
    },
    ...over,
  };
}

describe("recognising an identifier", () => {
  const adapter = supertoinetteAdapter(reader());

  it("claims the bare number the site mints", () => {
    expect(adapter.claims("4210")).toEqual({
      reference: "4210",
      why: "a bare number is the shape Supertoinette mints",
      guess: false,
    });
  });

  it("claims one of its own addresses", () => {
    const claim = adapter.claims(
      "https://www.supertoinette.com/recette/4210/tarte-aux-pommes.html",
    );

    expect(claim?.reference).toBe("4210");
    expect(claim?.guess).toBe(false);
  });

  it("declines a number no site would mint, and another site's address", () => {
    expect(adapter.claims("0")).toBeNull();
    expect(adapter.claims("https://www.marmiton.org/recettes/recette_r_1001.aspx")).toBeNull();
    expect(adapter.claims("Cookbook:Crepes")).toBeNull();
  });
});

describe("searching", () => {
  it("states no total, because the site prints none", async () => {
    const read = await supertoinetteAdapter(reader()).search("tarte", 10);

    expect(read.reportedTotal).toBeNull();
    expect(read.reportedTotalMeans).toBeNull();
  });

  it("does not put the rows of one page where a total belongs", async () => {
    const read = await supertoinetteAdapter(reader()).search("tarte", 10);

    expect(read.rows).toHaveLength(2);
    expect(read.reportedTotal).not.toBe(2);
  });

  it("names the source on every row and prefixes its identifier", async () => {
    const read = await supertoinetteAdapter(reader()).search("tarte", 10);

    expect(read.rows[0]?.id).toBe("supertoinette:4210");
    expect(read.rows[0]?.source).toBe(SUPERTOINETTE_PROFILE.id);
    expect(read.rows[0]?.excerpt).toBe("Une tarte de fin d'été");
    expect(read.rows[1]?.excerpt).toBeNull();
  });

  it("drops a row it cannot read and counts it", async () => {
    const broken = reader({
      async searchRecipes() {
        return {
          data: {
            listing: {
              results: [...rows, { id: "", title: "", url: "" } as SupertoinetteListingRow],
              rows_published: 3,
              total_available: null,
              last_page: 1,
              facets: [],
              matched_nothing: false,
              url: "https://www.supertoinette.com/recherche?q=tarte",
            },
            dropped_category: null,
          },
          cached: false,
        };
      },
    });
    const read = await supertoinetteAdapter(broken).search("tarte", 10);

    expect(read.rows).toHaveLength(2);
    expect(read.skipped).toBe(1);
  });

  it("counts the rows the site itself set aside", async () => {
    const partial = reader({
      async searchRecipes() {
        return {
          data: {
            listing: {
              results: rows,
              rows_published: 3,
              total_available: null,
              last_page: 1,
              facets: [],
              matched_nothing: false,
              url: "https://www.supertoinette.com/recherche?q=tarte",
            },
            dropped_category: null,
          },
          cached: false,
          skipped: ['"Fiche" opens onto something other than a recipe'],
        };
      },
    });
    const read = await supertoinetteAdapter(partial).search("tarte", 10);

    expect(read.skipped).toBe(1);
  });

  it("reads a search the site matched nothing for as an answer, not a failure", async () => {
    const empty = reader({
      async searchRecipes() {
        return {
          data: {
            listing: {
              results: [],
              rows_published: 0,
              total_available: null,
              last_page: 1,
              facets: [],
              matched_nothing: true,
              url: "https://www.supertoinette.com/recherche?q=zzz",
            },
            dropped_category: null,
          },
          cached: false,
        };
      },
    });
    const read = await supertoinetteAdapter(empty).search("zzz", 10);

    expect(read.rows).toEqual([]);
    expect(read.reportedTotal).toBeNull();
  });
});

describe("reading one recipe", () => {
  const detail = supertoinetteDetail(recipe);

  it("keeps the resting time apart from every other time", () => {
    expect(detail.restMinutes).toBe(120);
    expect(detail.prepMinutes).toBe(20);
    expect(detail.cookMinutes).toBe(40);
    expect(detail.totalMinutes).toBe(180);
  });

  it("publishes no nutrition panel, and says so with silence rather than an empty one", () => {
    expect(detail.nutrition).toBeNull();
  });

  it("reads the rating against the scale the site publishes", () => {
    expect(detail.rating).toEqual({ value: 4, count: 18, max: 5 });
  });

  it("keeps a heading as a line of the list, so two groups stay two groups", () => {
    expect(detail.ingredients).toEqual(["Pour la pâte", "250 g de farine", "800 g de pommes"]);
  });

  it("reads the yield off the site's own wording", () => {
    expect(detail.yieldText).toBe("6 personnes");
    expect(detail.yieldCount).toBe(6);
  });

  it("carries no difficulty and no cost, which sit on no scale a caller can compare", () => {
    expect(Object.keys(detail)).not.toContain("difficulty");
    expect(Object.keys(detail)).not.toContain("cost");
  });

  it("withholds nothing and says nothing about how the method is laid out", () => {
    expect(detail.withheld).toBeNull();
    expect(detail.stepsAsOneBlock).toBeNull();
  });

  it("states no licence, since the site states none and silence is not a grant", () => {
    expect(detail.license).toBeNull();
  });

  it("refuses a recipe with no readable identifier rather than returning a hole", () => {
    expect(() => supertoinetteDetail({ ...recipe, id: "" })).toThrow(/parse_failure|Supertoinette/);
  });

  it("routes an address and an identifier alike through the reader", async () => {
    const read = await supertoinetteAdapter(reader()).getRecipe("4210");

    expect(read.recipe.id).toBe("supertoinette:4210");
    expect(read.recipe.url).toBe(recipe.url);
  });
});
