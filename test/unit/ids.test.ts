/**
 * Routing an identifier to the source that can answer for it.
 *
 * Getting this wrong is expensive in a way that is hard to see: asking the
 * wrong source produces an absence, and an absence reads as "there is no such
 * recipe" rather than as "the question went to the wrong place".
 */

import { describe, expect, it } from "vitest";
import { RecipesError } from "../../src/errors.js";
import { namespacedId } from "../../src/sources/adapter.js";
import { resolveId } from "../../src/sources/ids.js";
import { fakeSources } from "./support.js";

const sources = fakeSources();
const read = (id: string) => resolveId(id, sources);

describe("an identifier this server minted", () => {
  it("names its source and routes on what it says", () => {
    expect(namespacedId("marmiton", "44078")).toBe("marmiton:44078");
    const resolved = read("marmiton:44078");
    expect(resolved.source.id).toBe("marmiton");
    expect(resolved.reference).toBe("44078");
    expect(resolved.inferred).toBeNull();
  });

  it("keeps a page key whole, namespace and all", () => {
    const resolved = read("cookbook:Cookbook:Spaghetti alla Carbonara");
    expect(resolved.source.id).toBe("cookbook");
    expect(resolved.reference).toBe("Cookbook:Spaghetti alla Carbonara");
  });

  it("is read whatever case it arrives in", () => {
    expect(read("Marmiton:44078").source.id).toBe("marmiton");
  });

  it("refuses a prefix with nothing after it", () => {
    expect(() => read("marmiton:")).toThrow(RecipesError);
  });
});

describe("a raw identifier is claimed by the source that mints its shape", () => {
  it("reads a path shape as the one source that mints it", () => {
    const resolved = read("recettes/dessert/crepes-de-la-chandeleur-fid-20001");
    expect(resolved.source.id).toBe("ptitchef");
    expect(resolved.inferred).toMatch(/Ptitchef/);
  });

  it("reads an address as the source whose site it is", () => {
    const resolved = read("https://www.bbcgoodfood.com/recipes/classic-crepes");
    expect(resolved.source.id).toBe("goodfood");
    expect(resolved.reference).toBe("recipes/classic-crepes");
  });

  it("reads a namespaced page name as the source whose pages carry that namespace", () => {
    // "Cookbook:" opens a page key on the wiki and is also the prefix this
    // server puts on one of that source's ids. The two readings name the same
    // page, because a bare title is resolved into that same namespace, so the
    // overlap costs nothing and needs no choice.
    const resolved = read("Cookbook:Carbonara");
    expect(resolved.source.id).toBe("cookbook");
    expect(resolved.reference).toBe("Carbonara");
  });

  it("claims a namespaced page name for a source that mints one", () => {
    const claim = sources.find((source) => source.id === "cookbook")!.claims("Cookbook:Carbonara");
    expect(claim?.why).toMatch(/namespace/);
    expect(claim?.guess).toBe(false);
  });

  it("reads an address by the site it points at", () => {
    expect(read("https://www.marmiton.org/recettes/recette_r_44078.aspx").source.id).toBe(
      "marmiton",
    );
    expect(read("https://en.wikibooks.org/wiki/Cookbook:Crepes").reference).toBe("Cookbook:Crepes");
  });

  it("puts an escaped address back the way the wiki names the page", () => {
    expect(read("https://en.wikibooks.org/wiki/Cookbook:Cr%C3%AApes").reference).toBe(
      "Cookbook:Crêpes",
    );
  });
});

describe("what no source claims is refused rather than guessed", () => {
  it("refuses an empty identifier", () => {
    expect(() => read("   ")).toThrow(/identifier is required/);
  });

  it("refuses a bare dish name, which is a search rather than an identifier", () => {
    // Sending it anywhere returns whatever the guess happens to hit, and the
    // answer would read as this dish rather than as the wrong page.
    expect(() => read("Crêpes de la Chandeleur")).toThrow(/not an identifier/);
  });

  it("refuses an address on a site no source reads", () => {
    expect(() => read("https://example.com/recipe/1")).toThrow(/not an identifier/);
  });

  it("refuses an address whose escaping cannot be read", () => {
    expect(() => read("https://en.wikibooks.org/wiki/Cookbook:100%_rye")).toThrow(/percent sign/);
  });

  it("reports every refusal as bad input rather than as an absence", () => {
    for (const bad of ["", "Crêpes", "https://example.com/x"]) {
      try {
        read(bad);
        throw new Error(`"${bad}" should not have resolved`);
      } catch (error) {
        expect(error).toBeInstanceOf(RecipesError);
        expect((error as RecipesError).code).toBe("invalid_input");
      }
    }
  });
});

describe("a shape more than one source could claim", () => {
  // Two of the sources address a recipe by a bare number, so a caller writing
  // one has named no single recipe. Sending it to whichever source came first
  // would answer confidently with another dish, which is the one failure
  // routing exists to prevent.
  it("is refused as ambiguous rather than sent to whichever came first", () => {
    expect(() => read("44078")).toThrow(/could be an identifier on/);
  });

  it("names every spelling that would resolve", () => {
    try {
      read("44078");
      throw new Error("a bare number should not have resolved");
    } catch (error) {
      const hint = (error as RecipesError).details.hint ?? "";
      expect(hint).toContain("marmiton:44078");
      expect(hint).toContain("supertoinette:44078");
    }
  });

  it("resolves that same number once a caller spells out which source", () => {
    expect(read("supertoinette:44078").source.id).toBe("supertoinette");
    expect(read("marmiton:44078").source.id).toBe("marmiton");
  });
});

describe("the hyphenated slug one source mints", () => {
  it("routes to that source, and says the reading was inferred", () => {
    const read_ = read("tortilla-de-patatas");

    expect(read_.source.id).toBe("pequerecetas");
    // Another site could address a recipe the same way, so the answer says the
    // reading was arrived at rather than certain.
    expect(read_.inferred).not.toBeNull();
  });

  it("does not take a single word, which too many sources would accept", () => {
    expect(() => read("tortilla")).toThrow();
  });

  it("takes the slug out of the address the site publishes", () => {
    expect(read("https://www.pequerecetas.com/receta/paella-de-marisco/").source.id).toBe(
      "pequerecetas",
    );
  });
});
