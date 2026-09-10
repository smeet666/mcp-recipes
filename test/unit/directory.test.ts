/**
 * What the directory listing publishes, held against the server itself.
 *
 * `lhm.plugin.json` is read by a directory and by whoever decides to install
 * this server, and nothing in the build writes it. A description edited in the
 * tool and left alone here sends a reader a sentence the server stopped saying.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareRecipesDescription } from "../../src/tools/compareRecipes.js";
import { getRecipeDescription } from "../../src/tools/getRecipe.js";
import { scaleIngredientsDescription } from "../../src/tools/scaleIngredients.js";
import { searchRecipesDescription } from "../../src/tools/searchRecipes.js";

const listing = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "lhm.plugin.json"), "utf8"),
) as { tools: Array<{ name: string; description: string }>; tags: string[] };

const SAID: Record<string, string> = {
  search_recipes: searchRecipesDescription,
  get_recipe: getRecipeDescription,
  scale_ingredients: scaleIngredientsDescription,
  compare_recipes: compareRecipesDescription,
};

describe("the tool descriptions a directory publishes", () => {
  it("are the ones the server hands a caller", () => {
    for (const tool of listing.tools) {
      const said = SAID[tool.name];
      expect(said, `${tool.name} is listed and the server declares no such tool`).toBeDefined();
      expect(tool.description, `${tool.name} says something the server stopped saying`).toBe(said);
    }
  });

  it("cover every tool the server declares", () => {
    const listed = new Set(listing.tools.map((tool) => tool.name));
    for (const name of Object.keys(SAID)) {
      expect(listed.has(name), `${name} is a tool no directory reader is told about`).toBe(true);
    }
  });
});
