/**
 * What the text block says about a line that came back unmultiplied.
 *
 * A line carries no quantity, or carries one this server declined to multiply,
 * and those are different facts about the same line. The structured output
 * distinguishes them with a note, and the text block a caller reads has to say
 * the same thing.
 */

import { describe, expect, it } from "vitest";
import { runGetRecipe } from "../../src/tools/getRecipe.js";
import { fakeClient, marmitonRecipe, recipeArgs, textOf } from "./support.js";

const textFor = async (ingredients: string[]): Promise<string> =>
  textOf(
    await runGetRecipe(
      fakeClient({ marmiton: { recipe: { ...marmitonRecipe, ingredients } } }),
      recipeArgs({ id: "marmiton:1001", servings: 8 }),
    ),
  );

describe("a line carrying a figure this server declined to multiply", () => {
  it("says why rather than calling the line quantityless", async () => {
    const text = await textFor(["Cuire 25 minutes à 180 °C", "250 g de farine"]);

    const line = text.split("\n").find((one) => one.includes("180"));
    expect(line, "the line is rendered").toBeDefined();
    expect(
      line,
      "the line states a temperature and a time, which are quantities it carries",
    ).not.toContain("(no quantity)");
  });
});

describe("a line carrying nothing to multiply", () => {
  it("says that no quantity was given", async () => {
    const text = await textFor(["Sel", "250 g de farine"]);

    const line = text.split("\n").find((one) => one.startsWith("- Sel"));
    expect(line, "the line is rendered").toBeDefined();
    expect(line?.toLowerCase()).toContain("no quantity");
  });
});
