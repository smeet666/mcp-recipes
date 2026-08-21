/**
 * What the server offers a client that has never seen it.
 *
 * A tool is chosen from its name, its description and its schema, so those are
 * the interface, and they are checked here the way an argument would be.
 */

import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { loadConfig } from "../../src/config.js";
import { INSTRUCTIONS, createServer } from "../../src/server.js";
import { compareRecipesInput, compareRecipesOutput } from "../../src/tools/compareRecipes.js";
import { getRecipeInput, getRecipeOutput } from "../../src/tools/getRecipe.js";
import { scaleIngredientsInput, scaleIngredientsOutput } from "../../src/tools/scaleIngredients.js";
import { searchRecipesInput, searchRecipesOutput } from "../../src/tools/searchRecipes.js";
import { fakeClient } from "./support.js";

interface RegisteredTool {
  description?: string;
  annotations?: Record<string, boolean>;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

function registered(): Record<string, RegisteredTool> {
  const server = createServer({ config: loadConfig({}), client: fakeClient() });
  return (server as unknown as { _registeredTools: Record<string, RegisteredTool> })
    ._registeredTools;
}

const TOOLS = ["search_recipes", "get_recipe", "scale_ingredients", "compare_recipes"];

describe("what the server offers", () => {
  it("registers exactly the four tools", () => {
    expect(Object.keys(registered()).sort()).toEqual([...TOOLS].sort());
  });

  it("declares every tool as read-only and non-destructive", () => {
    for (const [name, tool] of Object.entries(registered())) {
      expect(tool.annotations, name).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      });
    }
  });

  it("says that the offline tool reaches nothing outside itself", () => {
    expect(registered().scale_ingredients?.annotations?.openWorldHint).toBe(false);
    expect(registered().search_recipes?.annotations?.openWorldHint).toBe(true);
  });

  it("declares an input and an output schema on every tool", () => {
    for (const [name, tool] of Object.entries(registered())) {
      expect(tool.inputSchema, name).toBeDefined();
      expect(tool.outputSchema, name).toBeDefined();
    }
  });

  it("describes every tool in enough words to choose between them", () => {
    for (const [name, tool] of Object.entries(registered())) {
      expect((tool.description ?? "").length, name).toBeGreaterThan(200);
    }
  });

  it("names every tool in the guidance a model reads first", () => {
    for (const name of TOOLS) {
      expect(INSTRUCTIONS).toContain(name);
    }
  });
});

describe("the guidance a model reads before choosing", () => {
  it("names the sources it reads, and how many, so a caller knows what is being asked", () => {
    expect(INSTRUCTIONS).toContain("Marmiton");
    expect(INSTRUCTIONS).toContain("Wikibooks Cookbook");
    expect(INSTRUCTIONS).toMatch(/reading \d+ sources/);
  });

  it("says a failed source is never an absence", () => {
    expect(INSTRUCTIONS).toMatch(/never evidence about what the others hold/);
  });

  it("says the sources share no scale", () => {
    expect(INSTRUCTIONS).toMatch(/never added/);
  });

  it("tells a model not to rescale quantities itself", () => {
    expect(INSTRUCTIONS).toMatch(/Do not rescale quantities yourself/);
  });

  it("asks for the source to be credited", () => {
    expect(INSTRUCTIONS).toMatch(/Credit the source/);
  });

  it("names the sources it reads and no library it is built on", () => {
    // A caller can act on the name of a corpus. The name of a package this
    // server happens to import tells them nothing.
    expect(INSTRUCTIONS).not.toMatch(/mcp-marmiton|mcp-wikibooks|npm|package/i);
  });
});

describe("what each tool takes", () => {
  it("defaults a search to every source, which is the point of the tool", () => {
    const parsed = searchRecipesInput.parse({ query: "crepes" });
    expect(parsed.sources).toBeUndefined();
    expect(parsed.limit_per_source).toBe(5);
  });

  it("refuses a search with nothing to look for", () => {
    expect(() => searchRecipesInput.parse({ query: "" })).toThrow();
  });

  it("defaults a recipe read to the two sections that answer the question", () => {
    expect(getRecipeInput.parse({ id: "marmiton:1" }).sections).toEqual(["ingredients", "steps"]);
  });

  it("refuses a serving count that is not a whole number of people", () => {
    expect(() => getRecipeInput.parse({ id: "marmiton:1", servings: 0 })).toThrow();
    expect(() => getRecipeInput.parse({ id: "marmiton:1", servings: 2.5 })).toThrow();
  });

  it("refuses a factor of zero, which would delete every ingredient", () => {
    expect(() => scaleIngredientsInput.parse({ ingredients: ["2 eggs"], factor: 0 })).toThrow();
  });

  it("refuses a negative factor", () => {
    expect(() => scaleIngredientsInput.parse({ ingredients: ["2 eggs"], factor: -1 })).toThrow();
  });

  it("refuses an empty ingredient list", () => {
    expect(() => scaleIngredientsInput.parse({ ingredients: [], factor: 2 })).toThrow();
  });

  it("reads each line on its own unless told otherwise", () => {
    expect(scaleIngredientsInput.parse({ ingredients: ["2 eggs"], factor: 2 }).language).toBe(
      "auto",
    );
  });

  it("defaults a comparison to the ingredient lists, which is what differs", () => {
    expect(compareRecipesInput.parse({ dish: "carbonara" }).sections).toEqual(["ingredients"]);
  });
});

describe("what each tool promises to return", () => {
  const shapes: [string, z.ZodObject<z.ZodRawShape>][] = [
    ["search_recipes", searchRecipesOutput],
    ["get_recipe", getRecipeOutput],
    ["scale_ingredients", scaleIngredientsOutput],
    ["compare_recipes", compareRecipesOutput],
  ];

  it("carries notes on every tool, because every answer can need qualifying", () => {
    for (const [name, schema] of shapes) {
      expect(Object.keys(schema.shape), name).toContain("notes");
    }
  });

  it("carries the per-source report on every tool that calls a source", () => {
    expect(Object.keys(searchRecipesOutput.shape)).toContain("per_source");
    expect(Object.keys(compareRecipesOutput.shape)).toContain("per_source");
  });
});
