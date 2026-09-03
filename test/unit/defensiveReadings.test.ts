/**
 * What each source layer does with an answer that is missing what it usually
 * carries.
 *
 * No source answers with a contract. A field arrives absent, null, or holding
 * something other than the type it usually holds, and the reading has to say
 * which of two things happened: the page carried nothing there, or the answer
 * could not be read at all. The cases below drive every one of those readings
 * from a payload written to be thin.
 */

import { describe, expect, it } from "vitest";
import {
  count,
  publishedFigures,
  readYieldSpan,
  required,
  rowsOf,
  text,
  textList,
} from "../../src/sources/adapter.js";
import { cookbookAdapter, cookbookDetail, COOKBOOK_PROFILE } from "../../src/sources/cookbook.js";
import { goodfoodDetail } from "../../src/sources/goodfood.js";
import { marmitonAdapter, marmitonDetail } from "../../src/sources/marmiton.js";
import { pequerecetasAdapter, pequerecetasDetail } from "../../src/sources/pequerecetas.js";
import { meansFor, ptitchefDetail } from "../../src/sources/ptitchef.js";
import { supertoinetteAdapter, supertoinetteDetail } from "../../src/sources/supertoinette.js";

describe("reading a value without trusting its shape", () => {
  it("keeps a string with something in it, and nothing else", () => {
    expect(text("a")).toBe("a");
    expect(text("   ")).toBeNull();
    expect(text(4)).toBeNull();
    expect(text(null)).toBeNull();
    expect(text(undefined)).toBeNull();
  });

  it("keeps the strings out of a list, whatever else the list holds", () => {
    expect(textList(["a", 2, null, "b"])).toEqual(["a", "b"]);
    expect(textList("a")).toEqual([]);
    expect(textList(undefined)).toEqual([]);
  });

  it("keeps a finite number, and reads anything else as no number at all", () => {
    expect(count(3)).toBe(3);
    expect(count(0)).toBe(0);
    expect(count(Number.NaN)).toBeNull();
    expect(count(Number.POSITIVE_INFINITY)).toBeNull();
    expect(count("3")).toBeNull();
  });

  it("refuses a record with no readable field where one is required", () => {
    expect(() => required(null, "title", COOKBOOK_PROFILE)).toThrow(/title/);
    expect(required("Carbonara", "title", COOKBOOK_PROFILE)).toBe("Carbonara");
  });

  it("refuses a listing that is not a list", () => {
    expect(() => rowsOf({}, COOKBOOK_PROFILE)).toThrow(/list of results/);
    expect(rowsOf([1, 2], COOKBOOK_PROFILE)).toEqual([1, 2]);
  });

  it("keeps the figures a panel actually published", () => {
    expect(publishedFigures({ kcal: "210", protein: null, fat: "  " })).toEqual({ kcal: "210" });
    expect(publishedFigures({ kcal: null })).toBeNull();
    expect(publishedFigures(null)).toBeNull();
    expect(publishedFigures("210 kcal")).toBeNull();
  });
});

describe("reading a yield off the words a page printed", () => {
  it("reads a span, and what it counts", () => {
    expect(readYieldSpan("4 à 6 personnes")).toEqual({ count: 4, max: 6, unit: "personnes" });
    expect(readYieldSpan("4 to 6 servings")).toEqual({ count: 4, max: 6, unit: "servings" });
  });

  it("reads a single figure", () => {
    expect(readYieldSpan("24 cookies")).toEqual({ count: 24, max: null, unit: "cookies" });
    expect(readYieldSpan("4,5 personnes")).toEqual({ count: 4.5, max: null, unit: "personnes" });
  });

  it("reads a span whose second figure is not the larger as a single figure", () => {
    // "6 à 4" is not a range anybody wrote on purpose, and reading it as one
    // would scale from a number the page never meant as the lower end.
    expect(readYieldSpan("6 à 4 personnes")).toEqual({
      count: 6,
      max: null,
      unit: "à 4 personnes",
    });
  });

  it("says nothing where the page printed no figure", () => {
    expect(readYieldSpan("para toda la familia")).toEqual({ count: null, max: null, unit: null });
    expect(readYieldSpan(null)).toEqual({ count: null, max: null, unit: null });
  });

  it("keeps a figure with nothing behind it", () => {
    expect(readYieldSpan("8")).toEqual({ count: 8, max: null, unit: null });
  });
});

/**
 * The thinnest payload each source can send that is still a recipe: an id, a
 * title and an address, and nothing else. Every other field has to come back as
 * a silence rather than as a zero or an empty panel.
 */
describe("a recipe a source sent with nothing but its identity", () => {
  const bare = { id: "1", title: "A dish", url: "https://example.test/1" };

  const readings: [string, () => ReturnType<typeof marmitonDetail>][] = [
    ["Marmiton", () => marmitonDetail(bare)],
    [
      "Wikibooks Cookbook",
      () =>
        cookbookDetail({
          key: "Cookbook:A dish",
          title: "Cookbook:A dish",
          sourceUrl: "https://example.test/1",
        }),
    ],
    ["Ptitchef", () => ptitchefDetail(bare)],
    ["BBC Good Food", () => goodfoodDetail(bare)],
    ["Supertoinette", () => supertoinetteDetail(bare)],
    ["Pequerecetas", () => pequerecetasDetail({ kind: "recipe", recipe: bare })],
  ];

  for (const [name, read] of readings) {
    it(`reads ${name} without inventing a figure`, () => {
      const detail = read();

      expect(detail.title).toBe("A dish");
      expect(detail.yieldCount).toBeNull();
      expect(detail.yieldText).toBeNull();
      expect(detail.prepMinutes).toBeNull();
      expect(detail.cookMinutes).toBeNull();
      expect(detail.totalMinutes).toBeNull();
      expect(detail.rating).toBeNull();
      expect(detail.nutrition).toBeNull();
      expect(detail.ingredients).toEqual([]);
      expect(detail.steps).toEqual([]);
      expect(detail.gathers).toBeNull();
    });
  }

  it("refuses a record with no identity at all", () => {
    expect(() => marmitonDetail({})).toThrow();
    expect(() => cookbookDetail({})).toThrow();
    expect(() => ptitchefDetail({})).toThrow();
    expect(() => goodfoodDetail({})).toThrow();
    expect(() => supertoinetteDetail({})).toThrow();
    expect(() => pequerecetasDetail({ kind: "recipe", recipe: {} })).toThrow();
  });

  it("refuses a payload that is not a record", () => {
    expect(() => marmitonDetail(null)).toThrow();
    expect(() => pequerecetasDetail(null)).toThrow();
  });
});

/**
 * The same question, asked of the adapters rather than of the readings.
 *
 * A reader that answers with an envelope and nothing in it is a shape no site
 * produces and every dependency is free to produce, since the packages are
 * resolved against ranges. What matters is that a thin envelope is a failure to
 * read or an empty listing, and never a confident absence.
 */
describe("an adapter handed an answer with nothing in it", () => {
  it("refuses a listing that never arrived", async () => {
    const noListing = { data: undefined, cached: false } as never;

    await expect(
      pequerecetasAdapter({
        searchRecipes: async () => noListing,
        getRecipe: async () => noListing,
      }).search("x", 5),
    ).rejects.toThrow(/list of results/);

    await expect(
      supertoinetteAdapter({
        searchRecipes: async () => noListing,
        getRecipe: async () => noListing,
      }).search("x", 5),
    ).rejects.toThrow(/list of results/);
  });

  it("counts a Cookbook row with no title of its own under its key", async () => {
    const found = await cookbookAdapter({
      search: async () => ({
        data: {
          results: [
            { key: "Cookbook:Pesto", title: null, sourceUrl: "https://example.test/pesto" },
            { key: null, title: "no key", sourceUrl: "https://example.test/x" },
          ] as never,
        },
        cached: false,
      }),
      getRecipe: async () => ({ data: {} as never, cached: false }),
    }).search("pesto", 5);

    expect(found.rows).toHaveLength(1);
    expect(found.rows[0]?.title).toBe("Pesto");
    expect(found.skipped).toBe(1);
  });

  it("tells a Marmiton address from a Marmiton identifier", async () => {
    const asked: unknown[] = [];
    const reader = {
      search: async () => ({ data: [], cached: false }),
      getRecipe: async (ref: unknown) => {
        asked.push(ref);
        return {
          data: { id: "1", title: "A dish", url: "https://www.marmiton.org/x" } as never,
          cached: false,
        };
      },
    };
    const source = marmitonAdapter(reader);

    await source.getRecipe("44078");
    await source.getRecipe("https://www.marmiton.org/recettes/recette_x_44078.aspx");

    expect(asked).toEqual([
      { id: "44078" },
      { url: "https://www.marmiton.org/recettes/recette_x_44078.aspx" },
    ]);
  });
});

describe("what a Ptitchef total counts, according to the page it came from", () => {
  it("says nothing where the site published no total", () => {
    expect(meansFor({ total_available: null })).toBeNull();
  });

  it("names a category count and a page count as the different things they are", () => {
    expect(meansFor({ total_available: 12, kind: "category" })).toMatch(/category page/);
    expect(meansFor({ total_available: 12, kind: "free_text" })).toMatch(/single page/);
  });

  it("names the single page a recipe address answers with", () => {
    expect(meansFor({ total_available: 1, kind: "recipe" })).toMatch(/one recipe/);
  });

  it("says nothing for a shape that counts neither", () => {
    // A guide states no total of its own, and a wording the site matched
    // nothing for was never counted.
    expect(meansFor({ total_available: 12, kind: "guide" })).toBeNull();
    expect(meansFor({ total_available: 12 })).toBeNull();
  });
});
