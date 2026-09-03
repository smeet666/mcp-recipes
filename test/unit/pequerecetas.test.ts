/**
 * Pequerecetas, read as a source.
 *
 * Two things this source is careful about. It publishes no total anywhere, so
 * an answer states none rather than putting the rows of one page in its place.
 * And it serves two different things at the same kind of address, a recipe and
 * an article gathering other recipes, so a record says which came back: reading
 * the second as a recipe would offer a dish nobody can cook.
 *
 * Every answer below is written out rather than captured from a page.
 */

import { describe, expect, it } from "vitest";
import {
  PEQUERECETAS_PROFILE,
  pequerecetasAdapter,
  pequerecetasDetail,
} from "../../src/sources/pequerecetas.js";
import type {
  PequerecetasCollection,
  PequerecetasListing,
  PequerecetasRecipe,
  PequerecetasPage,
  PequerecetasReader,
} from "../../src/sources/pequerecetas.js";
import { runCompareRecipes } from "../../src/tools/compareRecipes.js";
import { runGetRecipe } from "../../src/tools/getRecipe.js";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import { MAX_TEXT_CHARS } from "../../src/tools/shared.js";
import {
  compareArgs,
  fakeClient,
  onlyFrom,
  payloadOf,
  pequerecetasCollectionPage,
  recipeArgs,
  searchArgs,
  textOf,
} from "./support.js";

const listing: PequerecetasListing = {
  rows: [
    {
      id: "tortilla-de-patatas",
      title: "Tortilla de patatas",
      url: "https://www.pequerecetas.com/receta/tortilla-de-patatas/",
      image_url: "https://images.example/tortilla.jpg",
    },
    {
      id: "tortillas-rapidas",
      title: "Tortillas rápidas",
      url: "https://www.pequerecetas.com/receta/tortillas-rapidas/",
      image_url: null,
    },
  ],
  page_served: 1,
  has_more: false,
};

const recipePage: PequerecetasPage = {
  kind: "recipe",
  recipe: {
    id: "tortilla-de-patatas",
    title: "Tortilla de patatas",
    url: "https://www.pequerecetas.com/receta/tortilla-de-patatas/",
    description: "La tortilla de siempre",
    published_at: "2024-02-11",
    modified_at: null,
    source_shape: "article",
    yield_text: "4 raciones",
    ingredients: ["6 huevos", "500 g de patatas", "1 cebolla", "Sartén antiadherente"],
    steps: [
      { text: "Pela las patatas.", group: "Preparación", url: null, image: null },
      { text: "Bate los huevos.", group: "Preparación", url: null, image: null },
    ],
    prep_minutes: 15,
    cook_minutes: 20,
    total_minutes: 35,
    categories: ["Recetas de huevos"],
    cuisines: ["Española"],
    keywords: ["tortilla"],
    author: "Pequerecetas",
    author_url: "https://www.pequerecetas.com/autor/",
    rating: { value: 4.6, count: 218, scale: 5, worst: 1 },
    nutrition: { text: "310 Kcal", calories: 310 },
    images: ["https://images.example/tortilla.jpg"],
  },
};

const collectionPage: PequerecetasPage = {
  kind: "collection",
  collection: {
    id: "recetas-con-huevo",
    title: "Recetas con huevo",
    url: "https://www.pequerecetas.com/receta/recetas-con-huevo/",
    description: "Una selección",
    published_at: "2024-03-01",
    modified_at: null,
    headings: ["Para desayunar", "Para cenar"],
    recipes: [
      {
        id: "tortilla-de-patatas",
        title: "Tortilla de patatas",
        url: "https://www.pequerecetas.com/receta/tortilla-de-patatas/",
        image_url: null,
      },
    ],
    images: [],
  },
};

function reader(over: Partial<PequerecetasReader> = {}): PequerecetasReader {
  return {
    searchRecipes: async () => ({ data: listing, cached: false }),
    getRecipe: async () => ({ data: recipePage, cached: false }),
    ...over,
  };
}

describe("recognising one of its own identifiers", () => {
  const source = pequerecetasAdapter(reader());

  it("takes the slug out of a recipe address", () => {
    const claim = source.claims("https://www.pequerecetas.com/receta/paella-de-marisco/");

    expect(claim?.reference).toBe("paella-de-marisco");
    expect(claim?.guess).toBe(false);
  });

  it("takes a bare slug, and says the reading is a guess", () => {
    const claim = source.claims("paella-de-marisco");

    expect(claim?.reference).toBe("paella-de-marisco");
    // Another source could mint the same shape, so the answer says the reading
    // was inferred rather than certain.
    expect(claim?.guess).toBe(true);
  });

  it("declines a shape it never mints", () => {
    expect(source.claims("44078")).toBeNull();
    expect(source.claims("Cookbook:Carbonara")).toBeNull();
    expect(source.claims("https://www.marmiton.org/recettes/recette_x_1.aspx")).toBeNull();
  });
});

describe("searching", () => {
  it("returns the rows the site served, each naming its source", async () => {
    const found = await pequerecetasAdapter(reader()).search("tortilla", 10);

    expect(found.rows.map((row) => row.id)).toEqual([
      "pequerecetas:tortilla-de-patatas",
      "pequerecetas:tortillas-rapidas",
    ]);
    expect(found.rows[0]?.sourceName).toBe("Pequerecetas");
  });

  it("states no total, because the site publishes none", async () => {
    const found = await pequerecetasAdapter(reader()).search("tortilla", 10);

    // The rows of one page are not put here in its place: that would count the
    // page rather than what the site holds.
    expect(found.reportedTotal).toBeNull();
    expect(found.reportedTotalMeans).toBeNull();
  });

  it("hands over every readable row and leaves the cut to the caller", async () => {
    // A row dropped here is one a second wording could no longer be found to
    // have added, and the count this answer reports would mean fewer rows than
    // the page held.
    const found = await pequerecetasAdapter(reader()).search("tortilla", 1);

    expect(found.rows).toHaveLength(listing.rows.length);
  });

  it("counts a row it could not read rather than dropping it in silence", async () => {
    const broken = reader({
      searchRecipes: async () => ({
        data: { ...listing, rows: [{ id: "", title: "", url: "", image_url: null }] },
        cached: false,
      }),
    });
    const found = await pequerecetasAdapter(broken).search("tortilla", 10);

    expect(found.rows).toHaveLength(0);
    expect(found.skipped).toBe(1);
  });
});

describe("reading a recipe", () => {
  const detail = pequerecetasDetail(recipePage);

  it("reads the yield off the site's own wording", () => {
    expect(detail.yieldCount).toBe(4);
    expect(detail.yieldText).toBe("4 raciones");
    expect(detail.yieldUnit).toBe("raciones");
  });

  it("carries the lines as published, equipment among them", () => {
    expect(detail.ingredients).toEqual([
      "6 huevos",
      "500 g de patatas",
      "1 cebolla",
      "Sartén antiadherente",
    ]);
  });

  it("says the recipe is Spanish, so its lines are read that way", () => {
    expect(detail.language).toBe("es");
  });

  it("repeats the rating against the scale the site published", () => {
    expect(detail.rating).toEqual({ value: 4.6, count: 218, max: 5 });
  });

  it("repeats the energy figure in the words the page printed", () => {
    expect(detail.nutrition).toEqual({ calories: "310 Kcal" });
  });

  it("states no licence, because the site grants none", () => {
    expect(detail.license).toBeNull();
  });

  it("gathers nothing, because this address held a recipe", () => {
    expect(detail.gathers).toBeNull();
  });
});

describe("reading an article that gathers recipes", () => {
  const detail = pequerecetasDetail(collectionPage);

  it("says what the address held, with the recipes it points at", () => {
    expect(detail.gathers?.headings).toEqual(["Para desayunar", "Para cenar"]);
    expect(detail.gathers?.rows.map((row) => row.id)).toEqual(["pequerecetas:tortilla-de-patatas"]);
  });

  it("offers no ingredients and no method, because the article has none", () => {
    expect(detail.ingredients).toEqual([]);
    expect(detail.steps).toEqual([]);
  });

  it("still names the source and the address, so a reader can go there", () => {
    expect(detail.id).toBe("pequerecetas:recetas-con-huevo");
    expect(detail.url).toBe("https://www.pequerecetas.com/receta/recetas-con-huevo/");
  });
});

describe("a page this server could not read", () => {
  it("is a failure to read rather than a listing with nothing in it", async () => {
    const broken = reader({
      searchRecipes: async () => ({ data: {} as PequerecetasListing, cached: false }),
    });

    await expect(pequerecetasAdapter(broken).search("tortilla", 10)).rejects.toThrow(
      /Pequerecetas/,
    );
  });

  it("drops an article's row it could not read rather than failing the page", () => {
    const detail = pequerecetasDetail({
      kind: "collection",
      collection: {
        ...(collectionPage as { collection: PequerecetasCollection }).collection,
        recipes: [{ id: "", title: "", url: "", image_url: null }],
      },
    });

    expect(detail.gathers?.rows).toEqual([]);
  });
});

describe("reading through the adapter rather than off a payload", () => {
  it("hands back the recipe and says whether the read was repeated", async () => {
    const read = await pequerecetasAdapter(
      reader({ getRecipe: async () => ({ data: recipePage, cached: true }) }),
    ).getRecipe("tortilla-de-patatas");

    expect(read.recipe.title).toBe("Tortilla de patatas");
    expect(read.cached).toBe(true);
  });
});

describe("what the profile publishes", () => {
  it("says what a row can be besides a recipe, in the site's own terms", () => {
    expect(PEQUERECETAS_PROFILE.rowsThatAreNotRecipes).toMatch(/article/i);
  });

  it("refuses a page it could not read rather than answering with an empty recipe", () => {
    expect(() => pequerecetasDetail({ kind: "recipe" })).toThrow(/Pequerecetas/);
  });
});

/* -------------------------------------------------------------------------- */
/* Through the tools                                                          */
/* -------------------------------------------------------------------------- */

describe("get_recipe on an address that held an article", () => {
  it("says the address gathers recipes rather than being one", async () => {
    const payload = payloadOf<{
      kind: string;
      collection?: { headings: string[]; recipes: Array<{ id: string }> };
      recipe?: unknown;
    }>(
      await runGetRecipe(
        fakeClient({ pequerecetas: { page: pequerecetasCollectionPage } }),
        recipeArgs({ id: "pequerecetas:recetas-con-crepes" }),
      ),
    );

    expect(payload.kind).toBe("collection");
    expect(payload.recipe).toBeUndefined();
    expect(payload.collection?.headings).toEqual(["Dulces", "Saladas"]);
    expect(payload.collection?.recipes.map((row) => row.id)).toEqual([
      "pequerecetas:crepes-caseras",
    ]);
  });

  it("does not offer a recipe nobody can cook", async () => {
    const text = textOf(
      await runGetRecipe(
        fakeClient({ pequerecetas: { page: pequerecetasCollectionPage } }),
        recipeArgs({ id: "pequerecetas:recetas-con-crepes" }),
      ),
    );

    expect(text).toMatch(/gathers/i);
    expect(text).not.toMatch(/Ingredients:/);
  });

  it("still answers 'recipe' for an address that held one", async () => {
    const payload = payloadOf<{ kind: string; recipe?: { title: string } }>(
      await runGetRecipe(fakeClient(), recipeArgs({ id: "pequerecetas:crepes-caseras" })),
    );

    expect(payload.kind).toBe("recipe");
    expect(payload.recipe?.title).toBe("Crepes caseras");
  });
});

describe("compare_recipes when a source answered with an article", () => {
  it("leaves it out and says why, rather than comparing an empty version", async () => {
    const payload = payloadOf<{
      versions: Array<{ source: string }>;
      notes: string[];
    }>(
      await runCompareRecipes(
        fakeClient({
          ...onlyFrom("marmiton", "pequerecetas"),
          pequerecetas: { page: pequerecetasCollectionPage },
        }),
        compareArgs({ dish: "crepes", sources: ["marmiton", "pequerecetas"] }),
      ),
    );

    expect(payload.versions.map((version) => version.source)).toEqual(["marmiton"]);
    // Missing for a reason of its own: the page was read, and what it held was
    // not a recipe. That is a different statement from a read that failed.
    expect(payload.notes.some((note) => /Pequerecetas/.test(note) && /gathers/i.test(note))).toBe(
      true,
    );
  });
});

describe("what a search says about a source whose rows are not all recipes", () => {
  it("names what else a row can be, in that source's own words", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchRecipes(fakeClient(onlyFrom("pequerecetas")), searchArgs({ query: "crepes" })),
    );

    expect(payload.notes.some((note) => /article gathering other recipes/.test(note))).toBe(true);
    expect(payload.notes.some((note) => /page about an ingredient/.test(note))).toBe(false);
  });
});

describe("an article with many headings stays readable", () => {
  it("bounds the headings the way it bounds every other list", () => {
    const many = Array.from({ length: 40 }, (_, index) => `Encabezado número ${index + 1}`);
    const rows = Array.from({ length: 40 }, (_, index) => ({
      id: `receta-${index + 1}`,
      title: `Receta número ${index + 1}`,
      url: `https://www.pequerecetas.com/receta/receta-${index + 1}/`,
      image_url: null,
    }));
    const page: PequerecetasPage = {
      kind: "collection",
      collection: {
        ...(collectionPage as { collection: PequerecetasCollection }).collection,
        headings: many,
        recipes: rows,
      },
    };

    const result = runGetRecipe(
      fakeClient({ pequerecetas: { page } }),
      recipeArgs({ id: "pequerecetas:recetas-con-huevo" }),
    );

    return result.then((answer) => {
      const text = textOf(answer);
      // Every list in this answer says how much of it is shown, and the whole
      // block stays inside the budget every other answer keeps to.
      expect(text.length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
      expect(text).toMatch(/Recipes it points at:/);
      // The listing is the point of the answer, so it is not what the headings
      // crowd out.
      expect(text.split("\n").filter((line) => line.startsWith("- ")).length).toBeGreaterThan(1);
      // Nothing is lost in silence: what was left out is counted.
      expect(text).toMatch(/of 40/);
      expect(payloadOf<{ collection: { headings: string[] } }>(answer).collection.headings).toEqual(
        many,
      );
    });
  });
});

describe("what a Spanish yield is counted in", () => {
  it("does not call a ración something other than a serving", async () => {
    const payload = payloadOf<{ recipe: { yield: { unit: string } }; notes: string[] }>(
      await runGetRecipe(
        fakeClient(),
        recipeArgs({ id: "pequerecetas:crepes-caseras", servings: 8 }),
      ),
    );

    expect(payload.recipe.yield.unit).toBe("raciones");
    // A ración is a serving. Saying it counts something else would tell a
    // reader the page never said how many people it feeds.
    expect(payload.notes.some((note) => /not a number of eaters/.test(note))).toBe(false);
  });

  it("says so for a yield that really counts something else", async () => {
    const page: PequerecetasPage = {
      kind: "recipe",
      recipe: {
        ...(recipePage as { recipe: PequerecetasRecipe }).recipe,
        yield_text: "24 galletas",
      },
    };
    const payload = payloadOf<{ notes: string[] }>(
      await runGetRecipe(
        fakeClient({ pequerecetas: { page } }),
        recipeArgs({ id: "pequerecetas:crepes-caseras", servings: 8 }),
      ),
    );

    expect(payload.notes.some((note) => /galletas/.test(note))).toBe(true);
  });
});
