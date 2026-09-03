/**
 * How a scaled line is written back.
 *
 * The arithmetic is settled elsewhere; what is checked here is the sentence the
 * caller reads. A quantity restated in brackets, a range that collapses onto one
 * figure, an amount below what a scale resolves, a branch that carries its own
 * note: each says something the bare number does not.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient, scaleIngredients } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a range", () => {
  it("keeps both ends where they stay apart", () => {
    const doubled = scale("2 à 3 cuillères à soupe de sucre", 2);

    expect(doubled.amount).toBe(4);
    expect(doubled.amountMax).toBe(6);
  });

  it("states one figure where both ends land on it, and says why", () => {
    const shrunk = scale("2 à 3 oeufs", 0.4);

    expect(shrunk.amountMax).toBeNull();
    expect(shrunk.note).toMatch(/same|one/i);
  });
});

describe("an equivalent the page stated beside the amount", () => {
  it("is restated where the page wrote it, in brackets", () => {
    expect(scale("450 g (1 livre) de spaghetti", 2).text).toMatch(/\(/);
  });

  it("is restated after the amount where the page used a slash", () => {
    const doubled = scale("200 g / 7 oz flour", 2);

    expect(doubled.text).toContain("400 g");
    expect(doubled.text).toMatch(/\//);
  });

  it("says the equivalent moved where it did", () => {
    expect(scale("1 tasse (240 ml) de lait", 1 / 3).scaling).toBe("rounded");
  });
});

describe("an amount smaller than a kitchen scale resolves", () => {
  it("is given back with the warning that it cannot be weighed", () => {
    const tiny = scale("1 mg de safran", 0.02);

    expect(tiny.note).toMatch(/kitchen scale/i);
  });
});

describe("a line whose branches carry their own notes", () => {
  it("keeps both the branch note and whatever the first branch said", () => {
    const shrunk = scale("1 oeuf ou 50 g de tofu", 0.5);

    expect(shrunk.note).toMatch(/branch|choice|both/i);
  });
});

describe("scaling a whole list at once", () => {
  it("reads each line on its own and keeps the order the list was written in", () => {
    const scaled = scaleIngredients(["200 g de farine", "Pour la pâte", "4 oeufs"], { factor: 2 });

    expect(scaled.map((line) => line.text)).toEqual(["400 g de farine", "Pour la pâte", "8 oeufs"]);
  });

  it("answers an empty list with an empty list", () => {
    expect(scaleIngredients([], { factor: 2 })).toEqual([]);
  });
});

describe("Spanish agreement at its edges", () => {
  it("leaves a line with no item to agree", () => {
    expect(scale("2 cucharadas", 2).text).toBe("4 cucharadas");
  });

  it("leaves a head that is not letters", () => {
    expect(scale("2 huevos 500 g", 2).text).toContain("huevos");
  });

  it("leaves an adjective whose number already matches", () => {
    expect(scale("2 huevos batidos", 1.5).text).toContain("batidos");
  });
});
