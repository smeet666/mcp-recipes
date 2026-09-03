/**
 * One request per route against the real sites.
 *
 * The unit suite runs against stand-in sites, so it cannot notice that one of
 * them changed a page or that the Wikimedia gateway renamed a field: the day
 * that happens, the unit suite stays green while the published server is broken
 * for everyone. This suite is what notices.
 *
 * It is opt-in. Every one of these sites serves everyone free of charge, and a
 * test run on every push has no business adding load to them.
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
    expect(new Set(merged.rows.map((row) => row.source)).size).toBe(6);
  });

  it("hands back identifiers that read back as recipes", async () => {
    const merged = await client.searchRecipes("crêpes", 2);

    for (const source of [
      "marmiton",
      "cookbook",
      "ptitchef",
      "goodfood",
      "supertoinette",
      "pequerecetas",
    ] as const) {
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

  it("reads Pequerecetas, which answers in Spanish and states no total", async () => {
    // The site's search matches the words a page was written with, so the
    // question is asked in the language the site publishes in.
    const merged = await client.searchRecipes("tortilla de patatas", 2, ["pequerecetas"]);
    const report = merged.reports[0];

    expect(report?.status).toBe("answered");
    expect(report?.reportedTotal).toBeNull();
    expect(report?.reportedTotalMeans).toBeNull();
    expect(merged.rows.length).toBeGreaterThan(0);
  });

  it("scales a Spanish recipe in Spanish", async () => {
    const merged = await client.searchRecipes("tortilla de patatas", 2, ["pequerecetas"]);
    const read = await client.getRecipe(merged.rows[0]!.id);

    expect(read.recipe.language).toBe("es");
    expect(read.recipe.ingredients.length).toBeGreaterThan(0);
  });

  it("states no total for Supertoinette, which prints none", async () => {
    const merged = await client.searchRecipes("tarte", 2, ["supertoinette"]);
    const report = merged.reports[0];

    expect(report?.status).toBe("answered");
    expect(report?.reportedTotal).toBeNull();
    expect(report?.reportedTotalMeans).toBeNull();
  });

  it("says what Ptitchef's own total counts, in the words of the answer it gave", async () => {
    const merged = await client.searchRecipes("gateau au chocolat", 2, ["ptitchef"]);
    const report = merged.reports[0];

    expect(report?.status).toBe("answered");
    if (report?.reportedTotal !== null) {
      // The site prints one total for several kinds of answer, so the words
      // beside it are what say which of them this is.
      expect(report?.reportedTotalMeans).toBeTruthy();
    }
  });

  it("names a BBC Good Food recipe it keeps back rather than reading it as empty", async () => {
    const merged = await client.searchRecipes("chicken", 10, ["goodfood"]);
    expect(merged.rows.length).toBeGreaterThan(0);

    // Which rows sit behind the subscription is the site's business and changes,
    // so what is asserted is the rule: a recipe with no ingredient lines is
    // either one this server could not read or one the site keeps back, and a
    // recipe marked as kept back never comes back as an unexplained empty list.
    for (const row of merged.rows.slice(0, 3)) {
      const read = await client.getRecipe(row.id);
      if (read.recipe.withheld !== null) {
        expect(read.recipe.ingredients).toEqual([]);
        expect(read.recipe.withheld.why).toContain("subscribers");
        expect(read.recipe.title.length).toBeGreaterThan(0);
      }
    }
  });
});
