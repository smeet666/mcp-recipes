/**
 * The same question, asked again, answers the same.
 *
 * Time is pinned to one instant here rather than measured, so a test cannot
 * pass on a fast machine and fail on a slow one, and nothing in an answer can
 * be a clock reading that changes between two runs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scaleIngredients } from "../../src/recipe/scale.js";
import { runCompareRecipes } from "../../src/tools/compareRecipes.js";
import { runGetRecipe } from "../../src/tools/getRecipe.js";
import { runScaleIngredients } from "../../src/tools/scaleIngredients.js";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import { compareArgs, fakeClient, recipeArgs, textOf } from "./support.js";

const EPOCH = new Date("2026-02-02T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ now: EPOCH });
});

afterEach(() => {
  vi.useRealTimers();
});

const PASSES = 5;

async function fiveTimes(run: () => Promise<string> | string): Promise<string[]> {
  const answers: string[] = [];
  for (let pass = 0; pass < PASSES; pass += 1) answers.push(await run());
  return answers;
}

function identical(answers: string[]): void {
  expect(new Set(answers).size).toBe(1);
}

describe("five consecutive passes agree", () => {
  it("on a search across every source", async () => {
    identical(
      await fiveTimes(async () =>
        textOf(await runSearchRecipes(fakeClient(), { query: "crepes", limit_per_source: 5 })),
      ),
    );
  });

  it("on one recipe, rescaled", async () => {
    identical(
      await fiveTimes(async () =>
        textOf(
          await runGetRecipe(fakeClient(), recipeArgs({ id: "marmiton:1001", servings: 9, sections: ["ingredients", "steps"] })),
        ),
      ),
    );
  });

  it("on a comparison", async () => {
    identical(
      await fiveTimes(async () =>
        textOf(
          await runCompareRecipes(fakeClient(), compareArgs({ dish: "crepes", servings: 7 })),
        ),
      ),
    );
  });

  it("on a list scaled offline", async () => {
    identical(
      await fiveTimes(() =>
        textOf(
          runScaleIngredients({
            ingredients: ["250 g de farine", "3 eggs", "une pincée de sel", "1 can tomatoes"],
            factor: 7 / 3,
            language: "auto",
          }),
        ),
      ),
    );
  });
});

describe("nothing in an answer is a clock reading", () => {
  it("carries no timestamp and no elapsed time", async () => {
    const text = textOf(
      await runGetRecipe(fakeClient(), recipeArgs({ id: "marmiton:1001", servings: 8, sections: ["ingredients", "times"] })),
    );
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(text).not.toMatch(/\bms\b|\belapsed\b|\btook \d/);
  });

  it("answers the same whichever instant the clock is pinned to", async () => {
    const at = async (instant: string) => {
      vi.setSystemTime(new Date(instant));
      return textOf(
        await runSearchRecipes(fakeClient(), { query: "crepes", limit_per_source: 5 }),
      );
    };
    expect(await at("2020-01-01T00:00:00.000Z")).toBe(await at("2030-12-31T23:59:59.000Z"));
  });
});

describe("scaling is a function of its arguments and nothing else", () => {
  it("gives the same answer for the same list and factor", () => {
    const lines = ["250 g de farine", "3 eggs", "2/3 d'un flacon de fleur d'oranger"];
    const runs = Array.from({ length: PASSES }, () =>
      JSON.stringify(scaleIngredients(lines, { factor: 2.5 })),
    );
    identical(runs);
  });

  it("gives the same answer whichever order two lists are scaled in", () => {
    const first = ["3 eggs"];
    const second = ["une pincée de sel"];
    // Each result depends only on its own list, so swapping the call order
    // swaps the results and changes nothing inside either of them.
    const forward = [
      JSON.stringify(scaleIngredients(first, { factor: 2 })),
      JSON.stringify(scaleIngredients(second, { factor: 2 })),
    ];
    const backward = [
      JSON.stringify(scaleIngredients(second, { factor: 2 })),
      JSON.stringify(scaleIngredients(first, { factor: 2 })),
    ];
    expect(forward).toEqual([backward[1], backward[0]]);
  });
});
