/**
 * What a comparison is allowed to put side by side.
 *
 * These indexes answer almost any spelling with their closest row, so asking
 * for a dish one corpus has never heard of still returns a recipe. Confronting
 * that row's yields, times and ingredient counts with another source's actual
 * version states as fact the one thing the search never established: that the
 * two pages are two traditions of one dish.
 */

import { describe, expect, it } from "vitest";
import { runCompareRecipes } from "../../src/tools/compareRecipes.js";
import { compareArgs, fakeClient, payloadOf, textOf } from "./support.js";
import type { MarmitonRecipe, MarmitonSummary } from "../../src/sources/marmiton.js";
import type { CookbookRecipe, CookbookSummary } from "../../src/sources/cookbook.js";
import { marmitonRecipe, cookbookRecipe } from "./support.js";

const christmasBiscuitRows: MarmitonSummary[] = [
  {
    id: "2001",
    title: "Petits biscuits de Noël",
    url: "https://www.marmiton.org/recettes/recette_r_2001.aspx",
    imageUrl: null,
  },
];

const christmasBiscuits: MarmitonRecipe = {
  ...marmitonRecipe,
  id: "2001",
  title: "Petits biscuits de Noël",
  url: "https://www.marmiton.org/recettes/recette_r_2001.aspx",
  ingredients: ["250 g de farine", "125 g de sucre", "1 oeuf"],
  recipeYield: { count: 6, unit: "personnes", text: "6 personnes" },
  totalMinutes: 23,
};

const gravyRows: CookbookSummary[] = [
  {
    key: "Cookbook:Biscuits and Gravy",
    title: "Cookbook:Biscuits and Gravy",
    description: null,
    excerpt: null,
    imageUrl: null,
    sourceUrl: "https://en.wikibooks.org/wiki/Cookbook:Biscuits_and_Gravy",
  },
];

const gravy: CookbookRecipe = {
  ...cookbookRecipe,
  key: "Cookbook:Biscuits and Gravy",
  title: "Cookbook:Biscuits and Gravy",
  sourceUrl: "https://en.wikibooks.org/wiki/Cookbook:Biscuits_and_Gravy",
  servings: 4,
  yieldText: "About 4",
  totalMinutes: 30,
  ingredients: ["1 lb ground breakfast sausage", "3 tbsp bacon grease", "1/4 cup flour"],
};

function compareBiscuitsAndGravy() {
  return runCompareRecipes(
    fakeClient({
      marmiton: { rows: christmasBiscuitRows, recipe: christmasBiscuits },
      cookbook: { rows: gravyRows, recipe: gravy },
    }),
    compareArgs({ dish: "biscuits and gravy" }),
  );
}

describe("a version whose title names part of the dish is not that dish", () => {
  it("names the version that carries only part of the wording", () => {
    return compareBiscuitsAndGravy().then((result) => {
      const text = textOf(result);
      expect(text).toMatch(/Petits biscuits de No/);
      expect(text).toMatch(/gravy/i);
      expect(text).toMatch(/candidate/i);
    });
  });

  it("states no difference between a dish and a row that merely shares a word", () => {
    return compareBiscuitsAndGravy().then((result) => {
      const payload = payloadOf<{ differences: string[] }>(result);
      expect(payload.differences).toEqual([]);
    });
  });

  it("still confronts two versions that both name the whole dish", () => {
    return runCompareRecipes(
      fakeClient({
        marmiton: {
          rows: [{ ...christmasBiscuitRows[0]!, title: "Biscuits and gravy à ma façon" }],
          recipe: { ...christmasBiscuits, title: "Biscuits and gravy à ma façon" },
        },
        cookbook: { rows: gravyRows, recipe: gravy },
      }),
      compareArgs({ dish: "biscuits and gravy" }),
    ).then((result) => {
      const payload = payloadOf<{ differences: string[] }>(result);
      expect(payload.differences.length).toBeGreaterThan(0);
    });
  });
});
