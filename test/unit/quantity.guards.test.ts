/**
 * The readings a line reaches only when it is written a particular way.
 *
 * Each case names a shape a recipe writes and the ordinary path never sees: an
 * amount split across two units, a bracket introduced by a partitive, a
 * measure that only qualifies a container, an article that stands for no
 * number. What is checked is the reading, and that a line the rule does not fit
 * comes back as the quantity it plainly is.
 */

import { describe, expect, it } from "vitest";
import { parseIngredient } from "../../src/recipe/quantity.js";
import { scaleIngredient } from "../../src/recipe/scale.js";

const read = (line: string) => parseIngredient(line, "auto");
const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("an amount a line split across two units", () => {
  it("reads a kilo and a remainder as one quantity", () => {
    expect(read("1 kg 500 de farine").amount).toBe(1.5);
    expect(read("1 kg et 500 g de farine").amount).toBe(1.5);
  });

  it("reads a remainder that names its own unit", () => {
    expect(read("1 l 50 cl d'eau").amount).toBe(1.5);
  });

  it("is not read where the second unit is not a step below the first", () => {
    expect(read("1 kg 500 ml de farine").amount).toBe(1);
  });

  it("is not read where the remainder is as large as the step", () => {
    expect(read("1 kg 1000 de farine").amount).toBe(1);
  });

  it("is not read where the first unit is not a mass or a volume", () => {
    // "1 cup 2 eggs" is a cup and then two eggs.
    expect(read("1 cup 2 eggs").amount).toBe(1);
  });

  it("is not read where the remainder is not a whole number", () => {
    expect(read("1 kg 500.5 de farine").amount).toBe(1);
  });

  it("is not read where something other than the partitive follows", () => {
    expect(read("1 kg 500 grosses fraises").amount).toBe(1);
  });

  it("is not read at the bottom of a ladder, where there is no step below", () => {
    expect(read("1 mg 500 de safran").amount).toBe(1);
  });
});

describe("a figure that gives the size of the thing counted", () => {
  it("is read where the noun stands before the partitive", () => {
    expect(scale("1 poulet de 1,5 kg", 2).text).toContain("1,5 kg");
  });

  it("is not read where a figure stands where the noun would", () => {
    expect(read("450 g de spaghetti").amount).toBe(450);
  });

  it("is not read where nothing follows the partitive", () => {
    expect(read("1 poulet de").amount).toBe(1);
  });

  it("is not read where what follows is not a mass or a volume", () => {
    expect(read("1 piment de Cayenne").amount).toBe(1);
  });

  it("is not read where the measure behind the partitive is a count", () => {
    expect(read("1 boîte de 4 oeufs").amount).toBe(1);
  });
});

describe("a bracket a partitive introduces", () => {
  it("is read as the equivalent it restates", () => {
    expect(scale("2 tasses de (250 ml) lait", 2).amount).toBeGreaterThan(0);
  });

  it("leaves a bracket holding no measure where the page put it", () => {
    expect(scale("2 tasses (bien pleines) de lait", 2).text).toContain("(bien pleines)");
  });

  it("leaves a bracket that closes nothing", () => {
    expect(scale("2 tasses (bien pleines de lait", 2).amount).toBe(4);
  });
});

describe("an article standing where a figure would", () => {
  it("counts as one where a measure follows it", () => {
    expect(read("une pincée de sel").amount).toBe(1);
    expect(read("a pinch of salt").amount).toBe(1);
    expect(read("una pizca de sal").amount).toBe(1);
  });

  it("counts as nothing where the line names a food instead", () => {
    expect(read("un oignon jaune").amount).toBeNull();
    expect(read("a ripe apple").amount).toBeNull();
  });

  it("counts as nothing where the line opens on no article at all", () => {
    expect(read("sel de Guérande").amount).toBeNull();
  });

  it("counts a multiplier as the number it stands for", () => {
    expect(read("2 dozen mushrooms").amount).toBe(24);
  });
});

describe("a measure a vocabulary carries under several spellings", () => {
  it("is read whole rather than in halves", () => {
    expect(read("1 fl oz of milk").unit?.canonical).toBe("fl oz");
  });

  it("is not read where the words merely open the same way", () => {
    // "flour" opens like "fl oz" and is a food.
    expect(read("200 g flour").unit?.canonical).toBe("g");
  });
});

describe("a written fraction", () => {
  it("is read only in the language that writes it that way", () => {
    expect(read("half a bottle of wine").amount).toBe(0.5);
    expect(read("media botella de vino").amount).toBe(0.5);
  });

  it("is not read where it points back at an amount stated elsewhere", () => {
    expect(read("half of the dough").amount).toBeNull();
  });

  it("is not read where the words name no share", () => {
    expect(read("media").amount).toBeNull();
    expect(read("halfway through").amount).toBeNull();
  });
});
