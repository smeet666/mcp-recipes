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
import { runGetRecipe } from "../../src/tools/getRecipe.js";
import { fakeClient, payloadOf, recipeArgs } from "./support.js";

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

/**
 * The lines a recipe site actually writes among its ingredients.
 *
 * A site that lists what a dish is cooked with writes these, and every one of
 * them multiplied is an answer nobody can catch: the arithmetic is right and
 * the sentence is absurd. The corpus stands apart from the cases above so that
 * a change to the vocabulary is measured against all of it at once.
 */
const NAMES_A_TOOL = [
  "1 paellera de 40 cm",
  "1 rodillo",
  "1 cuchillo afilado",
  "1 rejilla",
  "1 tabla de cortar",
  "1 cuchara de madera",
  "1 robot de cocina",
  "1 termómetro de cocina",
  "1 tamiz",
  "1 manga pastelera",
  "1 plancha eléctrica",
  "1 pincel de silicona",
  "1 vaso medidor",
  "Brocha de silicona",
  "Thermomix",
  "Palillos",
  "Freidora de aire",
  "2 moldes de 20 cm",
  "1 sartén antiadherente",
  "papel de hornear",
  "film transparente",
  "1 boquilla rizada",
  "1 exprimidor",
  "1 pelador",
  "1 escurridor",
  "1 cuenco grande",
  "1 moule à tarte",
  "1 baking tin",
];

const NAMES_A_FOOD = [
  "200 g de harina",
  "6 huevos",
  "1 cebolla",
  "2 dientes de ajo",
  "100 g de papel de arroz",
  "2 latas de atún",
  "200 g de queso de cabra",
  "1 pizca de sal",
  "2 cucharadas de aceite",
  "1 vaso de vino blanco",
  "2 cazos de caldo",
  "1 plato de sopa",
  "6 moules",
  "1 tin tomatoes",
];

describe("the lines a site writes among its ingredients", () => {
  it("recognises every one that names a tool", () => {
    expect(NAMES_A_TOOL.filter((line) => !scale(line, 2).isEquipment)).toEqual([]);
  });

  it("leaves every one that names food to be scaled", () => {
    expect(NAMES_A_FOOD.filter((line) => scale(line, 2).isEquipment)).toEqual([]);
  });
});

describe("a French line an existing recipe already carries", () => {
  it("scales a food whose preparation shares a word with a tool", () => {
    // "râpé" is how the cheese arrives, and a râpe is what grated it. The line
    // is about the cheese.
    const carrots = scale("2 carottes râpées", 2);

    expect(carrots.isEquipment).toBe(false);
    expect(carrots.text).toBe("4 carottes râpées");
    expect(scale("Gruyère râpé", 2).isEquipment).toBe(false);
    expect(scale("100 g de chocolat râpé", 2).isEquipment).toBe(false);
  });

  it("reads a container of something as an amount of that something", () => {
    // "une casserole de lait" measures milk by the pan, and "1 cuchillo" is the
    // knife itself. What follows the partitive decides.
    expect(scale("1 casserole de lait", 2).isEquipment).toBe(false);
    expect(scale("Cazuela de mariscos", 2).isEquipment).toBe(false);
    expect(scale("2 brochetas de pollo", 2).isEquipment).toBe(false);
  });
});

describe("the counts a recipe reports about its own lines", () => {
  it("add up to the lines in the list", async () => {
    const payload = payloadOf<{
      recipe: {
        ingredients: unknown[];
        scaling_summary: {
          scaled_count: number;
          rounded_count: number;
          unscaled_count: number;
          equipment_count: number;
        };
      };
    }>(
      await runGetRecipe(
        fakeClient(),
        recipeArgs({ id: "pequerecetas:crepes-caseras", servings: 8 }),
      ),
    );
    const counts = payload.recipe.scaling_summary;

    expect(counts.equipment_count).toBeGreaterThan(0);
    expect(
      counts.scaled_count + counts.rounded_count + counts.unscaled_count + counts.equipment_count,
    ).toBe(payload.recipe.ingredients.length);
  });
});
