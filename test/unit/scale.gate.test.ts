/**
 * The two lists a bilingual scaler has to get right, line for line.
 *
 * They are the acceptance test for the whole scaling layer: a French list and
 * an English list saying the same thing, both taken from four people to
 * twenty-four, and every line landing on a quantity a kitchen can act on
 * without any of them being reported as approximate arithmetic.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient, scaleIngredients } from "../../src/recipe/scale.js";

const FACTOR = 6;

describe("the French list, multiplied by six", () => {
  const lines = [
    "une pincée de sel",
    "1 cuillère à café de sucre",
    "1 cuillère à soupe de beurre pommade",
    "1 dose (cup) de Mountain Dew",
    "6 oeufs",
    "1 kilo de farine",
    "2/3 d'un flacon de fleur d'oranger",
    "3 sucres vanillés (sachets)",
    "un bouchon de rhum",
    "1/4 litre de lait",
  ];

  const expected = [
    "6 pincées de sel",
    "6 cuillères à café de sucre",
    "6 cuillères à soupe de beurre pommade",
    "6 doses (cup) de Mountain Dew",
    "36 oeufs",
    "6 kg de farine",
    "4 flacons de fleur d'oranger",
    "18 sucres vanillés (sachets)",
    "6 bouchons de rhum",
    "1,5 l de lait",
  ];

  const scaled = scaleIngredients(lines, { factor: FACTOR });

  it("writes every line the way a French kitchen would", () => {
    expect(scaled.map((entry) => entry.text)).toEqual(expected);
  });

  it("reports every line as exact arithmetic", () => {
    expect(scaled.map((entry) => entry.scaling)).toEqual(lines.map(() => "scaled"));
  });

  it("keeps every line as published in `original`", () => {
    expect(scaled.map((entry) => entry.original)).toEqual(lines);
  });
});

describe("the English list, multiplied by six", () => {
  const lines = [
    "a pinch of salt",
    "1 teaspoon sugar",
    "1 tablespoon softened butter",
    "1 cup Mountain Dew",
    "6 eggs",
    "1 kg flour",
    "2/3 of a bottle of orange blossom water",
    "3 sachets vanilla sugar",
    "a capful of rum",
    "250 ml milk",
  ];

  const expected = [
    "6 pinches salt",
    "6 teaspoons sugar",
    "6 tablespoons softened butter",
    "6 cups Mountain Dew",
    "36 eggs",
    "6 kg flour",
    "4 bottles of orange blossom water",
    "18 sachets vanilla sugar",
    "6 capfuls rum",
    "1.5 l milk",
  ];

  const scaled = scaleIngredients(lines, { factor: FACTOR });

  it("writes every line the way an English kitchen would", () => {
    expect(scaled.map((entry) => entry.text)).toEqual(expected);
  });

  it("reports every line as exact arithmetic", () => {
    expect(scaled.map((entry) => entry.scaling)).toEqual(lines.map(() => "scaled"));
  });

  it("keeps every line as published in `original`", () => {
    expect(scaled.map((entry) => entry.original)).toEqual(lines);
  });
});

describe("quantities a kitchen cannot act on", () => {
  it("never asks for half an egg", () => {
    const scaled = scaleIngredient("3 eggs", { factor: 25 / 6 });
    expect(scaled.text).toBe("13 eggs");
    expect(scaled.amount).toBe(13);
  });

  it("scales both halves of a line that offers a choice", () => {
    const scaled = scaleIngredient("2 tablespoons butter OR 30 g margarine", { factor: 2 });
    expect(scaled.text).toBe("4 tablespoons butter OR 60 g margarine");
    expect(scaled.scaling).toBe("rounded");
  });

  it("moves a shrunken spoon down to the smaller spoon", () => {
    const scaled = scaleIngredient("4 tablespoons", { factor: 0.1 });
    expect(scaled.text).toBe("1.2 teaspoons");
    expect(scaled.unit).toBe("teaspoon");
  });

  it("halves a tin rather than rounding it to a whole one", () => {
    // What a tin holds is poured, so half of it is a quantity a kitchen takes.
    const scaled = scaleIngredient("1 can tomatoes", { factor: 0.4 });
    expect(scaled.text).toBe("1/2 can tomatoes");
    expect(scaled.scaling).toBe("rounded");
    expect(scaled.note).toMatch(/no longer holds its share/);
  });
});
