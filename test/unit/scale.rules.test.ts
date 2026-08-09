/**
 * What scaling is allowed to do to a quantity, in both languages.
 *
 * Each case below is a rule a kitchen imposes rather than an arithmetic
 * preference, so the assertion names the rule rather than the number.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient, passthroughIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("countable things land where a kitchen can follow them", () => {
  it("keeps an egg whole in either direction", () => {
    expect(scale("3 eggs", 0.5).text).toBe("2 eggs");
    expect(scale("5 egg yolks", 0.5).text).toBe("3 egg yolks");
    expect(scale("3 oeufs", 0.5).text).toBe("2 oeufs");
  });

  it("halves a clove, which a knife can split", () => {
    expect(scale("1 clove garlic", 0.5).text).toBe("1/2 clove garlic");
    expect(scale("1 gousse d'ail", 0.5).text).toBe("1/2 gousse d'ail");
  });

  it("quarters an onion, which a knife divides further", () => {
    expect(scale("1 onion", 0.25).text).toBe("1/4 onion");
    expect(scale("1 oignon", 0.25).text).toBe("1/4 oignon");
  });

  it("halves a container, because half of what it holds is a quantity", () => {
    // What a sachet, a tin or a jar holds is poured or weighed, so half of one
    // is something a kitchen takes and the rest keeps.
    expect(scale("2 sachets de levure", 0.5).text).toBe("1 sachet de levure");
    expect(scale("1 packet yeast", 0.5).text).toBe("1/2 packet yeast");
    expect(scale("1 can tomatoes", 0.5).text).toBe("1/2 can tomatoes");
  });

  it("clamps to a half rather than to a whole when a container shrinks past it", () => {
    const shrunk = scale("1 packet yeast", 0.2);
    expect(shrunk.text).toBe("1/2 packet yeast");
    expect(shrunk.scaling).toBe("rounded");
  });

  it("says when a line no longer holds its share", () => {
    const scaled = scale("1 can tomatoes", 0.1);
    expect(scaled.note).toMatch(/no longer holds its share of the recipe/);
  });

  it("never asks for more than the recipe did when shrinking", () => {
    expect(scale("2 eggs", 0.5).amount).toBeLessThanOrEqual(2);
    expect(scale("1 sachet", 0.1).amount).toBeLessThanOrEqual(1);
  });
});

describe("a measurement moves to a smaller unit before it is rounded", () => {
  it("comes down the metric ladder rather than rounding to nothing", () => {
    expect(scale("1 kg de farine", 0.001).text).toBe("1 g de farine");
    expect(scale("1 kg flour", 0.001).text).toBe("1 g flour");
  });

  it("climbs the ladder when the amount grows past a whole unit", () => {
    expect(scale("250 ml milk", 6).text).toBe("1.5 l milk");
    expect(scale("250 g de beurre", 8).text).toBe("2 kg de beurre");
  });

  it("moves a shrunken spoon into the smaller spoon", () => {
    expect(scale("1 tablespoon oil", 0.1).unit).toBe("teaspoon");
    expect(scale("1 cuillère à soupe d'huile", 0.1).unit).toBe("cuillère à café");
  });

  it("leaves a spoon alone when a half of it is a spoon a kitchen owns", () => {
    expect(scale("1 tablespoon oil", 0.5).text).toBe("1/2 tablespoon oil");
  });

  it("reports a value that never moved as exact", () => {
    expect(scale("200 g de sucre", 10).text).toBe("2 kg de sucre");
    expect(scale("200 g de sucre", 10).scaling).toBe("scaled");
  });
});

describe("an approximate measure carries a count and keeps its size", () => {
  it("multiplies the count in either language", () => {
    expect(scale("a pinch of salt", 4).text).toBe("4 pinches salt");
    expect(scale("une pincée de sel", 4).text).toBe("4 pincées de sel");
  });

  it("says the size of one belongs to the cook", () => {
    expect(scale("a pinch of salt", 4).note).toMatch(/the size of one is the cook's/);
    expect(scale("une pincée de sel", 4).note).toMatch(/the size of one is the cook's/);
  });

  it("names no gram and no spoon in the quantity itself", () => {
    const scaled = scale("2 handfuls of rocket", 3);
    expect(scaled.text).toBe("6 handfuls rocket");
    expect(scaled.unit).toBe("handful");
  });

  it("reads a container nobody listed by the way the line is built", () => {
    expect(scale("un ramequin de crème", 3).text).toBe("3 ramequins de crème");
    expect(scale("a jarful of honey", 3).text).toBe("3 jarfuls honey");
  });

  it("lands the count on a whole one of them", () => {
    // There is no half of a hand: the size of one pinch is the cook's, so the
    // count is the whole of what the measure can say, and the line reports that
    // it moved.
    expect(scale("2 pinches of salt", 0.1)).toMatchObject({ amount: 1, scaling: "rounded" });
  });
});

describe("a line offering a choice has every branch scaled", () => {
  it("scales both sides in English", () => {
    const scaled = scale("2 tablespoons butter OR 30 g margarine", 3);
    expect(scaled.text).toBe("6 tablespoons butter OR 90 g margarine");
  });

  it("scales both sides in French", () => {
    const scaled = scale("2 cuillères à soupe de beurre ou 30 g de margarine", 3);
    expect(scaled.text).toBe("6 cuillères à soupe de beurre ou 90 g de margarine");
  });

  it("is never reported as exact, whatever the arithmetic did", () => {
    expect(scale("2 tablespoons butter OR 30 g margarine", 3).scaling).toBe("rounded");
  });

  it("leaves a branch it cannot restate as published, and says so", () => {
    const scaled = scale("1 Tbsp vanilla sugar OR 1 tsp vanilla extract", 0.5);
    expect(scaled.text).toContain("OR 1 tsp vanilla extract");
    expect(scaled.note).toMatch(/only the first was scaled/);
  });

  it("leaves a published range to the range parser", () => {
    const scaled = scale("2 or 3 cloves garlic", 2);
    expect(scaled.text).toBe("4 or 6 cloves garlic");
    expect(scaled.scaling).toBe("scaled");
  });
});

describe("a restated quantity moves with the one it restates", () => {
  it("scales what a bracket repeats", () => {
    const scaled = scale("450 g (1 pound) spaghetti", 2);
    expect(scaled.text).toBe("900 g (2 pounds) spaghetti");
  });

  it("scales what a slash repeats, and never calls the line exact", () => {
    const scaled = scale("500 g / 1.1 lb rolled oats", 2);
    expect(scaled.text).toBe("1 kg / 2.2 lb rolled oats");
    expect(scaled.scaling).toBe("rounded");
  });

  it("leaves a bracket holding prose alone", () => {
    const scaled = scale("2 apples (the riper the better)", 2);
    expect(scaled.text).toBe("4 apples (the riper the better)");
  });
});

describe("one quantity written across two measures", () => {
  it("reads both members of a compound measure as one amount", () => {
    const scaled = scale("1 lb 4 oz beef", 2);
    expect(scaled.text).toBe("2.5 lb beef");
    expect(scaled.amount).toBe(2.5);
    expect(scaled.scaling).toBe("scaled");
  });

  it("reads the smaller unit a French line leaves unwritten", () => {
    const scaled = scale("1 kg 500 de farine", 2);
    expect(scaled.text).toBe("3 kg de farine");
    expect(scaled.amount).toBe(3);
    expect(scaled.scaling).toBe("scaled");
  });
});

describe("a measure standing in front of a container", () => {
  it("reads a tin's capacity as the size of one rather than as the amount", () => {
    const scaled = scale("12 oz can tomatoes", 2);
    expect(scaled.text).toBe("12 oz can tomatoes");
    expect(scaled.scaling).toBe("unscaled");
    expect(scaled.note).toMatch(/size of one|how many/i);
  });
});

describe("a line is exact only when every quantity on it moved", () => {
  it("sees a quantity written with a partitive between the number and the measure", () => {
    // The second figure names an ingredient of its own rather than restating
    // the first, so it stays as the page wrote it and the line says so.
    const scaled = scale("150 g de sucre pour 3/4 de tasse de lait", 2);
    expect(scaled.scaling).not.toBe("scaled");
    expect(scaled.note).toMatch(/further quantity/i);
  });

  it("multiplies no count where the line named none", () => {
    // Three vague words, one answer: none of them puts a figure on the page.
    for (const line of [
      "quelques feuilles de basilic",
      "plusieurs feuilles de basilic",
      "a few basil leaves",
    ]) {
      const scaled = scale(line, 2);
      expect(scaled.scaling).toBe("unscaled");
      expect(scaled.text).toBe(line);
      expect(scaled.amount).toBeNull();
    }
  });

  it("leaves a rank where the page put it", () => {
    expect(scale("1er choix de boeuf", 2).text).toBe("1er choix de boeuf");
    expect(scale("1st choice beef", 2).text).toBe("1st choice beef");
  });
});

describe("a rewritten line reads the way the page wrote it", () => {
  it("keeps the case of a name whose plural is irregular", () => {
    expect(scale("1 TOMATO", 3).text).toBe("3 TOMATOES");
    expect(scale("3 LOAVES", 0.34).text).toBe("1 LOAF");
    // A capitalised name keeps its one capital rather than gaining more.
    expect(scale("1 Tomato", 3).text).toBe("3 Tomatoes");
  });

  it("gives a French noun in -ou the plural French gives it", () => {
    const french = (line: string, factor: number) =>
      scaleIngredient(line, { factor, language: "fr" }).text;
    expect(french("1 chou", 3)).toBe("3 choux");
    expect(french("3 choux", 0.34)).toBe("1 chou");
    // The ending decides nothing on its own: a clou takes the ordinary -s.
    expect(french("1 clou de girofle", 3)).toBe("3 clous de girofle");
  });
});

describe("ranges keep both ends", () => {
  it("scales both bounds together", () => {
    expect(scale("225–500 g guanciale", 2).text).toBe("450–1000 g guanciale");
    expect(scale("2 à 3 gousses d'ail", 2).text).toBe("4 à 6 gousses d'ail");
  });

  it("keeps the shape the recipe wrote", () => {
    expect(scale("2 to 3 cloves garlic", 2).text).toBe("4 to 6 cloves garlic");
  });
});

describe("a line with nothing to multiply is flagged rather than scaled", () => {
  it("says so in either language", () => {
    expect(scale("sel", 4).scaling).toBe("unscaled");
    expect(scale("Salt and freshly ground pepper", 4).scaling).toBe("unscaled");
    expect(scale("sel", 4).note).toMatch(/No quantity given/);
  });

  it("leaves the line exactly as it was given", () => {
    expect(scale("poivre du moulin", 4).text).toBe("poivre du moulin");
  });

  it("does not read an article naming a thing as a number", () => {
    expect(scale("un oignon rouge", 3).scaling).toBe("unscaled");
    expect(scale("a ripe avocado", 3).scaling).toBe("unscaled");
  });
});

describe("a factor of one changes nothing", () => {
  it("returns the line as published", () => {
    expect(scale("178 ml milk", 1).text).toBe("178 ml milk");
    expect(scale("178 ml milk", 1).scaling).toBe("scaled");
  });

  it("passes a list through with its readings intact", () => {
    const entry = passthroughIngredient("2 cuillères à soupe de sucre");
    expect(entry.text).toBe("2 cuillères à soupe de sucre");
    expect(entry.amount).toBe(2);
    expect(entry.unit).toBe("cuillère à soupe");
  });
});

describe("numbers and plurals are written the way each language writes them", () => {
  it("writes a French decimal with a comma and an English one with a dot", () => {
    expect(scale("1/4 litre de lait", 6).text).toBe("1,5 l de lait");
    expect(scale("250 ml milk", 6).text).toBe("1.5 l milk");
  });

  it("takes the French plural from two and the English one from above one", () => {
    // The same quantity, and only the measure differs: French keeps a measure
    // singular until two, English marks it plural as soon as it passes one.
    expect(scale("1 cuillère à soupe de sucre", 1.5).text).toBe("1 1/2 cuillère à soupe de sucre");
    expect(scale("1 cup sugar", 1.5).text).toBe("1 1/2 cups sugar");
  });

  it("puts a counted French noun back in the singular", () => {
    expect(scaleIngredient("4 brioches", { factor: 0.25, language: "fr" }).text).toBe("1 brioche");
  });

  it("reads a line carrying no signal at all as English, which is the default", () => {
    expect(scaleIngredient("4 brioches", { factor: 0.25 }).language).toBe("en");
  });

  it("leaves an invariable name alone", () => {
    expect(scale("2 ananas", 2).text).toBe("4 ananas");
    expect(scale("2 cups couscous", 2).text).toBe("4 cups couscous");
  });
});
