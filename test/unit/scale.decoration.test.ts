/**
 * Lines a page opens with something that is not part of the quantity.
 *
 * A bullet, a dash or a picture of the food stands in front of the amount on
 * plenty of pages. It says nothing about how much, so a reader that stops at it
 * hands back the line untouched, and a doubled recipe quietly keeps the
 * published amount of whatever the mark was in front of.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a mark standing in front of the amount is not the amount", () => {
  it("scales a line opening on a picture of the food", () => {
    const scaled = scale("🧀 200 g de fromage", 2);
    expect(scaled).toMatchObject({ amount: 400, unit: "g", scaling: "scaled" });
    expect(scaled.text).toBe("🧀 400 g de fromage");
  });

  it("scales a line opening on a bullet", () => {
    expect(scale("• 200 g de fromage", 2).text).toBe("• 400 g de fromage");
    expect(scale("- 200 g de fromage", 2).text).toBe("- 400 g de fromage");
    expect(scale("* 2 eggs", 2).text).toBe("* 4 eggs");
  });

  it("reads the language off the words rather than off the mark", () => {
    // Without the mark this line reads as French, because "tasse" is a measure
    // only one of the two vocabularies carries.
    expect(scale("🍚 2 tasses", 2).language).toBe("fr");
  });

  it("keeps reading the sign that says an amount is loose", () => {
    const scaled = scale("~1 cup water", 2);
    expect(scaled.text).toBe("~2 cups water");
    expect(scaled.note).toMatch(/approximation/);
  });
});
