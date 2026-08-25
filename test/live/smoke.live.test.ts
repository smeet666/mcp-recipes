/**
 * One request per route against the real sites.
 *
 * The unit suite runs against stand-in sites, so it cannot notice that Marmiton
 * changed a page or that the Wikimedia gateway renamed a field: the day either
 * happens, the unit suite stays green while the published server is broken for
 * everyone. This suite is what notices.
 *
 * It is opt-in. Both sites serve everyone free of charge, and a test run on
 * every push has no business adding load to them.
 */

import process from "node:process";
import { describe, expect, it } from "vitest";
import { RecipesClient } from "../../src/sources/client.js";

const live = process.env.RECIPES_LIVE === "1";
const suite = live ? describe : describe.skip;

const client = new RecipesClient({ config: { logLevel: "info" } });

suite("the sources, as they are today", () => {
  it("answers a search from every source, and names any that did not", async () => {
    const merged = await client.searchRecipes("carbonara", 3);

    for (const report of merged.reports) {
      expect(report.status, `${report.name}: ${report.error?.message ?? ""}`).toBe("answered");
    }
    expect(merged.rows.length).toBeGreaterThan(0);
    expect(new Set(merged.rows.map((row) => row.source)).size).toBe(2);
  });

  it("hands back identifiers that read back as recipes", async () => {
    const merged = await client.searchRecipes("crêpes", 2);

    for (const source of ["marmiton", "cookbook"] as const) {
      const row = merged.rows.find((entry) => entry.source === source);
      expect(row, `no row from ${source}`).toBeDefined();

      const read = await client.getRecipe(row!.id);
      expect(read.recipe.source).toBe(source);
      expect(read.recipe.title.length).toBeGreaterThan(0);
      expect(read.recipe.url.startsWith("https://")).toBe(true);
      // An ingredient list is not guaranteed: the Cookbook keeps reference
      // pages beside recipes, and a row can be one of those. What has to hold
      // is that the page was read at all.
      expect(Array.isArray(read.recipe.ingredients)).toBe(true);
    }
  });

  it("reports a recipe no source holds as an absence carrying a code", async () => {
    // The rule the whole server is built on: an absence is a code, never an
    // empty recipe that reads as "there is no such dish".
    await expect(
      client.getRecipe("cookbook:Cookbook:A page that does not exist here at all"),
    ).rejects.toMatchObject({ code: expect.stringMatching(/not_found|parse_failure/) });
  });

  it("keeps the Cookbook's licence attached to what it publishes", async () => {
    const merged = await client.searchRecipes("pancake", 1, ["cookbook"]);
    const row = merged.rows[0];
    expect(row).toBeDefined();

    const read = await client.getRecipe(row!.id);
    expect(read.recipe.license?.url).toMatch(/creativecommons\.org/);
  });

  it("reads a Marmiton recipe's yield in the site's own words", async () => {
    const merged = await client.searchRecipes("quiche lorraine", 1, ["marmiton"]);
    const row = merged.rows[0];
    expect(row).toBeDefined();

    const read = await client.getRecipe(row!.id);
    expect(read.recipe.yieldText).toBeTruthy();
  });
});
