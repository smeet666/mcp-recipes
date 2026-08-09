/**
 * What the text block owes a long list.
 *
 * Many clients render the text block and nothing else, so a block whose room
 * has run out is the whole of what a reader sees. Sentences qualifying the
 * answer keep their room, which means the result lines are what gives way; a
 * list that gives way to nothing at all, in silence, reads as a recipe that
 * needs no ingredients.
 */

import { describe, expect, it } from "vitest";
import { runGetRecipe } from "../../src/tools/getRecipe.js";
import { runCompareRecipes } from "../../src/tools/compareRecipes.js";
import {
  compareArgs,
  cookbookRecipe,
  fakeClient,
  marmitonRecipe,
  recipeArgs,
  textOf,
} from "./support.js";

/** A page whose ingredient list is far longer than any text block. */
const longList = Array.from(
  { length: 119 },
  (_, index) => `${index + 1} g de farine type ${index}`,
);

const longMarmiton = { ...marmitonRecipe, ingredients: longList };
const longCookbook = {
  ...cookbookRecipe,
  ingredients: longList.map((_line, index) => `${index + 1} g of flour, grade ${index}`),
};

describe("a list too long for the block still opens", () => {
  it("renders ingredient lines from a recipe carrying more than the block holds", () => {
    return runGetRecipe(
      fakeClient({ marmiton: { recipe: longMarmiton } }),
      recipeArgs({ id: "marmiton:1001", servings: 12, sections: ["ingredients", "steps"] }),
    ).then((result) => {
      const shown = textOf(result)
        .split("\n")
        .filter((line) => line.startsWith("- "));
      expect(shown.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("says how many lines the block left out", () => {
    return runGetRecipe(
      fakeClient({ marmiton: { recipe: longMarmiton } }),
      recipeArgs({ id: "marmiton:1001", servings: 12, sections: ["ingredients", "steps"] }),
    ).then((result) => {
      expect(textOf(result)).toMatch(/of 119 ingredient lines/);
    });
  });

  it("gives every version of a comparison an opening", () => {
    return runCompareRecipes(
      fakeClient({
        marmiton: { recipe: longMarmiton },
        cookbook: { recipe: longCookbook },
      }),
      compareArgs({
        dish: "crêpes",
        servings: 12,
        sections: ["ingredients", "steps", "times", "nutrition", "tips", "equipment"],
      }),
    ).then((result) => {
      const text = textOf(result);
      for (const block of text.split("\n\n")) {
        if (!block.includes("yields")) continue;
        expect(
          block.split("\n").filter((line) => line.trimStart().startsWith("- ")).length,
        ).toBeGreaterThanOrEqual(1);
      }
      expect(text).toMatch(/of 119 ingredient lines/);
    });
  });
});
