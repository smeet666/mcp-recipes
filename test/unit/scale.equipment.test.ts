/**
 * A line naming a tool rather than something eaten.
 *
 * Some sites write what a recipe is cooked with inside the list they write the
 * ingredients in, so a mould, a tin or an air fryer arrives in the same list as
 * the chicken. Multiplying such a line orders six air fryers for six people,
 * which is the one wrong answer a scaler can give that a reader has no way to
 * catch: the arithmetic is right and the sentence is absurd.
 *
 * The line is therefore recognised and left as published, with the reason said
 * out loud. A recipe made for twice as many people uses the same pan.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a tool is never multiplied", () => {
  it("leaves an appliance as published, whatever the factor", () => {
    const fryer = scale("Freidora de aire", 6);

    expect(fryer.text).toBe("Freidora de aire");
    expect(fryer.scaling).toBe("unscaled");
    expect(fryer.isEquipment).toBe(true);
  });

  it("leaves a tool alone even when the line counts it", () => {
    // A count on a tool is how many of it the recipe needs at once, which the
    // number of eaters does not change.
    const tins = scale("2 moldes de 20 cm", 3);

    expect(tins.text).toBe("2 moldes de 20 cm");
    expect(tins.scaling).toBe("unscaled");
    expect(tins.isEquipment).toBe(true);
  });

  it("says why the line was left alone", () => {
    expect(scale("1 sartén antiadherente", 4).note).toContain("tool");
  });

  it("recognises a tool in each language the scaler reads", () => {
    expect(scale("1 moule à tarte", 4).isEquipment).toBe(true);
    expect(scale("1 baking tin", 4).isEquipment).toBe(true);
    expect(scale("1 cazuela de barro", 4).isEquipment).toBe(true);
  });
});

describe("food that shares a word with a tool is still food", () => {
  it("scales a paper a recipe eats and holds a paper it bakes on", () => {
    expect(scale("100 g de papel de arroz", 2).isEquipment).toBe(false);
    expect(scale("papel de hornear", 2).isEquipment).toBe(true);
  });

  it("scales what a tool is named after when the line names the food", () => {
    // "1 plato de sopa" is a bowl of soup, and "1 plato hondo" is the bowl.
    expect(scale("200 g de queso de cabra", 2).isEquipment).toBe(false);
    expect(scale("2 latas de atún", 2).isEquipment).toBe(false);
  });
});

describe("an ordinary line carries the mark as false", () => {
  it("says an ingredient is not a tool rather than saying nothing", () => {
    const flour = scale("200 g de harina", 2);

    expect(flour.isEquipment).toBe(false);
    expect(flour.scaling).toBe("scaled");
  });
});

describe("a tool named in the plural is still a tool", () => {
  it("reads the plural mark Spanish writes after a consonant", () => {
    expect(scale("2 coladores", 3).isEquipment).toBe(true);
  });

  it("reads the plural mark the three languages share", () => {
    expect(scale("2 sartenes", 3).isEquipment).toBe(true);
    expect(scale("3 ramekins", 2).isEquipment).toBe(true);
  });
});

describe("an ambiguous noun with nothing beside it stays food", () => {
  it("leaves a tin of tomatoes to be counted", () => {
    const tins = scale("1 tin tomatoes", 4);

    expect(tins.isEquipment).toBe(false);
    expect(tins.scaling).toBe("scaled");
    expect(tins.amount).toBe(4);
  });

  it("counts the mussels a recipe buys rather than the tin it bakes in", () => {
    expect(scale("6 moules", 2).isEquipment).toBe(false);
    expect(scale("1 moule à manqué", 2).isEquipment).toBe(true);
  });

  it("reads a tool word further along the line as part of the food", () => {
    // The noun the line is about is the one it opens with.
    expect(scale("200 g de queso rallado", 2).isEquipment).toBe(false);
  });
});
