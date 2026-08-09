/**
 * Lines carrying more than one figure.
 *
 * A recipe writes a quantity twice as readily as once: a mass with the cup that
 * holds it, a count of tins with what one tin holds, two spoons added together.
 * Every figure on such a line belongs to the same ingredient, so a factor that
 * moves one and leaves another hands the cook two answers for one quantity.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("an equivalent stated beside the amount is scaled with it", () => {
  it("scales a bracket the line puts after what it measures", () => {
    // The bracket restates the 150 g, so leaving it as published makes the line
    // claim that 300 g is three quarters of a cup.
    const scaled = scale("150 g de sucre (soit 3/4 de tasse)", 2);
    expect(scaled.text).toBe("300 g de sucre (soit 1 1/2 tasse)");
    expect(scaled.note ?? "").not.toMatch(/as published/);
  });

  it("scales a bracket introduced by the partitive", () => {
    expect(scale("150 g (3/4 de tasse) de sucre", 2).text).toBe("300 g (1 1/2 tasse) de sucre");
  });

  it("scales a bracket closing an English line", () => {
    expect(scale("1 cup milk (240 ml)", 2).text).toBe("2 cups milk (480 ml)");
  });

  it("scales the bracket a French line closes on", () => {
    const scaled = scale("1 demi verre de lait (10 cl)", 3);
    expect(scaled.text).toContain("(30 cl)");
  });
});

describe("a capacity in brackets counts containers rather than measuring one out", () => {
  it("opens a second tin of the size the line named", () => {
    // Doubling this recipe means two tins of fourteen ounces, and a tin of
    // 1.75 lb is a tin no shop sells.
    const scaled = scale("1 (14 oz) can tomatoes", 2);
    expect(scaled.text).toBe("2 (14 oz) cans tomatoes");
    expect(scaled.note ?? "").toMatch(/one container holds/);
  });

  it("leaves the capacity alone whichever way the count was written", () => {
    expect(scale("2 (14 oz) cans tomatoes", 2).text).toBe("4 (14 oz) cans tomatoes");
  });
});

describe("a measure written in abbreviations keeps what stands behind it", () => {
  it("keeps the ingredient a dotted abbreviation is followed by", () => {
    expect(scale("2 c.à.s d'huile", 2).text).toBe("4 cuillères à soupe d'huile");
  });

  it("reads two spoons added together as one quantity", () => {
    // Two tablespoons and a teaspoon is 2⅓ tablespoons, and doubling it asks
    // for 4⅔, which the spoon rounding takes to the nearest half spoon.
    const scaled = scale("2 c.à.s + 1 c.à.c d'huile", 2);
    expect(scaled.text).toBe("4 1/2 cuillères à soupe d'huile");
    expect(scaled.scaling).toBe("rounded");
  });

  it("reads the same sum written in full", () => {
    expect(scale("2 cuillères à soupe + 1 cuillère à café d'huile", 2).text).toBe(
      "4 1/2 cuillères à soupe d'huile",
    );
  });
});

describe("a mass keeps the precision the arithmetic gave it", () => {
  it("states the exact product rather than a multiple of five", () => {
    const scaled = scale("1234 g de farine", 2);
    expect(scaled.text).toBe("2468 g de farine");
    expect(scaled.scaling).toBe("scaled");
  });

  it("stays in the unit the page wrote when a bigger one cannot hold the figure", () => {
    expect(scale("1234 g", 1.5)).toMatchObject({ amount: 1851, unit: "g" });
  });

  it("moves up the ladder where the bigger unit states the figure exactly", () => {
    expect(scale("250 g de beurre", 8)).toMatchObject({ amount: 2, unit: "kg" });
  });

  it("reports an amount that had to move as moved", () => {
    const scaled = scale("1666 g de farine", 1.001);
    expect(scaled.scaling).toBe("rounded");
    expect(scaled.note).toMatch(/Rounded/);
  });

  it("gives one answer for one quantity, however the page spelled it", () => {
    // "1234 g" and "1 kg 234" are the same mass, so they scale to the same
    // mass and to the same statement about how exact that mass is.
    const plain = scale("1234 g de farine", 2);
    const compound = scale("1 kg 234 de farine", 2);
    expect(compound.text).toBe(plain.text);
    expect(compound.scaling).toBe(plain.scaling);
    expect(compound).toMatchObject({ amount: 2468, unit: "g", scaling: "scaled" });
  });
});
