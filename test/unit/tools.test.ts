/**
 * What the four tools return, and what they promise about it.
 *
 * Every case runs against stand-in sources, so nothing here depends on a
 * network or on what any of them publishes today.
 */

import { describe, expect, it } from "vitest";
import { runCompareRecipes } from "../../src/tools/compareRecipes.js";
import { runGetRecipe } from "../../src/tools/getRecipe.js";
import { runScaleIngredients } from "../../src/tools/scaleIngredients.js";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import type { SearchRecipesArgs } from "../../src/tools/searchRecipes.js";
import {
  FakeSourceError,
  fakeClient,
  payloadOf,
  textOf,
  yieldlessRecipe,
  recipeArgs,
  compareArgs,
} from "./support.js";

const searchArgs: SearchRecipesArgs = { query: "crepes", limit_per_source: 5 };

describe("search_recipes", () => {
  it("returns rows from every source, each naming the one it came from", async () => {
    const result = await runSearchRecipes(fakeClient(), { ...searchArgs });
    const payload = payloadOf<{
      results: Array<{ id: string; source: string }>;
      result_count: number;
    }>(result);

    expect(payload.result_count).toBe(payload.results.length);
    expect(new Set(payload.results.map((row) => row.source))).toEqual(
      new Set(["marmiton", "cookbook"]),
    );
    expect(payload.results.every((row) => row.id.startsWith(row.source))).toBe(true);
  });

  it("says how the order was built rather than implying a ranking", async () => {
    const payload = payloadOf<{ order: string }>(
      await runSearchRecipes(fakeClient(), { ...searchArgs }),
    );
    expect(payload.order).toMatch(/No score orders them/);
  });

  it("reports a failed source in the text a client renders, as well as in the payload", async () => {
    const result = await runSearchRecipes(
      fakeClient({ marmiton: { fail: new FakeSourceError("timeout", "Marmiton took too long.") } }),
      { ...searchArgs },
    );

    expect(textOf(result)).toContain("Marmiton did not answer");
    expect(textOf(result)).toMatch(/says nothing about what Marmiton holds/);
  });

  it("never reports a per-source count as a total across the sources", async () => {
    const payload = payloadOf<{ per_source: Array<{ reported_total_means: string | null }> }>(
      await runSearchRecipes(fakeClient(), { ...searchArgs }),
    );
    const meanings = payload.per_source.map((entry) => entry.reported_total_means);
    expect(meanings.some((meaning) => meaning?.includes("not a catalogue count"))).toBe(true);
  });

  it("says a source is silent about totals, and invents no number for it", async () => {
    const result = await runSearchRecipes(fakeClient(), { ...searchArgs });
    expect(textOf(result)).toMatch(/states no total/);
  });

  it("distinguishes every source answering nothing from every source failing", async () => {
    const empty = await runSearchRecipes(
      fakeClient({ marmiton: { rows: [] }, cookbook: { rows: [] } }),
      { ...searchArgs },
    );
    expect(textOf(empty)).toMatch(/Every source answered and none holds anything/);

    const broken = await runSearchRecipes(
      fakeClient({
        marmiton: { fail: new FakeSourceError("network_error", "unreachable") },
        cookbook: { fail: new FakeSourceError("network_error", "unreachable") },
      }),
      { ...searchArgs },
    );
    expect(textOf(broken)).not.toMatch(/none holds anything/);
  });
});

describe("get_recipe", () => {
  it("reads the recipe the identifier names and scales it to the servings asked for", async () => {
    const payload = payloadOf<{
      recipe: {
        source: string;
        yield: { original_count: number; requested: number; factor: number };
        ingredients: Array<{ text: string; scaling: string }>;
      };
    }>(await runGetRecipe(fakeClient(), recipeArgs({ id: "marmiton:1001", servings: 8 })));

    expect(payload.recipe.source).toBe("marmiton");
    expect(payload.recipe.yield.original_count).toBe(4);
    expect(payload.recipe.yield.factor).toBe(2);
    expect(payload.recipe.ingredients[0]?.text).toBe("500 g de farine");
  });

  it("keeps the yield in the source's own words", async () => {
    const payload = payloadOf<{ recipe: { yield: { original_text: string } } }>(
      await runGetRecipe(fakeClient(), recipeArgs({ id: "marmiton:1001" })),
    );
    expect(payload.recipe.yield.original_text).toBe("4 personnes");
  });

  it("returns a page with no stated yield as published, and says why", async () => {
    const result = await runGetRecipe(
      fakeClient({ cookbook: { recipe: yieldlessRecipe } }),
      recipeArgs({ id: "cookbook:Cookbook:Pancake Batter", servings: 20 }),
    );
    const payload = payloadOf<{
      recipe: { yield: { factor: number | null }; ingredients: Array<{ text: string }> };
    }>(result);

    expect(payload.recipe.yield.factor).toBeNull();
    expect(payload.recipe.ingredients[0]?.text).toBe("250 g (2 cups) flour");
    expect(textOf(result)).toMatch(/states no number of servings/);
  });

  it("says how a raw identifier was routed", async () => {
    const result = await runGetRecipe(fakeClient(), recipeArgs({ id: "1001" }));
    expect(payloadOf<{ id_read_as: string | null }>(result).id_read_as).toMatch(/bare number/);
    expect(textOf(result)).toMatch(/Spell an id with its source/);
  });

  it("leaves a raw identifier unexplained when it was spelled with its source", async () => {
    const result = await runGetRecipe(fakeClient(), recipeArgs({ id: "marmiton:1001" }));
    expect(payloadOf<{ id_read_as: string | null }>(result).id_read_as).toBeNull();
  });

  it("returns a failure as a failure rather than as an empty recipe", async () => {
    const result = await runGetRecipe(
      fakeClient({ marmiton: { fail: new FakeSourceError("not_found", "No recipe there.") } }),
      recipeArgs({ id: "marmiton:1" }),
    );
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("[not_found]");
    expect(result.structuredContent).toBeUndefined();
  });

  it("returns only the sections asked for, and names the ones it left out", async () => {
    const result = await runGetRecipe(fakeClient(), recipeArgs({ id: "marmiton:1001" }));
    const payload = payloadOf<{ recipe: { steps: string[]; nutrition: unknown } }>(result);

    expect(payload.recipe.steps).toEqual([]);
    expect(payload.recipe.nutrition).toBeNull();
    expect(textOf(result)).toMatch(/Not requested, so not returned/);
  });

  it("carries a rating with the scale it sits on", async () => {
    const payload = payloadOf<{ recipe: { rating: { value: number; max: number } } }>(
      await runGetRecipe(fakeClient(), recipeArgs({ id: "marmiton:1001" })),
    );
    expect(payload.recipe.rating).toEqual({ value: 4.7, count: 240, max: 5 });
  });

  it("leaves an author and a rating a source does not carry as null", async () => {
    const payload = payloadOf<{ recipe: { author: null; rating: null } }>(
      await runGetRecipe(fakeClient(), recipeArgs({ id: "cookbook:Cookbook:Crepes" })),
    );
    expect(payload.recipe.author).toBeNull();
    expect(payload.recipe.rating).toBeNull();
  });

  it("keeps only the nutrition figures the page published", async () => {
    const payload = payloadOf<{ recipe: { nutrition: Record<string, string> } }>(
      await runGetRecipe(
        fakeClient(),
        recipeArgs({ id: "marmiton:1001", sections: ["nutrition"] }),
      ),
    );
    expect(payload.recipe.nutrition).toEqual({ calories: "320 kcal", servingSize: "1 crêpe" });
    expect(Object.keys(payload.recipe.nutrition)).not.toContain("protein");
  });
});

describe("scale_ingredients", () => {
  const base = { language: "auto" } as const;

  it("scales a list holding both languages, each line in its own", () => {
    const payload = payloadOf<{
      ingredients: Array<{ text: string; language: string }>;
    }>(
      runScaleIngredients({
        ingredients: ["200 g de farine", "3 eggs"],
        factor: 2,
        ...base,
      }),
    );

    expect(payload.ingredients.map((entry) => entry.text)).toEqual(["400 g de farine", "6 eggs"]);
    expect(payload.ingredients.map((entry) => entry.language)).toEqual(["fr", "en"]);
  });

  it("works out the factor from a pair of serving counts", () => {
    const payload = payloadOf<{ factor: number }>(
      runScaleIngredients({ ingredients: ["2 eggs"], from_servings: 4, to_servings: 6, ...base }),
    );
    expect(payload.factor).toBe(1.5);
  });

  it("refuses two ways of saying the factor at once", () => {
    const result = runScaleIngredients({
      ingredients: ["2 eggs"],
      factor: 2,
      from_servings: 4,
      to_servings: 6,
      ...base,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("[invalid_input]");
  });

  it("refuses half a pair of serving counts", () => {
    expect(
      runScaleIngredients({ ingredients: ["2 eggs"], from_servings: 4, ...base }).isError,
    ).toBe(true);
  });

  it("refuses a request that says nothing about how much to multiply by", () => {
    expect(runScaleIngredients({ ingredients: ["2 eggs"], ...base }).isError).toBe(true);
  });

  it("counts what it did to every line", () => {
    const payload = payloadOf<{
      scaled_count: number;
      rounded_count: number;
      unscaled_count: number;
    }>(
      runScaleIngredients({
        ingredients: ["200 g de farine", "3 eggs", "sel"],
        factor: 2.5,
        ...base,
      }),
    );
    expect(payload.scaled_count + payload.rounded_count + payload.unscaled_count).toBe(3);
    expect(payload.unscaled_count).toBe(1);
  });

  it("reads every line in one language when asked to", () => {
    const payload = payloadOf<{ ingredients: Array<{ language: string }> }>(
      runScaleIngredients({
        ingredients: ["200 g flour", "3 eggs"],
        factor: 2,
        language: "fr",
      }),
    );
    expect(payload.ingredients.every((entry) => entry.language === "fr")).toBe(true);
  });

  it("says it fetched nothing", () => {
    const result = runScaleIngredients({ ingredients: ["2 eggs"], factor: 2, ...base });
    expect(textOf(result)).toContain("nothing was fetched");
  });
});

describe("compare_recipes", () => {
  it("shows one version from each source", async () => {
    const payload = payloadOf<{ versions: Array<{ source: string }> }>(
      await runCompareRecipes(fakeClient(), compareArgs({ dish: "crepes" })),
    );
    expect(payload.versions.map((version) => version.source)).toEqual(["marmiton", "cookbook"]);
  });

  it("rescales both versions to the same number of servings", async () => {
    const payload = payloadOf<{
      versions: Array<{ yield: { requested: number; factor: number } }>;
    }>(await runCompareRecipes(fakeClient(), compareArgs({ dish: "crepes", servings: 8 })));

    expect(payload.versions.map((version) => version.yield.factor)).toEqual([2, 1]);
    expect(payload.versions.every((version) => version.yield.requested === 8)).toBe(true);
  });

  it("states what differs without ranking either version", async () => {
    const result = await runCompareRecipes(fakeClient(), compareArgs({ dish: "crepes" }));
    const payload = payloadOf<{ differences: string[] }>(result);

    expect(payload.differences.some((line) => line.includes("yields"))).toBe(true);
    expect(payload.differences.some((line) => /better|best|worse|prefer/i.test(line))).toBe(false);
  });

  it("says that no quantity was converted between measuring systems", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runCompareRecipes(fakeClient(), compareArgs({ dish: "crepes" })),
    );
    expect(payload.notes.some((note) => note.includes("Nothing was converted"))).toBe(true);
  });

  it("shows one version, and says so, when a source fails", async () => {
    const result = await runCompareRecipes(
      fakeClient({ marmiton: { fail: new FakeSourceError("timeout", "Marmiton took too long.") } }),
      compareArgs({ dish: "crepes" }),
    );
    const payload = payloadOf<{ versions: unknown[] }>(result);

    expect(payload.versions).toHaveLength(1);
    expect(textOf(result)).toMatch(/This is one version rather than a comparison/);
    expect(textOf(result)).toMatch(/its search did not answer/);
    expect(textOf(result)).toMatch(/Nothing here is evidence about what it holds/);
  });

  it("tells a source holding nothing apart from one that failed", async () => {
    const result = await runCompareRecipes(
      fakeClient({ marmiton: { rows: [] } }),
      compareArgs({ dish: "crepes" }),
    );
    expect(textOf(result)).toMatch(/answered and offered nothing close enough/);
  });

  it("names which version each note is about", async () => {
    const result = await runCompareRecipes(
      fakeClient(),
      compareArgs({ dish: "crepes", servings: 8 }),
    );
    expect(textOf(result)).toMatch(/Note: Marmiton: /);
  });
});
