/**
 * What people actually ask, including the ones who ask badly.
 *
 * Each case here comes from someone using the server the way people do:
 * vaguely, in the wrong language, with a word misspelled, or expecting
 * something the server cannot do. A tool that answers those confidently and
 * wrongly is worse than one that refuses, so what is checked is what the answer
 * says about itself.
 */

import { describe, expect, it } from "vitest";
import { runGetRecipe } from "../../src/tools/getRecipe.js";
import { runScaleIngredients } from "../../src/tools/scaleIngredients.js";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import { fakeClient, payloadOf, recipeArgs, textOf } from "./support.js";

describe("Ben asks for a filter the sources do not offer", () => {
  it("says the query went out as free text rather than as a constraint", async () => {
    const result = await runSearchRecipes(fakeClient(), {
      query: "vegan gluten-free dessert under 300 calories",
      limit_per_source: 3,
      fan_out: true,
    });
    expect(textOf(result)).toMatch(/free text/i);
    expect(textOf(result)).toMatch(/no filter/i);
  });

  it("keeps quiet about it on a plain two-word question", async () => {
    const result = await runSearchRecipes(fakeClient(), {
      query: "crepes",
      limit_per_source: 3,
      fan_out: true,
    });
    expect(textOf(result)).not.toMatch(/no filter/i);
  });
});

describe("Marcus misspells the dish and only one source recognises it", () => {
  it("says which source offered nothing, rather than leaving it unexplained", async () => {
    const result = await runSearchRecipes(fakeClient({ cookbook: { rows: [] } }), {
      query: "tarte tatan",
      limit_per_source: 4,
      fan_out: true,
    });
    expect(textOf(result)).toMatch(/Wikibooks Cookbook answered and offered no row/);
  });

  it("does not say that of a source that contributed", async () => {
    const result = await runSearchRecipes(fakeClient(), {
      query: "crepes",
      limit_per_source: 4,
      fan_out: true,
    });
    expect(textOf(result)).not.toMatch(/offered no row/);
  });
});

describe("Amara asks vaguely and gets a page about an ingredient", () => {
  it("warns that a row from such a source can be a page rather than a recipe", async () => {
    const result = await runSearchRecipes(fakeClient(), {
      query: "something with chicken and rice",
      limit_per_source: 3,
      fan_out: true,
      sources: ["cookbook"],
    });
    expect(textOf(result)).toMatch(/page about an ingredient rather than a recipe/);
  });

  it("says nothing of the kind when no such source contributed", async () => {
    const result = await runSearchRecipes(fakeClient(), {
      query: "crepes",
      limit_per_source: 3,
      fan_out: true,
      sources: ["marmiton"],
    });
    expect(textOf(result)).not.toMatch(/page about an ingredient/);
  });
});

describe("Yuki pastes a dish name where an identifier belongs", () => {
  it("refuses it and says what to do with the words that were typed", async () => {
    const result = await runGetRecipe(fakeClient(), recipeArgs({ id: "Tarte Tatin" }));
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("[invalid_input]");
    expect(textOf(result)).toContain('search_recipes with "Tarte Tatin"');
  });
});

describe("Ravi scales a card he photographed, in two languages and untidily", () => {
  const lines = [
    "  2 c. à s. de miel  ",
    "1 1/2 cups all-purpose flour",
    "3 œufs",
    "a pinch of nutmeg",
    "125g butter, softened",
    "zest of 1 lemon",
    "1/2 tsp bicarbonate of soda",
    "milk",
  ];

  const result = runScaleIngredients({
    ingredients: lines,
    from_servings: 4,
    to_servings: 7,
    language: "auto",
  });
  const payload = payloadOf<{ ingredients: Array<{ text: string; language: string }> }>(result);

  it("reads each line in its own language, whitespace and all", () => {
    expect(payload.ingredients.map((entry) => entry.text)).toEqual([
      "3 1/2 cuillères à soupe de miel",
      "2 1/2 cups all-purpose flour",
      "5 œufs",
      "2 pinches nutmeg",
      "220 g butter, softened",
      "zest of 1 lemon",
      "3/4 tsp bicarbonate of soda",
      "milk",
    ]);
  });

  it("keeps an egg whole even with the ligature spelling", () => {
    expect(payload.ingredients[2]?.language).toBe("fr");
    expect(payload.ingredients[2]?.text).toBe("5 œufs");
  });

  it("leaves a line naming no amount alone rather than inventing one", () => {
    expect(payload.ingredients[5]?.text).toBe("zest of 1 lemon");
    expect(payload.ingredients[7]?.text).toBe("milk");
  });
});

describe("Léa quarters a small recipe", () => {
  const result = runScaleIngredients({
    ingredients: [
      "1 sachet de levure chimique",
      "1 oeuf",
      "1 pincée de sel",
      "20 cl de lait",
      "1 gousse de vanille",
    ],
    factor: 0.25,
    language: "auto",
  });
  const payload = payloadOf<{ ingredients: Array<{ text: string; note?: string }> }>(result);

  it("takes each line as far as it divides and keeps the egg whole", () => {
    expect(payload.ingredients.map((entry) => entry.text)).toEqual([
      "1/2 sachet de levure chimique",
      "1 oeuf",
      // A pincée is what a hand gives in one go, and a gousse is split in two
      // and no finer: both verdicts come from the person who cooks these.
      "1 pincée de sel",
      "5 cl de lait",
      "1/2 gousse de vanille",
    ]);
  });

  it("says the egg no longer holds its share of the recipe", () => {
    expect(payload.ingredients[1]?.note).toMatch(/no longer holds its share/);
  });
});
