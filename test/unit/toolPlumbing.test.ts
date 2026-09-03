/**
 * The plumbing every tool answer goes through.
 *
 * A refusal that names the argument, a note said once however many times it was
 * raised, a text block that stays inside its budget, and an error rendered in
 * the vocabulary a caller branches on. None of it is about recipes, and all of
 * it decides whether an answer can be read.
 */

import { describe, expect, it } from "vitest";
import { RecipesError } from "../../src/errors.js";
import { runGetRecipe } from "../../src/tools/getRecipe.js";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import { MAX_TEXT_CHARS, mustKeep, noteTexts, ok, toToolError } from "../../src/tools/shared.js";
import {
  fakeClient,
  marmitonRecipe,
  onlyFrom,
  payloadOf,
  pequerecetasCollectionPage,
  recipeArgs,
  searchArgs,
  textOf,
} from "./support.js";

describe("what an answer says once", () => {
  it("says a note once however many times it was raised", () => {
    const result = ok({}, "body", { notes: ["same", "same", mustKeep("same")] });

    expect(textOf(result).split("Note: same").length - 1).toBe(1);
  });

  it("keeps a note nothing may drop, whatever the budget", () => {
    const long = "x".repeat(MAX_TEXT_CHARS);
    const result = ok({}, long, { notes: [mustKeep("this one has to survive")] });

    expect(textOf(result)).toContain("this one has to survive");
    expect(textOf(result).length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
  });

  it("reads the text of a note whichever way it was written", () => {
    expect(noteTexts(["plain", mustKeep("kept")])).toEqual(["plain", "kept"]);
  });
});

describe("an error rendered for a caller", () => {
  it("opens on the code, and carries the hint where there is one", () => {
    const result = toToolError(new RecipesError("not_found", "gone", { hint: "check the id" }));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^\[not_found\] gone/);
    expect(textOf(result)).toMatch(/check the id/);
  });

  it("reads anything else as a network failure rather than guessing", () => {
    expect(textOf(toToolError(new Error("socket hang up")))).toMatch(/^\[network_error\]/);
    expect(textOf(toToolError("something"))).toMatch(/^\[network_error\]/);
  });

  it("carries no structured content, so a caller cannot read a failure as an answer", () => {
    expect(toToolError(new Error("x")).structuredContent).toBeUndefined();
  });
});

describe("what a source report says about the wordings it was sent", () => {
  it("names each wording and what it returned, and never adds them", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchRecipes(
        fakeClient(onlyFrom("marmiton")),
        searchArgs({ query: "comment faire des crepes de la chandeleur" }),
      ),
    );

    expect(payload.notes.some((note) => /never added/.test(note) && /Marmiton/.test(note))).toBe(
      true,
    );
  });

  it("says how many rows it could not read, and leaves them out", async () => {
    const broken = [{ id: null, title: null, url: null }, ...[]] as never;
    const payload = payloadOf<{ per_source: Array<{ source: string; skipped: number }> }>(
      await runSearchRecipes(
        fakeClient({ ...onlyFrom("marmiton"), marmiton: { rows: broken } }),
        searchArgs({ query: "crepes" }),
      ),
    );

    expect(payload.per_source.find((one) => one.source === "marmiton")?.skipped).toBe(1);
  });

  it("says an answer came from the cache where it did", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchRecipes(
        fakeClient({ ...onlyFrom("marmiton"), marmiton: { cached: true } }),
        searchArgs({ query: "crepes" }),
      ),
    );

    expect(payload.notes.some((note) => /cache/.test(note))).toBe(true);
  });
});

describe("a recipe with more steps than were asked for", () => {
  it("says how many there are and how many are here", async () => {
    const many = { ...marmitonRecipe, steps: Array.from({ length: 30 }, (_, i) => `Step ${i}.`) };
    const payload = payloadOf<{ notes: string[] }>(
      await runGetRecipe(
        fakeClient({ marmiton: { recipe: many } }),
        recipeArgs({ id: "marmiton:1001", sections: ["steps"], max_steps: 3 }),
      ),
    );

    expect(payload.notes.some((note) => /30 steps/.test(note))).toBe(true);
  });
});

describe("what get_recipe says about an address that held an article", () => {
  it("says which arguments had nothing to act on", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runGetRecipe(
        fakeClient({ pequerecetas: { page: pequerecetasCollectionPage } }),
        recipeArgs({ id: "pequerecetas:recetas-con-crepes", servings: 8 }),
      ),
    );

    expect(payload.notes.some((note) => /'servings'/.test(note))).toBe(true);
  });

  it("says nothing where no such argument was given", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runGetRecipe(
        fakeClient({ pequerecetas: { page: pequerecetasCollectionPage } }),
        recipeArgs({ id: "pequerecetas:recetas-con-crepes" }),
      ),
    );

    expect(payload.notes.some((note) => /had nothing to act on/.test(note))).toBe(false);
  });

  it("says where a raw identifier was routed, and that the reading was inferred", async () => {
    const payload = payloadOf<{ id_read_as: string | null }>(
      await runGetRecipe(fakeClient(), recipeArgs({ id: "crepes-caseras" })),
    );

    expect(payload.id_read_as).toMatch(/Pequerecetas/);
  });

  it("says an article came from the cache where it did", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runGetRecipe(
        fakeClient({ pequerecetas: { page: pequerecetasCollectionPage, cached: true } }),
        recipeArgs({ id: "pequerecetas:recetas-con-crepes" }),
      ),
    );

    expect(payload.notes.some((note) => /cache/.test(note))).toBe(true);
  });
});

describe("a yield the page states as a span", () => {
  it("says which end the factor was taken from, and what the other would give", async () => {
    const span = {
      ...marmitonRecipe,
      recipeYield: { count: 4, unit: "personnes", text: "4 à 6 personnes" },
    };
    const payload = payloadOf<{ notes: string[] }>(
      await runGetRecipe(
        fakeClient({ marmiton: { recipe: span } }),
        recipeArgs({ id: "marmiton:1001", servings: 8 }),
      ),
    );

    expect(payload.notes.some((note) => /span rather than a number/.test(note))).toBe(true);
  });
});

describe("a question that says the recipe must leave something out", () => {
  it("names the food, and says no source filtered on it", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchRecipes(
        fakeClient(onlyFrom("marmiton")),
        searchArgs({ query: "crepes sans beurre" }),
      ),
    );

    expect(payload.notes.some((note) => /free of/.test(note) && /beurre/.test(note))).toBe(true);
  });

  it("says nothing was read where the words do not name a food plainly", async () => {
    // The negation was read; what it excludes was not written.
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchRecipes(
        fakeClient(onlyFrom("marmiton")),
        searchArgs({ query: "crepes sans" }),
      ),
    );

    expect(
      payload.notes.some((note) => /does not say plainly|do not\s+say plainly/.test(note)),
    ).toBe(true);
  });
});

describe("a list of tools handed to scale_ingredients", () => {
  it("counts them apart and says they were left as given", async () => {
    const { runScaleIngredients } = await import("../../src/tools/scaleIngredients.js");
    const payload = payloadOf<{ equipment_count: number; notes: string[] }>(
      await runScaleIngredients({
        ingredients: ["200 g de harina", "Freidora de aire"],
        factor: 2,
        language: "auto",
      }),
    );

    expect(payload.equipment_count).toBe(1);
    expect(payload.notes.some((note) => /name a tool/.test(note))).toBe(true);
  });
});
