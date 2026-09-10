/**
 * What a number in an answer lets a caller do with it.
 *
 * A factor a caller reads is a factor a caller multiplies by, and a reference a
 * caller spells out is one this server hands to a site. Both are checked
 * against what the answer says about them: the arithmetic has to land where the
 * quantities landed, and a reference has to be one the source it names would
 * mint.
 */

import { describe, expect, it } from "vitest";
import { runScaleIngredients } from "../../src/tools/scaleIngredients.js";
import { payloadOf } from "./support.js";

describe("the factor an answer states", () => {
  it("is the one the quantities were multiplied by", () => {
    const payload = payloadOf(
      runScaleIngredients({ ingredients: ["300 g de farine"], factor: 7 / 3, language: "auto" }),
    ) as { factor: number; ingredients: Array<{ amount: number | null }> };

    const line = payload.ingredients[0];
    expect(line?.amount, "the line was multiplied").not.toBeNull();
    expect(
      payload.factor * 300,
      "a caller recomputing a quantity from the stated factor lands on the stated amount",
    ).toBeCloseTo(line?.amount ?? 0, 6);
  });
});
