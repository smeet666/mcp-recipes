/**
 * The edges of rewriting a scaled line.
 *
 * A line that offers a choice, a noun whose plural the ending decides, a
 * quantity that lands on nothing: each of these is a shape a recipe writes and
 * the ordinary path does not reach. What is checked is that the rewrite reads
 * the way the page did.
 */

import { describe, expect, it } from "vitest";
import { passthroughIngredient, scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a line offering a choice", () => {
  it("scales both branches, since a cook follows one and ignores the other", () => {
    const doubled = scale("100 g de beurre ou 100 g de margarine", 2);

    expect(doubled.text).toContain("200 g de beurre");
    expect(doubled.text).toContain("200 g de margarine");
  });

  it("says the two are the page's claim rather than arithmetic", () => {
    expect(scale("100 g butter or 100 g margarine", 2).scaling).toBe("rounded");
  });

  it("hands back the whole line where the first branch carries no quantity", () => {
    const doubled = scale("beurre ou margarine", 2);

    expect(doubled.text).toBe("beurre ou margarine");
    expect(doubled.scaling).toBe("unscaled");
  });

  it("leaves a branch word that opens no second quantity alone", () => {
    // "sel ou poivre" offers two things and no amount of either.
    expect(scale("2 cebollas o chalotas", 2).text).toMatch(/^4 cebollas/);
  });
});

describe("the plural English writes", () => {
  it("turns a final f into ves", () => {
    expect(scale("1 loaf", 2).text).toBe("2 loaves");
    expect(scale("1 knife", 3).text).toBe("3 knives");
  });

  it("leaves a noun ending in a double s alone in the singular", () => {
    expect(scale("2 glasses of water", 0.5).text).toBe("1 glass of water");
  });

  it("turns a consonant and y into ies", () => {
    expect(scale("1 cherry", 4).text).toBe("4 cherries");
  });

  it("leaves a word too short to carry a plural mark", () => {
    expect(scale("2 oz", 2).text).toBe("4 oz");
  });
});

describe("the plural French writes", () => {
  it("leaves a noun already ending in a sibilant", () => {
    expect(scale("1 ananas", 3).text).toBe("3 ananas");
  });

  it("turns a noun in -al into -aux, and back", () => {
    expect(scale("1 cheval de bois", 2).text).toContain("2 chevaux");
    expect(scale("2 chevaux de bois", 0.5).text).toContain("1 cheval");
  });

  it("turns a noun in -eau into -eaux, and back", () => {
    expect(scale("1 poireau du jardin", 2).text).toContain("2 poireaux");
    expect(scale("2 poireaux du jardin", 0.5).text).toContain("1 poireau");
  });

  it("leaves a head word too short to carry a mark", () => {
    expect(scale("2 ail", 2).text).toContain("ail");
  });
});

describe("an adjective the page put in front of its measure", () => {
  it("takes the number the measure takes", () => {
    expect(scale("1 grosse pincée de sel", 2).text).toBe("2 grosses pincées de sel");
    expect(scale("2 grosses pincées de sel", 0.5).text).toBe("1 grosse pincée de sel");
  });

  it("stays as the recipe wrote it where it does not decline", () => {
    expect(scale("1 heaped tablespoon of sugar", 2).text).toContain("heaped");
  });
});

describe("a quantity that lands on nothing", () => {
  it("is clamped up rather than shrunk to none of the ingredient", () => {
    const tiny = scale("1 pincée de sel", 0.1);

    expect(tiny.scaling).toBe("rounded");
    expect(tiny.amount).toBe(1);
  });

  it("stays at nothing where the page wrote nothing", () => {
    expect(scale("0 g de sel", 2).amount).toBe(0);
  });
});

describe("a list handed back without being scaled", () => {
  it("reads each line and says what it found, without multiplying anything", () => {
    const line = passthroughIngredient("200 g de farine");

    expect(line.text).toBe("200 g de farine");
    expect(line.scaling).toBe("scaled");
    expect(line.amount).toBe(200);
  });

  it("says a line carries no quantity", () => {
    expect(passthroughIngredient("Sel").note).toMatch(/No quantity/);
  });

  it("says a line states a length of time", () => {
    expect(passthroughIngredient("30 minutes de repos").scaling).toBe("unscaled");
  });

  it("says an approximate measure is one", () => {
    expect(passthroughIngredient("1 pincée de sel").note).toMatch(/approximate/i);
  });

  it("recognises a tool the same way the scaler does", () => {
    expect(passthroughIngredient("Freidora de aire").isEquipment).toBe(true);
  });

  it("reads every line in one language where a caller names one", () => {
    expect(passthroughIngredient("200 g de farine", "en").language).toBe("en");
  });
});

describe("a factor that changes nothing", () => {
  it("hands the line back rather than rewriting it", () => {
    // Rewriting would round "178 ml" to "180 ml" and report a difference the
    // caller never asked for.
    expect(scale("178 ml de lait", 1).text).toBe("178 ml de lait");
  });
});
