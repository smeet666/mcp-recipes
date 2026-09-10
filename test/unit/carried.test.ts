/**
 * What a payload counts, and what a deadline covers.
 *
 * A count in an answer names the lines that answer carries, and a page that
 * measures its yield in objects is not measuring eaters. Both are statements a
 * reader acts on: one to know whether a list was cut, the other to know whether
 * a recipe was put to the number of people that was asked for.
 */

import { describe, expect, it } from "vitest";
import { readYieldSpan } from "../../src/sources/adapter.js";
import { runGetRecipe } from "../../src/tools/getRecipe.js";
import { fakeClient, payloadOf, recipeArgs } from "./support.js";

describe("a yield the page counts in objects", () => {
  it("carries its unit even when the page opens with a word", () => {
    expect(readYieldSpan("Makes 12 muffins").unit).toBe("muffins");
    expect(readYieldSpan("Pour 24 madeleines").unit).toBe("madeleines");
  });

  it("carries no unit when the page counts eaters", () => {
    expect(readYieldSpan("Serves 4").unit).toBeNull();
    expect(readYieldSpan("4 personnes").unit).toBe("personnes");
  });
});

describe("scaling_summary", () => {
  it("counts the lines the answer carries, and no others", async () => {
    const payload = payloadOf(
      await runGetRecipe(
        fakeClient(),
        recipeArgs({ id: "marmiton:1001", servings: 8, sections: ["steps"] }),
      ),
    ) as {
      recipe: {
        ingredients: unknown[];
        scaling_summary: {
          scaled_count: number;
          rounded_count: number;
          unscaled_count: number;
          equipment_count: number;
        };
      };
    };

    const summary = payload.recipe.scaling_summary;
    const total =
      summary.scaled_count +
      summary.rounded_count +
      summary.unscaled_count +
      summary.equipment_count;

    expect(total, "the schema states the four counts add up to the ingredient lines returned").toBe(
      payload.recipe.ingredients.length,
    );
  });
});
