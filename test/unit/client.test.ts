/**
 * Merging the sources into one answer, and what happens when one of them stops
 * answering.
 *
 * The rule this file exists for: a source that fails is reported as a source
 * that failed. Folding it into the answer as silence is the single mistake that
 * turns a working server into one that states things about the world that are
 * untrue.
 */

import { describe, expect, it } from "vitest";
import { RecipesError } from "../../src/errors.js";
import { interleave } from "../../src/sources/client.js";
import type { RecipeRow } from "../../src/types.js";
import { FakeSourceError, cookbookRows, fakeClient, marmitonRows } from "./support.js";

const row = (id: string, source: RecipeRow["source"]): RecipeRow => ({
  id,
  source,
  sourceName: source,
  title: id,
  url: `https://example.invalid/${id}`,
  imageUrl: null,
  excerpt: null,
});

describe("rows are interleaved rather than ranked", () => {
  it("takes one from each source in turn", () => {
    const merged = interleave([
      [row("m1", "marmiton"), row("m2", "marmiton")],
      [row("c1", "cookbook"), row("c2", "cookbook")],
    ]);
    expect(merged.map((entry) => entry.id)).toEqual(["m1", "c1", "m2", "c2"]);
  });

  it("keeps the whole of a longer list", () => {
    const merged = interleave([
      [row("m1", "marmiton"), row("m2", "marmiton"), row("m3", "marmiton")],
      [row("c1", "cookbook")],
    ]);
    expect(merged.map((entry) => entry.id)).toEqual(["m1", "c1", "m2", "m3"]);
  });

  it("returns nothing for nothing", () => {
    expect(interleave([[], []])).toEqual([]);
  });
});

describe("every source answering", () => {
  it("returns rows from each, every one naming its source", () => {
    return fakeClient()
      .searchRecipes("crepes", 5)
      .then((merged) => {
        expect(merged.rows).toHaveLength(marmitonRows.length + cookbookRows.length);
        expect(merged.rows.map((entry) => entry.source)).toEqual([
          "marmiton",
          "cookbook",
          "marmiton",
          "cookbook",
        ]);
        expect(merged.rows.every((entry) => entry.id.includes(":"))).toBe(true);
      });
  });

  it("reports what each source said its own count meant", async () => {
    const merged = await fakeClient().searchRecipes("crepes", 5);
    const marmiton = merged.reports.find((entry) => entry.source === "marmiton")!;
    const cookbook = merged.reports.find((entry) => entry.source === "cookbook")!;

    expect(marmiton.reportedTotal).toBe(marmitonRows.length);
    expect(marmiton.reportedTotalMeans).toMatch(/single page/);
    // The gateway states no total, and counting the rows would invent one.
    expect(cookbook.reportedTotal).toBeNull();
    expect(cookbook.reportedTotalMeans).toBeNull();
  });

  it("honours a limit per source, applied to each of them", async () => {
    const merged = await fakeClient().searchRecipes("crepes", 1);
    expect(merged.rows).toHaveLength(2);
    expect(new Set(merged.rows.map((entry) => entry.source)).size).toBe(2);
  });

  it("asks only the sources it was named", async () => {
    const merged = await fakeClient().searchRecipes("crepes", 5, ["cookbook"]);
    expect(merged.reports.map((entry) => entry.source)).toEqual(["cookbook"]);
    expect(merged.rows.every((entry) => entry.source === "cookbook")).toBe(true);
  });
});

describe("one source failing", () => {
  const down = fakeClient({
    marmiton: { fail: new FakeSourceError("rate_limited", "Marmiton asked this client to wait.") },
  });

  it("still returns what the other sources found", async () => {
    const merged = await down.searchRecipes("crepes", 5);
    expect(merged.rows).toHaveLength(cookbookRows.length);
    expect(merged.rows.every((entry) => entry.source === "cookbook")).toBe(true);
  });

  it("names the source that failed, and why", async () => {
    const merged = await down.searchRecipes("crepes", 5);
    const marmiton = merged.reports.find((entry) => entry.source === "marmiton")!;
    expect(marmiton.status).toBe("failed");
    expect(marmiton.count).toBe(0);
    expect(marmiton.error?.code).toBe("rate_limited");
  });

  it("keeps a source's own error code", async () => {
    const missing = fakeClient({
      cookbook: { fail: new FakeSourceError("not_found", "No such page.") },
    });
    const merged = await missing.searchRecipes("crepes", 5);
    expect(merged.reports.find((entry) => entry.source === "cookbook")?.error?.code).toBe(
      "not_found",
    );
  });

  it("reads a failure carrying no code as a network failure rather than an absence", async () => {
    const broken = fakeClient({ cookbook: { fail: new Error("socket hang up") } });
    const merged = await broken.searchRecipes("crepes", 5);
    expect(merged.reports.find((entry) => entry.source === "cookbook")?.error?.code).toBe(
      "network_error",
    );
  });
});

describe("every source failing", () => {
  it("returns no rows and a failure for each, which is a different answer from an empty one", async () => {
    const merged = await fakeClient({
      marmiton: { fail: new FakeSourceError("timeout", "Marmiton took too long.") },
      cookbook: { fail: new FakeSourceError("network_error", "The gateway was unreachable.") },
    }).searchRecipes("crepes", 5);

    expect(merged.rows).toEqual([]);
    expect(merged.reports.every((entry) => entry.status === "failed")).toBe(true);
  });
});

describe("a search that cannot be made", () => {
  it("refuses an empty query", async () => {
    await expect(fakeClient().searchRecipes("   ", 5)).rejects.toBeInstanceOf(RecipesError);
  });

  it("refuses a request naming no source at all", async () => {
    await expect(fakeClient().searchRecipes("crepes", 5, [])).rejects.toThrow(/at least one source/);
  });
});

describe("reading one recipe", () => {
  it("calls only the source the identifier names", async () => {
    const halfDown = fakeClient({
      marmiton: { fail: new FakeSourceError("network_error", "Marmiton was unreachable.") },
    });
    const read = await halfDown.getRecipe("cookbook:Cookbook:Crepes");
    expect(read.recipe.source).toBe("cookbook");
  });

  it("raises that source's own failure, and never answers with another source", async () => {
    const halfDown = fakeClient({
      marmiton: { fail: new FakeSourceError("not_found", "Marmiton has no recipe there.") },
    });
    await expect(halfDown.getRecipe("marmiton:1")).rejects.toMatchObject({ code: "not_found" });
  });

  it("gives back an identifier that names the source it came from", async () => {
    const read = await fakeClient().getRecipe("marmiton:1001");
    expect(read.recipe.id).toBe("marmiton:1001");
  });
});
