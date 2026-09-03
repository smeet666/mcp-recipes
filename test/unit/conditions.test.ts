/**
 * What a question says the recipe must not hold.
 *
 * Read by the role the words play rather than by the turn of phrase they are
 * written in: a negation, a sentence about how a food affects the person, and
 * the name of a diet all put a food out of the dish. There is no phrasing whose
 * absence from a list is safe, so each shape below is a way a person writes it.
 */

import { describe, expect, it } from "vitest";
import { readConditions } from "../../src/sources/wordings.js";

const conditions = (question: string) => readConditions(question).conditions;

describe("a food a question puts out of the dish", () => {
  it("reads a negation standing in front of it", () => {
    expect(conditions("tarte sans beurre")).toEqual([{ named: "beurre", kind: "excluded" }]);
    expect(conditions("pie without butter")).toEqual([{ named: "butter", kind: "excluded" }]);
    expect(conditions("tarta sin mantequilla")).toEqual([
      { named: "mantequilla", kind: "excluded" },
    ]);
  });

  it("reads a negation a hyphen joined to the food", () => {
    expect(conditions("gâteau sans-gluten")).toEqual([{ named: "gluten", kind: "excluded" }]);
  });

  it("reads the marker English writes behind the food", () => {
    expect(conditions("gluten-free cake")).toEqual([{ named: "gluten", kind: "excluded" }]);
  });

  it("steps over the article a negation puts before the food", () => {
    expect(conditions("gâteau pas de beurre")).toEqual([{ named: "beurre", kind: "excluded" }]);
    expect(conditions("cake without any butter")).toEqual([{ named: "butter", kind: "excluded" }]);
  });

  it("carries the negation with no food where it scopes over nothing", () => {
    // The marker was read; what it excludes was not written, and the answer
    // says so rather than inventing a food or dropping the condition.
    expect(conditions("gâteau sans")).toEqual([{ named: null, kind: "excluded" }]);
  });

  it("says a food once however many times the question says it", () => {
    expect(conditions("tarte sans beurre et sans beurre")).toEqual([
      { named: "beurre", kind: "excluded" },
    ]);
  });
});

describe("a food a question names through the person", () => {
  it("reads an allergy as a food to keep out", () => {
    expect(conditions("dessert allergie aux fruits à coque")).toEqual([
      { named: "fruits", kind: "allergy" },
    ]);
  });

  it("reads the same in every language the questions arrive in", () => {
    expect(
      conditions("postre con alergia a los frutos secos").some((c) => c.kind === "allergy"),
    ).toBe(true);
    expect(conditions("dessert with a nut allergy").some((c) => c.kind === "allergy")).toBe(true);
  });
});

describe("a diet a question names in one word", () => {
  it("is carried as the diet it is", () => {
    expect(conditions("lasagne végétarienne").some((c) => c.kind === "diet")).toBe(true);
    expect(conditions("vegan lasagne").some((c) => c.kind === "diet")).toBe(true);
    expect(conditions("lasaña vegana").some((c) => c.kind === "diet")).toBe(true);
  });
});

describe("what is not a condition at all", () => {
  it("reads a bare number as no food", () => {
    expect(conditions("gâteau sans 4")).toEqual([{ named: null, kind: "excluded" }]);
  });

  it("reads a word too short to name a food as none", () => {
    expect(conditions("cake without a")).toEqual([{ named: null, kind: "excluded" }]);
  });

  it("stops at a word that ends the condition rather than swallowing the sentence", () => {
    // "sans beurre pour 6 personnes" says one thing about butter and another
    // about the table.
    const read = readConditions("gâteau sans beurre pour 6 personnes");

    expect(read.conditions).toEqual([{ named: "beurre", kind: "excluded" }]);
    expect(read.servings).toBe(6);
  });

  it("reads how many the dish has to serve, in each language", () => {
    expect(readConditions("gâteau pour 6 personnes").servings).toBe(6);
    expect(readConditions("cake for 6 people").servings).toBe(6);
  });

  it("reads no number where the question names none", () => {
    expect(readConditions("gâteau au chocolat").servings).toBeNull();
  });
});

describe("the word English writes both ways", () => {
  it("states a condition where a food stands beside it", () => {
    expect(conditions("cake free from butter")).toEqual([{ named: "butter", kind: "excluded" }]);
  });

  it("states none where it is a price or a way of keeping hens", () => {
    expect(conditions("free range eggs")).toEqual([]);
  });
});

describe("how far a condition reaches into the sentence", () => {
  it("names the food it read, and stops rather than swallowing what follows", () => {
    // One food is what a marker scopes over. Reading further would make a
    // condition out of the dish the question is about.
    expect(conditions("gâteau sans sucre glace")).toEqual([{ named: "sucre", kind: "excluded" }]);
    expect(conditions("cake without salt and pepper")).toEqual([
      { named: "salt", kind: "excluded" },
    ]);
  });

  it("stops before the joiner where nothing follows it", () => {
    expect(conditions("cake without salt and")).toEqual([{ named: "salt", kind: "excluded" }]);
  });

  it("stops before a word that names no food", () => {
    expect(conditions("gâteau sans beurre svp")).toEqual([{ named: "beurre", kind: "excluded" }]);
  });

  it("steps over the joiner an allergy puts before the food", () => {
    expect(conditions("dessert allergique aux arachides").some((c) => c.kind === "allergy")).toBe(
      true,
    );
  });

  it("reads the food standing before a marker English writes after it", () => {
    expect(conditions("a nut allergy dessert").some((c) => c.kind === "allergy")).toBe(true);
  });
});

describe("what a word has to be to name a food", () => {
  it("is not a unit of time or of weight", () => {
    expect(conditions("gâteau sans 30 minutes")).toEqual([{ named: null, kind: "excluded" }]);
  });

  it("is not a marker of another condition", () => {
    expect(conditions("gâteau sans sans")).toEqual([{ named: null, kind: "excluded" }]);
  });

  it("is not a word that frames the question", () => {
    expect(conditions("cake without please")).toEqual([{ named: null, kind: "excluded" }]);
  });
});
