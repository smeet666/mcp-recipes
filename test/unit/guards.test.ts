/**
 * The guards each layer keeps against an answer it was not handed.
 *
 * Every one of these is a shape no site produces and every dependency is free
 * to produce, since the packages are resolved against ranges rather than pinned.
 * What is checked is that each guard holds, and that none of them turns a
 * missing value into a confident one.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { isEquipmentLine } from "../../src/recipe/equipment.js";
import { createServer } from "../../src/server.js";
import { RecipesClient } from "../../src/sources/client.js";
import { cookbookDetail } from "../../src/sources/cookbook.js";
import { runCompareRecipes } from "../../src/tools/compareRecipes.js";
import { buildCollectionView } from "../../src/tools/recipeView.js";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import { compareArgs, fakeReaders, searchArgs, textOf } from "./support.js";

describe("a line with nothing in it", () => {
  it("names no tool, because it names nothing", () => {
    expect(isEquipmentLine("")).toBe(false);
    expect(isEquipmentLine("   ")).toBe(false);
  });
});

describe("a configuration object a caller assembled", () => {
  it("takes a User-Agent that names the caller, and keeps the project's own on the end", () => {
    const named = new RecipesClient({
      config: { userAgent: "SomeApp/1.0" },
      readers: fakeReaders(),
    });
    const nameless = new RecipesClient({ config: { userAgent: "   " }, readers: fakeReaders() });

    expect(named.userAgent).toMatch(/^SomeApp\/1\.0 /);
    expect(named.userAgent).toMatch(/mcp-recipes/);
    expect(nameless.userAgent).toMatch(/^mcp-recipes/);
  });

  it("does not repeat the project's identity where the caller already carried it", () => {
    const already = loadConfig({}).userAgent;
    const client = new RecipesClient({ config: { userAgent: already }, readers: fakeReaders() });

    expect(client.userAgent).toBe(already);
  });

  it("takes a User-Agent that is not a string as none at all", () => {
    const client = new RecipesClient({
      config: { userAgent: 7 as unknown as string },
      readers: fakeReaders(),
    });

    expect(client.userAgent).toMatch(/^mcp-recipes/);
  });

  it("falls back to the default level where none was named", () => {
    const client = new RecipesClient({
      config: { logLevel: undefined as never },
      readers: fakeReaders(),
    });

    expect(client.profiles.length).toBeGreaterThan(0);
  });
});

describe("a caller who asked for the words they typed and nothing else", () => {
  it("holds every derived wording back and says why", async () => {
    const payload = (
      await runSearchRecipes(
        new RecipesClient({ readers: fakeReaders(), logger: createLogger("silent") }),
        { ...searchArgs({ query: "crepes de la chandeleur" }), fan_out: false },
      )
    ).structuredContent as {
      per_source: Array<{ wordings: Array<{ ran: boolean; not_run_because: string | null }> }>;
    };

    const held = payload.per_source.flatMap((one) =>
      one.wordings.filter((wording) => !wording.ran && wording.not_run_because !== null),
    );

    expect(held.length).toBeGreaterThan(0);
    expect(held[0]?.not_run_because).toMatch(/fan_out/);
  });

  it("holds the wordings behind a source that stopped answering", async () => {
    const payload = (
      await runSearchRecipes(
        new RecipesClient({
          readers: {
            ...fakeReaders(),
            marmiton: {
              search: () => Promise.reject(new Error("unreachable")),
              getRecipe: () => Promise.reject(new Error("unreachable")),
            },
          },
          logger: createLogger("silent"),
        }),
        searchArgs({ query: "crepes de la chandeleur" }),
      )
    ).structuredContent as {
      per_source: Array<{
        source: string;
        wordings: Array<{ ran: boolean; not_run_because: string | null }>;
      }>;
    };

    const marmiton = payload.per_source.find((one) => one.source === "marmiton");

    expect(
      marmiton?.wordings.some((wording) =>
        /did not answer the wording before/.test(wording.not_run_because ?? ""),
      ),
    ).toBe(true);
  });
});

describe("a Cookbook page whose title is nothing but its namespace", () => {
  it("keeps the title the page carried rather than answering with an empty name", () => {
    const detail = cookbookDetail({
      key: "Cookbook:",
      title: "Cookbook:",
      sourceUrl: "https://example.test/x",
    });

    expect(detail.title).toBe("Cookbook:");
  });

  it("carries a licence only where the page states both its name and its terms", () => {
    const withTerms = cookbookDetail({
      key: "Cookbook:X",
      title: "Cookbook:X",
      sourceUrl: "https://example.test/x",
      license: { title: "CC BY-SA 4.0", url: "https://creativecommons.org/x" },
    });
    const halfStated = cookbookDetail({
      key: "Cookbook:X",
      title: "Cookbook:X",
      sourceUrl: "https://example.test/x",
      license: { title: "CC BY-SA 4.0" },
    });

    expect(withTerms.license?.title).toBe("CC BY-SA 4.0");
    expect(halfStated.license).toBeNull();
  });
});

describe("an article view a caller asked nothing of", () => {
  it("answers with the counts and no rows where the recipe gathers nothing", () => {
    const view = buildCollectionView(
      {
        id: "x:1",
        source: "x",
        sourceName: "X",
        language: "en",
        title: "An article",
        url: "https://example.test/x",
        imageUrl: null,
        yieldCount: null,
        yieldMax: null,
        yieldText: null,
        yieldUnit: null,
        ingredients: [],
        steps: [],
        publishedSections: null,
        prepMinutes: null,
        cookMinutes: null,
        totalMinutes: null,
        restMinutes: null,
        stepsAsOneBlock: null,
        withheld: null,
        gathers: null,
        category: null,
        author: null,
        rating: null,
        nutrition: null,
        equipment: [],
        tips: [],
        license: null,
        attribution: "Source: X",
      },
      30,
    );

    expect(view.recipes).toEqual([]);
    expect(view.headings).toEqual([]);
    expect(view.gathered_count).toBe(0);
  });
});

describe("a tool call that fails before it can answer", () => {
  it("comes back in the error vocabulary rather than as a broken answer", async () => {
    const failing = {
      searchRecipes: () => Promise.reject(new Error("the whole call failed")),
      getRecipe: () => Promise.reject(new Error("the whole call failed")),
      profiles: [],
    } as unknown as RecipesClient;

    const searched = await runSearchRecipes(failing, searchArgs({ query: "crepes" }));
    const compared = await runCompareRecipes(failing, compareArgs({ dish: "crepes" }));

    expect(searched.isError).toBe(true);
    expect(textOf(searched)).toMatch(/^\[network_error\]/);
    expect(compared.isError).toBe(true);
    expect(textOf(compared)).toMatch(/^\[network_error\]/);
  });
});

describe("the server a host starts with nothing configured", () => {
  it("builds its own settings, its own logger and its own client", async () => {
    const server = createServer();
    const client = new Client({ name: "guards", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      "search_recipes",
      "get_recipe",
      "scale_ingredients",
      "compare_recipes",
    ]);

    await client.close();
  });
});
