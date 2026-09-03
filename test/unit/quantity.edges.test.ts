/**
 * The edges of reading a quantity off a line.
 *
 * Every case here is a line a site actually publishes, in a shape the ordinary
 * path does not reach: an entity where a glyph belongs, a bracket that restates
 * the amount, a second figure that gives a container's size, a fraction written
 * with a glyph. What is checked is that each reads as the quantity it is, or as
 * no quantity at all, and never as a different one.
 */

import { describe, expect, it } from "vitest";
import { formatAmount, parseIngredient, parseLeadingRange } from "../../src/recipe/quantity.js";
import { scaleIngredient } from "../../src/recipe/scale.js";

const read = (line: string) => parseIngredient(line, "auto");
const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a fraction a page wrote as an entity or a glyph", () => {
  it("reads a numeric entity as the character it names", () => {
    expect(read("&#8532; cup sugar").amount).toBeCloseTo(2 / 3);
    expect(read("&#x2154; cup sugar").amount).toBeCloseTo(2 / 3);
  });

  it("leaves an entity naming no character as the page wrote it", () => {
    expect(read("&#3; cup sugar").amount).toBeNull();
    expect(read("&#99999999999; cup sugar").amount).toBeNull();
    expect(read("&nosuchentity; cup sugar").amount).toBeNull();
  });

  it("reads a whole number and a glyph standing together", () => {
    expect(read("1½ cups flour").amount).toBe(1.5);
  });

  it("reads a glyph standing alone", () => {
    expect(read("½ cup flour").amount).toBe(0.5);
  });
});

describe("a range", () => {
  it("reads both ends and the word between them", () => {
    expect(parseLeadingRange("2 to 3 cups", "en")?.max).toBe(3);
    expect(parseLeadingRange("2 à 3 tasses", "fr")?.max).toBe(3);
    expect(parseLeadingRange("2 a 3 tazas", "es")?.max).toBe(3);
  });

  it("is not a range where the second end is not the larger", () => {
    expect(parseLeadingRange("3 to 2 cups", "en")).toBeNull();
  });

  it("is not a range where nothing follows the joiner", () => {
    expect(parseLeadingRange("2 to cups", "en")).toBeNull();
  });

  it("is not a range where the line opens on no figure", () => {
    expect(parseLeadingRange("some to many", "en")).toBeNull();
  });
});

describe("a second figure on the line", () => {
  it("gives the size of what is counted, so the count is what scales", () => {
    // "1 boîte de 400 g" counts tins and says how much is in one. A tin of
    // twice the size is a tin no shop sells.
    const doubled = scale("1 boîte de 400 g de tomates", 2);

    expect(doubled.text).toContain("400 g");
    expect(doubled.text).toMatch(/^2 boîtes/);
  });

  it("restates the same amount where the bracket carries the same measure", () => {
    expect(scale("450 g (1 livre) de spaghetti", 2).text).toContain("900 g");
  });

  it("leaves a bracket holding a remark where the page put it", () => {
    const doubled = scale("2 apples (the riper the better)", 2);

    expect(doubled.text).toContain("(the riper the better)");
    expect(doubled.amount).toBe(4);
  });

  it("reads an unclosed bracket as prose", () => {
    expect(scale("200 g (about flour", 2).amount).toBe(400);
  });
});

describe("what a figure is not", () => {
  it("reads a rank as a position rather than an amount", () => {
    expect(read("1er choix de viande").amount).toBeNull();
    expect(read("1st choice of meat").amount).toBeNull();
  });

  it("reads a length of time as belonging to the method", () => {
    expect(read("30 minutes de repos").amount).toBeNull();
    expect(read("30 minutos de reposo").amount).toBeNull();
  });

  it("reads a hyphenated figure as describing one thing", () => {
    expect(read("4 to 5-pound roast").amount).toBeNull();
  });

  it("reads an amount stated for one eater as one it must not multiply", () => {
    expect(read("50 g par personne").heldBack).toBe("perPerson");
    expect(read("50 g por persona").heldBack).toBe("perPerson");
    expect(read("50 g per person").heldBack).toBe("perPerson");
  });
});

describe("writing an amount back", () => {
  it("writes a share a kitchen measures as the fraction it is", () => {
    expect(formatAmount(1.5, "fr")).toBe("1 1/2");
    expect(formatAmount(0.75, "en")).toBe("3/4");
  });

  it("writes the decimal mark each language writes", () => {
    expect(formatAmount(1.7, "fr")).toBe("1,7");
    expect(formatAmount(1.7, "es")).toBe("1,7");
    expect(formatAmount(1.7, "en")).toBe("1.7");
  });

  it("keeps the significant digits of an amount below what a kitchen resolves", () => {
    expect(formatAmount(0.0004, "en")).toBe("0.0004");
  });

  it("answers nothing for a figure that is not one", () => {
    expect(formatAmount(Number.NaN, "en")).toBe("");
  });
});

describe("a measure a bracket glosses in another language", () => {
  it("is read in the line's own language first", () => {
    expect(read("1 dose (cup) de Mountain Dew").language).toBe("fr");
  });
});

describe("a comma no reading can settle", () => {
  it("hands the line back rather than choosing a reading worth a thousandfold", () => {
    // "1,500" is fifteen hundred under one reading and one and a half under
    // another, and the line says nothing about which.
    const doubled = scale("1,500 xyz", 2);

    expect(doubled.scaling).toBe("unscaled");
    expect(doubled.text).toBe("1,500 xyz");
  });

  it("settles it where the line says which language it is in", () => {
    expect(scale("1,500 g de farine", 2).amount).toBe(3);
  });
});
