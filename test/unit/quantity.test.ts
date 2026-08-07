/**
 * Reading an amount off a line of prose.
 *
 * Everything downstream depends on this, so the parser returns nothing rather
 * than guessing: a number invented here is multiplied and shown as a quantity
 * the page never wrote.
 */

import { describe, expect, it } from "vitest";
import {
  formatAmount,
  parseIngredient,
  parseLeadingQuantity,
  parseLeadingRange,
} from "../../src/recipe/quantity.js";

describe("leading amounts", () => {
  it("reads a whole number, a decimal and a fraction", () => {
    expect(parseLeadingQuantity("3 eggs", "en")?.amount).toBe(3);
    expect(parseLeadingQuantity("1.5 cups", "en")?.amount).toBe(1.5);
    expect(parseLeadingQuantity("1/2 cup", "en")?.amount).toBe(0.5);
  });

  it("reads a French decimal comma, and leaves an English comma alone", () => {
    expect(parseLeadingQuantity("1,5 l de lait", "fr")?.amount).toBe(1.5);
    expect(parseLeadingQuantity("1,5 l milk", "en")?.amount).toBe(1);
  });

  it("reads a mixed number in both the written and the glyph form", () => {
    expect(parseLeadingQuantity("1 1/2 cups", "en")?.amount).toBe(1.5);
    expect(parseLeadingQuantity("3 ¼ cups", "en")?.amount).toBe(3.25);
  });

  it("reads a fraction an English line spells out", () => {
    expect(parseLeadingQuantity("half a bottle", "en")?.amount).toBe(0.5);
    expect(parseLeadingQuantity("two thirds of a cup", "en")?.amount).toBeCloseTo(2 / 3, 10);
  });

  it("refuses a share of something named elsewhere", () => {
    // "half of the dough" points back at an amount another line stated.
    expect(parseLeadingQuantity("half of the dough", "en")).toBeNull();
  });

  it("refuses a denominator of zero rather than reading the numerator alone", () => {
    expect(parseLeadingQuantity("1/0 cup", "en")).toBeNull();
  });

  it("returns nothing for a line that opens on a name", () => {
    expect(parseLeadingQuantity("sel", "fr")).toBeNull();
    expect(parseLeadingQuantity("Salt", "en")).toBeNull();
  });
});

describe("ranges", () => {
  it("reads the separators each language writes", () => {
    expect(parseLeadingRange("2 à 3 gousses", "fr")?.max).toBe(3);
    expect(parseLeadingRange("2 to 3 cloves", "en")?.max).toBe(3);
    expect(parseLeadingRange("225–500 g", "en")?.max).toBe(500);
  });

  it("refuses a descending pair, which is two amounts rather than a range", () => {
    expect(parseLeadingRange("3-2 eggs", "en")).toBeNull();
  });

  it("does not read the start of a word as a separator", () => {
    // "5 tomatoes" must not be read as "5 to" followed by "matoes".
    expect(parseLeadingRange("5 tomatoes", "en")).toBeNull();
  });

  it("leaves a fraction to the fraction reader", () => {
    expect(parseLeadingRange("1/2 cup", "en")).toBeNull();
  });
});

describe("splitting a line into amount, measure and item", () => {
  it("takes the longest spelling of a measure", () => {
    expect(parseIngredient("1 cuillère à soupe de sucre").unit?.canonical).toBe("cuillère à soupe");
    expect(parseIngredient("1 fluid ounce milk").unit?.canonical).toBe("fluid ounce");
  });

  it("drops the preposition and the article between a measure and what it measures", () => {
    expect(parseIngredient("200 g de farine").item).toBe("farine");
    expect(parseIngredient("2 heads of garlic").item).toBe("garlic");
    expect(parseIngredient("2/3 d'un flacon de fleur d'oranger").item).toBe(
      "flacon de fleur d'oranger",
    );
  });

  it("reads an article as one only where a measure follows it", () => {
    expect(parseIngredient("une pincée de sel").amount).toBe(1);
    expect(parseIngredient("un oignon rouge").amount).toBeNull();
    expect(parseIngredient("a pinch of salt").amount).toBe(1);
    expect(parseIngredient("a ripe avocado").amount).toBeNull();
  });

  it("reads 'quelques' as the handful it names, and says which word it came from", () => {
    const parsed = parseIngredient("quelques pincées de sel");
    expect(parsed.amount).toBe(3);
    expect(parsed.articleWord).toBe("quelques");
  });

  it("takes a bracket that is purely a measure, and leaves prose alone", () => {
    expect(parseIngredient("450 g (1 pound) spaghetti").alternates).toHaveLength(1);
    expect(parseIngredient("2 apples (the riper the better)").alternates).toHaveLength(0);
    expect(parseIngredient("1 dose (cup) de Mountain Dew").alternates).toHaveLength(0);
  });

  it("reads a bracketed measure stated in the other language's terms", () => {
    // A French page glosses grams in ounces; the gloss is still a measure.
    expect(parseIngredient("200 g (7 oz) de farine").alternates[0]?.unit?.canonical).toBe("oz");
  });

  it("takes equivalents a line states after a slash", () => {
    const parsed = parseIngredient("500 g / 1.1 lb rolled oats");
    expect(parsed.alternateStyle).toBe("slash");
    expect(parsed.item).toBe("rolled oats");
  });

  it("leaves a line with no amount whole in the item", () => {
    expect(parseIngredient("Salt and freshly ground pepper").item).toBe(
      "Salt and freshly ground pepper",
    );
  });
});

describe("writing an amount back out", () => {
  it("writes a whole number as itself", () => {
    expect(formatAmount(6, "fr")).toBe("6");
    expect(formatAmount(6, "en")).toBe("6");
  });

  it("uses each language's decimal mark", () => {
    expect(formatAmount(1.5, "fr", { fractions: false })).toBe("1,5");
    expect(formatAmount(1.5, "en", { fractions: false })).toBe("1.5");
  });

  it("writes a kitchen fraction where a kitchen would", () => {
    expect(formatAmount(0.5, "en")).toBe("1/2");
    expect(formatAmount(0.25, "fr")).toBe("1/4");
  });

  it("returns nothing for a value that is not a number", () => {
    expect(formatAmount(Number.NaN, "en")).toBe("");
    expect(formatAmount(Number.POSITIVE_INFINITY, "fr")).toBe("");
  });
});
