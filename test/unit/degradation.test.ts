/**
 * What an answer says when a source misbehaves, and how it stays bounded.
 *
 * A source can be slow, unreachable, rate limiting, or answering in a shape
 * this server cannot read, and each of those is a different statement about the
 * world. The cases here hold the answer to saying the right one, and to saying
 * it in the text block as well as in the structured payload. The last blocks
 * cover the ceilings that keep one answer from becoming an unbounded one.
 */

import { describe, expect, it } from "vitest";
import { RecipesClient } from "../../src/sources/client.js";
import { resolveId } from "../../src/sources/ids.js";
import { runCompareRecipes } from "../../src/tools/compareRecipes.js";
import { runGetRecipe } from "../../src/tools/getRecipe.js";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import { MAX_TEXT_CHARS, mustKeep, ok } from "../../src/tools/shared.js";
import {
  FakeSourceError,
  cookbookRecipe,
  fakeClient,
  fakeCookbook,
  fakeMarmiton,
  marmitonRecipe,
  marmitonRows,
  payloadOf,
  fakeSources,
  silentLogger,
  textOf,
  recipeArgs,
  compareArgs,
} from "./support.js";

/** A reader answering in a shape no source publishes. */
function malformed(shape: unknown) {
  return {
    async search() {
      return { data: shape as never, cached: false };
    },
    async getRecipe() {
      return { data: shape as never, cached: false };
    },
  };
}

describe("a row a site sent in a shape this server cannot read", () => {
  it("drops that row and keeps the rest of the answer", async () => {
    const rows = [
      {
        ...marmitonRows[0]!,
        title: null as unknown as string,
        url: undefined as unknown as string,
      },
      marmitonRows[1]!,
    ];
    const client = new RecipesClient({
      logger: silentLogger,
      readers: { marmiton: fakeMarmiton({ rows }), cookbook: fakeCookbook() },
    });

    const merged = await client.searchRecipes("crepes", 5);
    expect(merged.rows.filter((row) => row.source === "marmiton")).toHaveLength(1);
    expect(merged.rows.filter((row) => row.source === "cookbook").length).toBeGreaterThan(0);
  });

  it("says how many rows it left out rather than counting them as answers", async () => {
    const rows = [{ ...marmitonRows[0]!, url: undefined as unknown as string }, marmitonRows[1]!];
    const client = new RecipesClient({
      logger: silentLogger,
      readers: { marmiton: fakeMarmiton({ rows }), cookbook: fakeCookbook() },
    });

    const merged = await client.searchRecipes("crepes", 5);
    const marmiton = merged.reports.find((entry) => entry.source === "marmiton")!;
    expect(marmiton.skipped).toBe(1);
    expect(marmiton.count).toBe(1);
  });

  it("survives a payload with no rows array at all", async () => {
    const client = new RecipesClient({
      logger: silentLogger,
      readers: { marmiton: malformed({}), cookbook: fakeCookbook() },
    });

    const merged = await client.searchRecipes("crepes", 5);
    const marmiton = merged.reports.find((entry) => entry.source === "marmiton")!;
    expect(marmiton.status).toBe("failed");
    expect(marmiton.error?.code).toBe("parse_failure");
    expect(merged.rows.length).toBeGreaterThan(0);
  });
});

describe("a recipe a site sent in a shape this server cannot read", () => {
  it("is reported as unreadable rather than as a network failure", async () => {
    const client = new RecipesClient({
      logger: silentLogger,
      readers: { marmiton: malformed({ id: "1" }), cookbook: fakeCookbook() },
    });
    await expect(client.getRecipe("marmiton:1")).rejects.toMatchObject({
      code: "parse_failure",
    });
  });

  it("names the field that could not be read, rather than quoting a runtime message", async () => {
    const client = new RecipesClient({
      logger: silentLogger,
      readers: { marmiton: malformed({ id: "1" }), cookbook: fakeCookbook() },
    });
    await expect(client.getRecipe("marmiton:1")).rejects.toThrow(/title/i);
  });

  it("drops an ingredient line that is not text rather than failing the read", async () => {
    const broken = {
      ...cookbookRecipe,
      ingredients: [null, 42, "500 ml milk"] as unknown as string[],
    };
    const client = new RecipesClient({
      logger: silentLogger,
      readers: { marmiton: fakeMarmiton(), cookbook: fakeCookbook({ recipe: broken }) },
    });

    const read = await client.getRecipe("cookbook:Cookbook:Crepes");
    expect(read.recipe.ingredients).toEqual(["500 ml milk"]);
  });
});

describe("a site that never answers", () => {
  it("does not hold the whole call open behind it", async () => {
    const stalled = {
      search: () => new Promise<never>(() => undefined),
      getRecipe: () => new Promise<never>(() => undefined),
    };
    const client = new RecipesClient({
      logger: silentLogger,
      config: { timeoutMs: 1000, maxRetries: 0 },
      readers: { marmiton: stalled, cookbook: fakeCookbook() },
    });

    const merged = await client.searchRecipes("crepes", 5);
    const marmiton = merged.reports.find((entry) => entry.source === "marmiton")!;
    expect(marmiton.status).toBe("failed");
    expect(marmiton.error?.code).toBe("timeout");
    expect(merged.rows.length).toBeGreaterThan(0);
  }, 30_000);
});

describe("a configuration object handed to the published client", () => {
  it("cannot turn the deadline off", () => {
    const client = new RecipesClient({
      config: { timeoutMs: 0 },
      readers: { marmiton: fakeMarmiton(), cookbook: fakeCookbook() },
    });
    expect(client.timeoutMs).toBeGreaterThan(0);
  });

  it("cannot ask for a retry storm", () => {
    const client = new RecipesClient({
      config: { maxRetries: 100_000 },
      readers: { marmiton: fakeMarmiton(), cookbook: fakeCookbook() },
    });
    expect(client.maxRetries).toBeLessThanOrEqual(8);
  });
});

describe("search_recipes when nothing answered", () => {
  const bothDown = () =>
    fakeClient({
      marmiton: { fail: new FakeSourceError("rate_limited", "Slow down.") },
      cookbook: { fail: new FakeSourceError("rate_limited", "Slow down.") },
    });

  it("does not open with a sentence that reads as an absence", async () => {
    const text = textOf(
      await runSearchRecipes(bothDown(), { query: "crepes", limit_per_source: 5, fan_out: true }),
    );
    expect(text).not.toMatch(/^Nothing came back/);
    expect(text).toMatch(/No source answered/);
  });

  it("does not claim another source found something when none did", async () => {
    const text = textOf(
      await runSearchRecipes(bothDown(), { query: "crepes", limit_per_source: 5, fan_out: true }),
    );
    expect(text).not.toMatch(/holds what the other sources found/);
  });

  it("does not promise another source when only one was asked", async () => {
    const text = textOf(
      await runSearchRecipes(
        fakeClient({ marmiton: { fail: new FakeSourceError("timeout", "too slow") } }),
        { query: "crepes", limit_per_source: 5, sources: ["marmiton"], fan_out: true },
      ),
    );
    expect(text).not.toMatch(/holds what the other sources found/);
  });
});

describe("compare_recipes when a version could not be read", () => {
  const readFails = () =>
    fakeClient({ marmiton: { failRecipe: new FakeSourceError("timeout", "Marmiton was slow.") } });

  it("does not say a site offered nothing when its search offered a row", async () => {
    const text = textOf(await runCompareRecipes(readFails(), compareArgs({ dish: "crepes" })));
    expect(text).not.toMatch(/Marmiton answered and offered nothing/);
  });

  it("names the site and the code of the failure", async () => {
    const text = textOf(await runCompareRecipes(readFails(), compareArgs({ dish: "crepes" })));
    expect(text).toMatch(/Marmiton/);
    expect(text).toMatch(/timeout/);
  });

  it("says nothing was compared when neither version could be read", async () => {
    const text = textOf(
      await runCompareRecipes(
        fakeClient({
          marmiton: { failRecipe: new FakeSourceError("network_error", "hang up") },
          cookbook: { failRecipe: new FakeSourceError("network_error", "hang up") },
        }),
        compareArgs({ dish: "crepes" }),
      ),
    );
    expect(text).not.toMatch(/No source offered a recipe/);
    expect(text).not.toMatch(/This is one version/);
    expect(text).toMatch(/could not be read/);
  });
});

describe("compare_recipes stays readable", () => {
  it("shows every version in the text a client renders", async () => {
    const text = textOf(await runCompareRecipes(fakeClient(), compareArgs({ dish: "crepes" })));
    expect(text).toContain("https://www.marmiton.org");
    expect(text).toContain("https://en.wikibooks.org");
  });

  it("keeps the licence of a site that requires attribution", async () => {
    const text = textOf(await runCompareRecipes(fakeClient(), compareArgs({ dish: "crepes" })));
    expect(text).toMatch(/Creative Commons/);
  });

  it("states a section choice once rather than once per version", async () => {
    const text = textOf(await runCompareRecipes(fakeClient(), compareArgs({ dish: "crepes" })));
    const omissions = text.split("\n").filter((line) => line.includes("Not requested"));
    expect(omissions).toHaveLength(1);
  });

  it("reports only what actually differs", async () => {
    const payload = payloadOf<{ differences: string[] }>(
      await runCompareRecipes(fakeClient(), compareArgs({ dish: "crepes" })),
    );
    // Both stand-in recipes list six lines, so a line count is not a difference.
    expect(payload.differences.some((line) => /lists 6 ingredient lines/.test(line))).toBe(false);
  });
});

describe("the credit names the sites that actually contributed", () => {
  it("drops a site that answered nothing from the credit line", async () => {
    const text = textOf(
      await runSearchRecipes(
        fakeClient({ marmiton: { fail: new FakeSourceError("timeout", "too slow") } }),
        { query: "crepes", limit_per_source: 5, fan_out: true },
      ),
    );
    const credit = text.split("\n").at(-1)!;
    expect(credit).toContain("Wikibooks Cookbook");
    expect(credit).not.toContain("Marmiton");
  });
});

describe("a note that qualifies a degraded answer survives the budget", () => {
  /** Notes worth reading, none of which the answer misleads without. */
  const filler = Array.from(
    { length: 60 },
    (_, index) => `a detail worth knowing, number ${index}`,
  );

  it("keeps a failure note when the notes have to be cut", () => {
    const notes = [...filler, mustKeep("Marmiton did not answer (timeout): it took too long.")];
    const text = textOf(ok({}, "the answer", { notes }));
    expect(text).toContain("Marmiton did not answer");
    expect(text.length).toBeLessThanOrEqual(MAX_TEXT_CHARS + 200);
  });

  it("keeps a licence when the notes have to be cut", () => {
    const notes = [
      ...filler,
      mustKeep(
        "Published under Creative Commons Attribution-Share Alike 4.0: https://example.invalid/by-sa",
      ),
    ];
    expect(textOf(ok({}, "the answer", { notes }))).toContain("Creative Commons");
  });

  it("keeps every note the answer misleads without, however they are worded", () => {
    // What a note is for is what decides whether it can go, and a note saying so
    // for itself is what keeps the next rewording of a warning from becoming a
    // warning that can be dropped.
    const warnings = Array.from({ length: 40 }, (_, index) =>
      mustKeep(`the answer cannot be read safely without this, number ${index}`),
    );
    const text = textOf(ok({}, "the answer", { notes: [...filler, ...warnings] }));

    for (const warning of warnings) {
      expect(text).toContain(warning.text);
    }
    expect(text).not.toContain("a detail worth knowing");
  });
});

describe("get_recipe says what was not asked for, apart from what a site does not publish", () => {
  it("lists the sections it returned and the ones it left out", async () => {
    const payload = payloadOf<{
      recipe: { sections_returned: string[]; sections_omitted: string[] };
    }>(await runGetRecipe(fakeClient(), recipeArgs({ id: "marmiton:1001" })));

    expect(payload.recipe.sections_returned).toEqual(["ingredients"]);
    expect(payload.recipe.sections_omitted).toContain("times");
  });

  it("returns a time the source does publish, once the section is asked for", async () => {
    const payload = payloadOf<{ recipe: { total_minutes: number | null } }>(
      await runGetRecipe(
        fakeClient(),
        recipeArgs({ id: "cookbook:Cookbook:Crepes", sections: ["times"] }),
      ),
    );
    expect(payload.recipe.total_minutes).toBe(45);
  });
});

describe("an identifier that cannot be decoded", () => {
  it("is refused as bad input rather than reported as a network failure", () => {
    expect(() =>
      resolveId("https://en.wikibooks.org/wiki/Cookbook:100%_rye", fakeSources()),
    ).toThrow(/percent sign/i);
  });

  it("refuses a bare dish name rather than guessing a page from it", () => {
    expect(() => resolveId("Crêpes de la Chandeleur", fakeSources())).toThrow(/not an identifier/i);
  });
});

describe("a measure written with an optional plural mark", () => {
  it("is read as the measure it names", async () => {
    const { scaleIngredient } = await import("../../src/recipe/scale.js");
    const scaled = scaleIngredient("4 cuillère(s) à soupe de sucre", { factor: 3 });
    expect(scaled.unit).toBe("cuillère à soupe");
    expect(scaled.text).toBe("12 cuillères à soupe de sucre");
  });
});

describe("a step list is bounded", () => {
  it("returns at most the steps asked for, and says how many were left", async () => {
    const many = { ...marmitonRecipe, steps: Array.from({ length: 40 }, (_, i) => `Step ${i}.`) };
    const result = await runGetRecipe(fakeClient({ marmiton: { recipe: many } }), {
      id: "marmiton:1001",
      sections: ["steps"],
      max_steps: 5,
      max_step_chars: 600,
    });
    const payload = payloadOf<{ recipe: { steps: string[] } }>(result);
    expect(payload.recipe.steps).toHaveLength(5);
    expect(textOf(result)).toMatch(/runs to 40 steps and 5 are here/);
  });
});
