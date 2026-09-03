/**
 * The measure vocabulary, and the number rules each language writes it in.
 *
 * These are read through the scaler everywhere else, which exercises the
 * spellings a recipe actually uses. What is checked here is the shape of each
 * rule at its edges, where a word is already plural in the singular, sits at
 * the bottom of a ladder, or names a container the vocabulary never listed.
 */

import { describe, expect, it } from "vitest";
import {
  approximateEquivalent,
  chooseReadableUnit,
  demoteUnit,
  lookupUnit,
  normalizeUnitKey,
  readContainerLoad,
  readPartitiveMeasure,
  spanishPlural,
  spanishSingular,
  unitDivisibility,
  unitKeys,
} from "../../src/recipe/units.js";

const unit = (key: string, language: "fr" | "en" | "es") => {
  const found = lookupUnit(key, language);
  if (!found) {
    throw new Error(`no ${language} unit called ${key}`);
  }
  return found;
};

describe("a measure named by the container it is poured from", () => {
  it("is read from the noun standing between the amount and the partitive", () => {
    expect(readPartitiveMeasure("ramequin de crème", "fr")?.unit.canonical).toBe("ramequin");
    expect(readPartitiveMeasure("vasito de aceite", "es")?.unit.canonical).toBe("vasito");
  });

  it("is not read where no partitive follows", () => {
    expect(readPartitiveMeasure("beurre pommade", "fr")).toBeNull();
  });

  it("is not read from a word too short to name a container", () => {
    expect(readPartitiveMeasure("un de sucre", "fr")).toBeNull();
  });

  it("is not read from a word that names a part of the recipe", () => {
    // "reste de sauce" and "mélange de farine" name what is left and what was
    // mixed, and neither measures anything.
    expect(readPartitiveMeasure("reste de sauce", "fr")).toBeNull();
    expect(readPartitiveMeasure("melange de farine", "fr")).toBeNull();
  });

  it("is not read from a word the vocabulary already carries", () => {
    expect(readPartitiveMeasure("verre de sucre", "fr")).toBeNull();
    expect(readPartitiveMeasure("cucharada de azucar", "es")).toBeNull();
  });

  it("gives the container the plural its own language writes", () => {
    expect(readPartitiveMeasure("bocal de cornichons", "fr")?.unit.plural).toBe("bocaux");
    expect(readPartitiveMeasure("cazuela de arroz", "es")?.unit.plural).toBe("cazuelas");
  });
});

describe("a measure named after what holds it", () => {
  it("reads the -ful suffix as the measure it is", () => {
    expect(readContainerLoad("jarful")?.canonical).toBe("jarful");
    expect(readContainerLoad("jarfuls")?.canonical).toBe("jarful");
  });

  it("keeps a word that merely ends in those letters out of the kitchen", () => {
    expect(readContainerLoad("awful")).toBeNull();
    expect(readContainerLoad("butter")).toBeNull();
  });
});

describe("the singular and the plural French writes", () => {
  it("undoes the plural of a noun in -eau and -al", () => {
    expect(readPartitiveMeasure("morceaux de pain", "fr")?.unit.canonical).toBe("morceau");
    expect(readPartitiveMeasure("bocaux de miel", "fr")?.unit.canonical).toBe("bocal");
  });

  it("leaves a noun carrying its -s in the singular", () => {
    expect(readPartitiveMeasure("jus de citron", "fr")?.unit.canonical).toBe("jus");
  });

  it("writes the plural those endings take", () => {
    expect(readPartitiveMeasure("morceau de pain", "fr")?.unit.plural).toBe("morceaux");
    expect(readPartitiveMeasure("bocal de miel", "fr")?.unit.plural).toBe("bocaux");
    expect(readPartitiveMeasure("jus de citron", "fr")?.unit.plural).toBe("jus");
  });
});

describe("the singular and the plural Spanish writes", () => {
  it("adds -s after a vowel and -es after a consonant", () => {
    expect(spanishPlural("taza")).toBe("tazas");
    expect(spanishPlural("flan")).toBe("flanes");
  });

  it("turns a final z into ces", () => {
    expect(spanishPlural("nuez")).toBe("nueces");
  });

  it("leaves a noun already carrying its -s in the singular", () => {
    expect(spanishPlural("analisis")).toBe("analisis");
    expect(spanishSingular("analisis")).toBe("analisis");
    expect(spanishPlural("virus")).toBe("virus");
  });

  it("undoes both plural marks", () => {
    expect(spanishSingular("tazas")).toBe("taza");
    expect(spanishSingular("flanes")).toBe("flan");
  });

  it("leaves a word too short to have taken a mark", () => {
    expect(spanishSingular("es")).toBe("es");
    expect(spanishSingular("pan")).toBe("pan");
  });
});

describe("how far one of a measure divides", () => {
  it("stops a gesture at the whole one, since there is no half of a hand", () => {
    expect(unitDivisibility(unit("pizca", "es"))).toBe("whole");
    expect(unitDivisibility(unit("pincee", "fr"))).toBe("whole");
  });

  it("quarters what a knife or the size of the thing takes further", () => {
    expect(unitDivisibility(unit("bote", "es"))).toBe("quarter");
    expect(unitDivisibility(unit("pot", "fr"))).toBe("quarter");
  });

  it("halves anything else, which is what a doubtful measure gets", () => {
    expect(unitDivisibility(unit("sobre", "es"))).toBe("half");
    expect(unitDivisibility(unit("sachet", "fr"))).toBe("half");
  });
});

describe("the ladder a measured amount climbs and comes back down", () => {
  it("has a step below each measure that carries one", () => {
    expect(demoteUnit(unit("kg", "en"))?.unit.canonical).toBe("g");
    expect(demoteUnit(unit("cucharada", "es"))?.unit.canonical).toBe("cucharadita");
    expect(demoteUnit(unit("taza", "es"))?.unit.canonical).toBe("cucharada");
  });

  it("has none at the bottom, where there is nothing smaller to say it in", () => {
    expect(demoteUnit(unit("mg", "en"))).toBeNull();
    expect(demoteUnit(unit("pizca", "es"))).toBeNull();
  });

  it("leaves an amount alone where the unit is not a measured one", () => {
    expect(chooseReadableUnit(unit("pizca", "es"), 0.1).ratio).toBe(1);
    expect(chooseReadableUnit(unit("g", "en"), Number.NaN).ratio).toBe(1);
    expect(chooseReadableUnit(unit("g", "en"), 0).ratio).toBe(1);
  });

  it("walks down until the figure is one a kitchen reads", () => {
    expect(chooseReadableUnit(unit("kg", "en"), 0.002).unit.canonical).toBe("g");
  });

  it("stops at the bottom of the ladder rather than inventing a step", () => {
    expect(chooseReadableUnit(unit("mg", "en"), 0.0001).unit.canonical).toBe("mg");
  });
});

describe("what a kitchen usually takes an approximate measure to be", () => {
  it("offers the settled ones as words", () => {
    expect(approximateEquivalent(unit("pizca", "es"))).toMatch(/teaspoon/);
    expect(approximateEquivalent(unit("pincee", "fr"))).toMatch(/teaspoon/);
  });

  it("offers nothing where there is no settled one", () => {
    expect(approximateEquivalent(unit("chorro", "es"))).toMatch(/tablespoon/);
    expect(approximateEquivalent(unit("larme", "fr"))).toBeNull();
  });
});

describe("the spelling a lookup survives", () => {
  it("folds accents, abbreviation dots and the bracketed plural mark", () => {
    expect(normalizeUnitKey("c. à s.")).toBe("c a s");
    expect(normalizeUnitKey("cuillère(s)")).toBe("cuillere");
    expect(normalizeUnitKey("  Tbsp.  ")).toBe("tbsp");
  });

  it("offers the longest spelling first, so a measure is not read in halves", () => {
    const keys = unitKeys("fr");

    expect(keys.indexOf("cuillere a soupe")).toBeLessThan(keys.indexOf("tasse"));
  });

  it("knows nothing of a word no vocabulary carries", () => {
    expect(lookupUnit("bloop", "es")).toBeNull();
  });
});
