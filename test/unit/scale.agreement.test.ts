/**
 * Agreeing a name with the number in front of it.
 *
 * A rewritten line is read by a person, so "2 oeuf" and "1 gousses" read as
 * broken text whatever the arithmetic did. Each rule below is a shape one of
 * the three languages writes, and the edges are where a name already carries
 * its plural, or carries none at all.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("English", () => {
  it("writes the plural a name carries of its own", () => {
    expect(scale("1 leaf of basil", 2).text).toContain("leaves");
  });

  it("writes the plural a sibilant ending takes", () => {
    expect(scale("1 dish of olives", 2).text).toBe("2 dishes of olives");
  });

  it("agrees what is counted rather than what it is made of", () => {
    // "2 cloves garlic" counts cloves; the garlic is what they are.
    expect(scale("1 clove of garlic", 2).text).toBe("2 cloves garlic");
  });

  it("leaves a name that is the same in both numbers", () => {
    expect(scale("1 fish", 3).text).toBe("3 fish");
  });

  it("takes an irregular plural back to its own singular", () => {
    expect(scale("2 leaves of basil", 0.5).text).toBe("1 leaf basil");
  });

  it("leaves a name whose -s belongs to the singular", () => {
    expect(scale("2 tbsp of molasses", 0.5).text).toContain("molasses");
  });

  it("leaves a name too short to carry a mark", () => {
    expect(scale("1 g", 2).text).toBe("2 g");
  });
});

describe("French", () => {
  it("leaves a noun already ending in a sibilant", () => {
    expect(scale("1 jus de citron", 3).text).toContain("3 jus");
  });

  it("writes the -x that a few nouns in -ou take", () => {
    expect(scale("1 chou de Bruxelles", 2).text).toContain("2 choux");
    expect(scale("2 choux de Bruxelles", 0.5).text).toContain("1 chou");
  });

  it("agrees an adjective standing after the noun", () => {
    expect(scale("1 oignon rouge", 2).text).toBe("2 oignons rouges");
    expect(scale("2 oignons rouges", 0.5).text).toBe("1 oignon rouge");
  });

  it("leaves a word the list of declinable adjectives does not carry", () => {
    expect(scale("1 oignon grelot", 2).text).toBe("2 oignons grelot");
  });

  it("elides the partitive before a vowel, and before a silent h", () => {
    expect(scale("1 cuillère à soupe d'huile", 2).text).toContain("d'huile");
    expect(scale("1 cuillère à soupe de beurre", 2).text).toContain("de beurre");
  });
});

describe("Spanish", () => {
  it("leaves a name whose number already matches the figure", () => {
    expect(scale("2 huevos grandes", 1.5).text).toContain("huevos grandes");
  });

  it("stops agreeing at the partitive, since what follows names the food", () => {
    expect(scale("1 diente de ajo picado", 2).text).toBe("2 dientes de ajo picado");
  });

  it("stops agreeing at a word that is not letters", () => {
    expect(scale("1 huevo 1/2 batido", 2).text).toBe("2 huevos 1/2 batido");
  });

  it("leaves a head too short to carry a mark", () => {
    expect(scale("2 g de sal", 2).text).toBe("4 g de sal");
  });
});

describe("a countable that cannot be shared out", () => {
  it("lands on a whole one rather than on none of it", () => {
    expect(scale("1 oeuf", 0.1).amount).toBe(1);
  });

  it("never asks for more than the recipe started with, going down", () => {
    expect(scale("3 oeufs", 0.9).amount).toBeLessThanOrEqual(3);
  });

  it("stays at nothing where the page wrote nothing", () => {
    expect(scale("0 oeuf", 2).amount).toBe(0);
    expect(scale("0 cuillère à soupe de sucre", 2).amount).toBe(0);
  });
});
