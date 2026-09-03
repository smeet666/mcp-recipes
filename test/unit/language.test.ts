/**
 * Reading the language off a line.
 *
 * The rule under test is the ordering of the evidence: a small structural word
 * outranks a measure, because an ingredient name and the measure beside it are
 * the parts of a line that travel between languages.
 */

import { describe, expect, it } from "vitest";
import { detectLanguage } from "../../src/recipe/quantity.js";
import { readListLanguage } from "../../src/recipe/language.js";

describe("structural words settle a line", () => {
  it("reads the partitive as French", () => {
    expect(detectLanguage("200 g de farine")).toBe("fr");
    expect(detectLanguage("1 kilo de sucre")).toBe("fr");
  });

  it("reads the preposition as English", () => {
    expect(detectLanguage("a pinch of salt")).toBe("en");
    expect(detectLanguage("2/3 of a bottle of orange blossom water")).toBe("en");
  });

  it("lets a French line name an English measure without changing language", () => {
    expect(detectLanguage("1 dose (cup) de Mountain Dew")).toBe("fr");
  });

  it("reads an accent as French", () => {
    expect(detectLanguage("3 sucres vanillés")).toBe("fr");
  });
});

describe("a measure settles a line that carries no small words", () => {
  it("reads an English measure as English", () => {
    expect(detectLanguage("1 cup Mountain Dew")).toBe("en");
    expect(detectLanguage("1 tablespoon softened butter")).toBe("en");
  });

  it("reads a French abbreviation as French, unaccented and all", () => {
    expect(detectLanguage("2 c a s")).toBe("fr");
    expect(detectLanguage("1 c a c de levure")).toBe("fr");
  });

  it("leaves a measure both vocabularies share to the rest of the line", () => {
    expect(detectLanguage("250 ml milk")).toBe("en");
    expect(detectLanguage("250 ml de lait")).toBe("fr");
  });
});

describe("a name settles a line that carries nothing else", () => {
  it("reads a French name as French", () => {
    expect(detectLanguage("6 oeufs")).toBe("fr");
  });

  it("reads an English name as English", () => {
    expect(detectLanguage("6 eggs")).toBe("en");
  });

  it("falls back to English when a line says nothing either way", () => {
    expect(detectLanguage("4 xyz")).toBe("en");
  });
});

describe("a whole list can be read at once", () => {
  it("takes the language the evidence points to across every line", () => {
    expect(readListLanguage(["200 g de farine", "4 oeufs", "sel"])).toBe("fr");
    expect(readListLanguage(["200 g flour", "4 eggs", "salt"])).toBe("en");
  });
});

describe("Spanish stands on its own beside the other two", () => {
  it("reads the words only Spanish writes", () => {
    expect(detectLanguage("200 g de harina de trigo")).toBe("es");
    expect(detectLanguage("1 cucharada de aceite de oliva")).toBe("es");
    expect(detectLanguage("2 dientes de ajo picados")).toBe("es");
  });

  it("reads a letter French never writes as Spanish", () => {
    expect(detectLanguage("100 g de azúcar")).toBe("es");
    expect(detectLanguage("1 limón")).toBe("es");
    expect(detectLanguage("1 pizca de canela molida")).toBe("es");
  });

  it("keeps a French line French where the two share their small words", () => {
    expect(detectLanguage("2 gousses d'ail")).toBe("fr");
    expect(detectLanguage("100 g de sucre")).toBe("fr");
    expect(detectLanguage("1 pincée de cannelle")).toBe("fr");
  });

  it("reads a Spanish measure as Spanish", () => {
    expect(detectLanguage("2 cucharaditas levadura")).toBe("es");
    expect(detectLanguage("1 taza arroz")).toBe("es");
  });

  it("reads a Spanish name on a line that carries nothing else", () => {
    expect(detectLanguage("6 huevos")).toBe("es");
    expect(detectLanguage("sal")).toBe("es");
  });

  it("leaves a measure every vocabulary shares to the rest of the line", () => {
    expect(detectLanguage("250 ml de leche")).toBe("es");
    expect(detectLanguage("250 ml de lait")).toBe("fr");
    expect(detectLanguage("250 ml milk")).toBe("en");
  });
});

describe("a whole list can be read at once, in three languages", () => {
  it("takes the language the evidence points to across every line", () => {
    expect(readListLanguage(["200 g de harina", "4 huevos", "1 pizca de sal"])).toBe("es");
  });
});
