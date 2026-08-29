/**
 * What a recipe view is allowed to say about a part that is not there.
 *
 * Three statements a page can make that the merged shape has to carry: a part
 * the source keeps for its subscribers, a method published as one block, and a
 * resting time published apart from preparation and cooking. Every recipe here
 * is written out rather than read from a source, so what is under test is the
 * view alone.
 */

import { describe, expect, it } from "vitest";
import { buildRecipeView } from "../../src/tools/recipeView.js";
import { noteTexts } from "../../src/tools/shared.js";
import type { RecipeDetail } from "../../src/types.js";

function recipe(over: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: "example:1",
    source: "example",
    sourceName: "Example",
    language: "en",
    title: "A dish",
    url: "https://example.test/a-dish",
    imageUrl: null,
    yieldCount: 4,
    yieldMax: null,
    yieldText: "Serves 4",
    yieldUnit: "people",
    ingredients: ["200 g butter", "300 ml milk"],
    steps: ["Melt the butter.", "Pour the milk."],
    publishedSections: null,
    prepMinutes: 10,
    cookMinutes: 20,
    totalMinutes: 30,
    restMinutes: null,
    stepsAsOneBlock: null,
    withheld: null,
    category: null,
    author: null,
    rating: null,
    nutrition: null,
    equipment: [],
    tips: [],
    license: null,
    attribution: "Source: Example",
    ...over,
  };
}

const ALL = ["ingredients", "steps", "times", "nutrition", "tips", "equipment"] as const;

describe("a part the source withholds", () => {
  const withheld = recipe({
    ingredients: [],
    steps: [],
    withheld: {
      parts: ["ingredients", "method"],
      why: "Example keeps this recipe's ingredients and method for its subscribers",
    },
  });

  it("names the subscription and the url rather than a page it could not read", () => {
    const said = noteTexts(buildRecipeView(withheld, { servings: null, sections: ALL }).notes);
    const about = said.filter((line) => line.includes("subscribers"));

    expect(about).toHaveLength(2);
    for (const line of about) {
      expect(line).toContain("https://example.test/a-dish");
      expect(line).not.toContain("could not follow");
      expect(line).not.toContain("look the same from here");
    }
  });

  it("keeps that note when the answer has to drop others", () => {
    const view = buildRecipeView(withheld, { servings: null, sections: ALL });
    const kept = view.notes.filter(
      (note) => typeof note !== "string" && note.text.includes("subscribers"),
    );

    expect(kept).toHaveLength(2);
  });

  it("says there is nothing to put to a number of people, not that the page states no servings", () => {
    const said = noteTexts(buildRecipeView(withheld, { servings: 8, sections: ALL }).notes);

    expect(said.some((line) => line.includes("nothing here to put to 8"))).toBe(true);
    expect(said.some((line) => line.includes("states no number of servings"))).toBe(false);
  });

  it("leaves the factor unset, so no quantity is presented as recomputed", () => {
    const view = buildRecipeView(withheld, { servings: 8, sections: ALL });

    expect(view.payload.yield.factor).toBeNull();
    expect(view.payload.yield.original_count).toBe(4);
  });

  it("carries what was withheld into the payload", () => {
    const view = buildRecipeView(withheld, { servings: null, sections: ALL });

    expect(view.payload.withheld).toEqual({
      parts: ["ingredients", "method"],
      why: "Example keeps this recipe's ingredients and method for its subscribers",
    });
  });

  it("still reads an unmentioned empty part as a part it failed to read", () => {
    const half = recipe({
      ingredients: [],
      steps: [],
      withheld: { parts: ["ingredients"], why: "Example keeps this recipe's ingredients back" },
    });
    const said = noteTexts(buildRecipeView(half, { servings: null, sections: ALL }).notes);

    expect(said.some((line) => line.includes("step of method") && line.includes("the same"))).toBe(
      true,
    );
  });

  it("says nothing about withholding on a source that withholds nothing", () => {
    const said = noteTexts(
      buildRecipeView(recipe({ ingredients: [], steps: [] }), { servings: null, sections: ALL })
        .notes,
    );

    expect(said.some((line) => line.includes("subscribers"))).toBe(false);
    expect(said.some((line) => line.includes("look the same from here"))).toBe(true);
  });
});

describe("a method published as one block", () => {
  it("says so rather than letting the block read as step one", () => {
    const said = noteTexts(
      buildRecipeView(recipe({ steps: ["Do all of it at once."], stepsAsOneBlock: true }), {
        servings: null,
        sections: ALL,
      }).notes,
    );

    expect(said.some((line) => line.includes("one block"))).toBe(true);
  });

  it("says nothing of the kind when the source reports separate steps", () => {
    const said = noteTexts(
      buildRecipeView(recipe({ stepsAsOneBlock: false }), { servings: null, sections: ALL }).notes,
    );

    expect(said.some((line) => line.includes("one block"))).toBe(false);
  });

  it("says nothing of the kind when the source reports neither", () => {
    const said = noteTexts(buildRecipeView(recipe(), { servings: null, sections: ALL }).notes);

    expect(said.some((line) => line.includes("one block"))).toBe(false);
  });

  it("carries the source's own answer into the payload, including its silence", () => {
    const told = buildRecipeView(recipe({ stepsAsOneBlock: true }), {
      servings: null,
      sections: ALL,
    });
    const silent = buildRecipeView(recipe(), { servings: null, sections: ALL });

    expect(told.payload.steps_as_one_block).toBe(true);
    expect(silent.payload.steps_as_one_block).toBeNull();
  });
});

describe("a resting time published apart", () => {
  it("is returned under its own name and folded into no other time", () => {
    const view = buildRecipeView(recipe({ restMinutes: 120 }), {
      servings: null,
      sections: ALL,
    });

    expect(view.payload.rest_minutes).toBe(120);
    expect(view.payload.cook_minutes).toBe(20);
    expect(view.payload.prep_minutes).toBe(10);
    expect(view.payload.total_minutes).toBe(30);
  });

  it("is null from a source that publishes none, which is not zero", () => {
    const view = buildRecipeView(recipe(), { servings: null, sections: ALL });

    expect(view.payload.rest_minutes).toBeNull();
  });

  it("is withheld with the rest of the times when the section was not asked for", () => {
    const view = buildRecipeView(recipe({ restMinutes: 120 }), {
      servings: null,
      sections: ["ingredients"],
    });

    expect(view.payload.rest_minutes).toBeNull();
    expect(view.payload.cook_minutes).toBeNull();
  });
});
