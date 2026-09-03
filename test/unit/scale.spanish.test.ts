/**
 * Scaling a Spanish line.
 *
 * The rules are the ones every language already holds: a countable thing lands
 * where a kitchen can follow it, a measurement moves to a smaller unit before
 * it is rounded, and an approximate measure keeps whatever size a hand gives
 * it. What is tested here is that a Spanish line reaches them, since a line
 * read as English would go through the wrong vocabulary and come back as an
 * exact count of something the page never named.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient, scaleIngredients } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a Spanish measurement scales exactly", () => {
  it("multiplies a mass and keeps the symbol", () => {
    const doubled = scale("200 g de harina", 2);

    expect(doubled.text).toBe("400 g de harina");
    expect(doubled.scaling).toBe("scaled");
    expect(doubled.amount).toBe(400);
    expect(doubled.unit).toBe("g");
    expect(doubled.language).toBe("es");
  });

  it("writes a fractional amount with the comma Spanish writes", () => {
    expect(scale("1 kg de patatas", 0.5).text).toBe("500 g de patatas");
    expect(scale("250 ml de leche", 1.5).text).toBe("375 ml de leche");
  });

  it("moves a spoonful into the smaller spoon before rounding it", () => {
    const third = scale("1 cucharada de aceite de oliva", 1 / 3);

    expect(third.text).toBe("1 cucharadita de aceite de oliva");
    expect(third.unit).toBe("cucharadita");
  });

  it("agrees the measure with the number", () => {
    expect(scale("1 cucharada de azúcar", 3).text).toBe("3 cucharadas de azúcar");
    expect(scale("2 tazas de arroz", 0.5).text).toBe("1 taza de arroz");
    expect(scale("1 unidad de mantequilla", 4).text).toBe("4 unidades de mantequilla");
  });
});

describe("a Spanish countable lands where a kitchen can follow it", () => {
  it("keeps an egg whole in either direction", () => {
    expect(scale("3 huevos", 0.5).text).toBe("2 huevos");
    expect(scale("1 huevo", 2).text).toBe("2 huevos");
  });

  it("halves a clove of garlic, which a knife splits", () => {
    expect(scale("1 diente de ajo", 0.5).text).toBe("1/2 diente de ajo");
  });

  it("quarters an onion, which a knife divides further", () => {
    expect(scale("1 cebolla", 0.25).text).toBe("1/4 cebolla");
  });

  it("halves a sealed packet rather than cutting it finer", () => {
    const shrunk = scale("1 sobre de levadura", 0.2);

    expect(shrunk.text).toBe("1/2 sobre de levadura");
    expect(shrunk.scaling).toBe("rounded");
  });

  it("quarters a tin, which is poured and kept", () => {
    expect(scale("1 bote de tomate triturado", 0.25).text).toBe("1/4 bote de tomate triturado");
  });
});

describe("an approximate Spanish measure keeps its own size", () => {
  it("multiplies the count and leaves the size to the cook", () => {
    const more = scale("1 pizca de sal", 4);

    expect(more.text).toBe("4 pizcas de sal");
    expect(more.note).toContain("pizca");
  });

  it("lands a fraction of one on a whole one rather than on none", () => {
    const less = scale("1 puñado de perejil", 0.25);

    expect(less.text).toBe("1 puñado de perejil");
    expect(less.scaling).toBe("rounded");
  });

  it("reads a container Spanish names with the partitive", () => {
    expect(scale("1 chorrito de vinagre", 3).text).toBe("3 chorritos de vinagre");
  });
});

describe("what a Spanish line carries nothing to multiply", () => {
  it("leaves a line with no quantity alone and says so", () => {
    const salted = scale("sal y pimienta al gusto", 6);

    expect(salted.text).toBe("sal y pimienta al gusto");
    expect(salted.scaling).toBe("unscaled");
  });

  it("leaves a length of time alone, which the factor says nothing about", () => {
    expect(scale("30 minutos de reposo", 2).text).toBe("30 minutos de reposo");
  });
});

describe("a list can hold all three languages at once", () => {
  it("reads and rewrites each line in its own", () => {
    const scaled = scaleIngredients(
      ["200 g de harina", "200 g de farine", "200 g flour", "2 huevos", "2 oeufs", "2 eggs"],
      { factor: 2 },
    );

    expect(scaled.map((line) => line.language)).toEqual(["es", "fr", "en", "es", "fr", "en"]);
    expect(scaled.map((line) => line.text)).toEqual([
      "400 g de harina",
      "400 g de farine",
      "400 g flour",
      "4 huevos",
      "4 oeufs",
      "4 eggs",
    ]);
  });

  it("reads every line in one language when a caller names it", () => {
    const scaled = scaleIngredients(["2 tazas de arroz"], { factor: 2, language: "es" });

    expect(scaled[0]?.text).toBe("4 tazas de arroz");
  });
});

describe("the number Spanish writes on a rewritten line", () => {
  it("takes the plural after a consonant and the plain -s after a vowel", () => {
    expect(scale("1 unidad de nata", 3).text).toBe("3 unidades de nata");
    expect(scale("1 loncha de jamón", 4).text).toBe("4 lonchas de jamón");
  });

  it("leaves a noun that already carries its -s alone", () => {
    // "análisis" is the same word in both numbers, so no mark is added or taken.
    expect(scale("1 dosis de vainilla", 2).text).toBe("2 dosis de vainilla");
  });

  it("agrees an adjective standing between the amount and the measure", () => {
    expect(scale("1 cucharada colmada de azúcar", 2).text).toBe("2 cucharadas colmadas de azúcar");
  });
});

describe("Spanish measures the vocabulary never listed", () => {
  it("reads a container named between the article and the partitive", () => {
    // "un vasito de aceite" measures by whatever that glass holds, and the
    // proportion lives in how many the recipe asks for.
    const doubled = scale("un vasito de aceite", 2);

    expect(doubled.text).toBe("2 vasitos de aceite");
    expect(doubled.note).toMatch(/approximate/i);
  });
});

describe("a line that offers a choice scales both halves", () => {
  it("splits at the word Spanish offers it with", () => {
    const doubled = scale("100 g de nata o 100 g de leche", 2);

    expect(doubled.text).toContain("200 g de nata");
    expect(doubled.text).toContain("200 g de leche");
  });
});

describe("a share Spanish writes in words", () => {
  it("reads half of a countable thing and multiplies it", () => {
    expect(scale("medio limón", 2).text).toBe("1 limón");
    expect(scale("media cebolla", 4).text).toBe("2 cebollas");
  });

  it("reads half of a measurement", () => {
    expect(scale("medio litro de leche", 2).text).toBe("1 l de leche");
    expect(scale("media cucharadita de sal", 2).text).toBe("1 cucharadita de sal");
  });

  it("reads a quarter and three quarters", () => {
    expect(scale("un cuarto de cebolla", 4).text).toBe("1 cebolla");
    expect(scale("tres cuartos de taza de arroz", 4).text).toBe("3 tazas de arroz");
  });

  it("leaves the word where it does not name a share", () => {
    // "media luna" is a croissant, and "medio" there is part of the name.
    expect(scale("2 medialunas", 2).text).toBe("4 medialunas");
  });
});

describe("agreement reaches a word written with an accent", () => {
  it("agrees an adjective the plain alphabet does not spell", () => {
    expect(scale("1 tortilla española", 2).text).toBe("2 tortillas españolas");
    expect(scale("1 cebolla pequeña", 2).text).toBe("2 cebollas pequeñas");
  });

  it("writes the plural Spanish gives a word ending in z", () => {
    expect(scale("1 nuez moscada molida", 3).text).toBe("3 nueces moscadas molidas");
  });

  it("writes the plural Spanish gives a word ending in a consonant", () => {
    expect(scale("1 flan de huevo", 2).text).toBe("2 flanes de huevo");
  });
});
