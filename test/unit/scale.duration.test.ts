/**
 * A length of time standing in an ingredient list.
 *
 * Lists carry lines such as a rest, a proof or a marinade beside the flour and
 * the eggs. A factor says how much of the dish to make, and a dough does not
 * rise three times as long because three times as many people are eating it.
 */

import { describe, expect, it } from "vitest";
import { passthroughIngredient, scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a length of time is not a quantity of the dish", () => {
  it("leaves a rest as published, in either language", () => {
    expect(scale("2 h de repos", 3).text).toBe("2 h de repos");
    expect(scale("30 minutes de cuisson", 3).text).toBe("30 minutes de cuisson");
    expect(scale("1 hour resting", 3).text).toBe("1 hour resting");
    expect(scale("45 minutes marinating", 0.5).text).toBe("45 minutes marinating");
  });

  it("flags such a line rather than reporting arithmetic on it", () => {
    const rest = scale("2 h de repos", 3);
    expect(rest.scaling).toBe("unscaled");
    expect(rest.amount).toBeNull();
    expect(rest.note).toMatch(/time/i);
  });

  it("says the same thing when no scaling was asked for", () => {
    const rest = passthroughIngredient("2 h de repos");
    expect(rest.scaling).toBe("unscaled");
    expect(rest.note).toMatch(/time/i);
  });

  it("still multiplies the ingredients standing beside it", () => {
    expect(scale("200 g de farine", 3).text).toBe("600 g de farine");
    expect(scale("2 h de repos", 3).original).toBe("2 h de repos");
  });
});
