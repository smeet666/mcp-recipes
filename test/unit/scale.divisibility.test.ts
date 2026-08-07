/**
 * Counted things the general criterion does not settle on its own.
 *
 * A counted thing divides as far as the smallest share a cook can take out of
 * one and still do something with the rest, and almost everything a recipe
 * counts stops at the half. The lines below name the ones decided by what the
 * thing is rather than by the word that counts it: a bud that has no half, a
 * zest taken in one piece, foods a knife takes to a quarter, measures and
 * containers holding enough that a quarter is still a portion, cuts of meat
 * that stop at the half, words standing for a number of things, words covering
 * two different foods at once, and a marker that announces a count of pieces
 * without naming a measure.
 *
 * Each case is read in both languages the scaler speaks, because the criterion
 * is about the food and not about the words a page happens to use for it.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a clou de girofle is counted whole", () => {
  it("lands on a whole number rather than on a half", () => {
    expect(scale("3 clous de girofle", 0.5).amount).toBe(2);
  });

  it("keeps one in the recipe rather than a share of one", () => {
    expect(scale("1 clou de girofle", 0.5).amount).toBe(1);
  });
});

describe("a zeste is taken whole", () => {
  it("keeps the whole zest when the recipe shrinks", () => {
    const result = scale("1 zeste de citron", 0.5);
    expect(result.amount).toBe(1);
    expect(result.text).toBe("1 zeste de citron");
  });

  it("keeps the whole zest in English too", () => {
    expect(scale("1 lemon zest", 0.5).amount).toBe(1);
  });

  it("holds even though the fruit itself is quartered", () => {
    expect(scale("1 citron", 0.5).amount).toBe(0.5);
    expect(scale("1 lemon", 0.5).amount).toBe(0.5);
  });
});

describe("a whole food a knife takes to a quarter", () => {
  const quartered: [string, string][] = [
    ["1 pastèque", "1 watermelon"],
    ["1 pintade", "1 guinea fowl"],
    ["1 poireau", "1 leek"],
    ["1 banane", "1 banana"],
    ["1 mangue", "1 mango"],
    ["1 poulet", "1 chicken"],
    ["1 rôti de porc", "1 pork loin roast"],
    ["1 pêche", "1 peach"],
    ["1 ananas", "1 pineapple"],
    ["1 gigot d'agneau", "1 leg of lamb"],
  ];

  for (const [french, english] of quartered) {
    it(`takes a quarter of "${french}" and of "${english}"`, () => {
      expect(scale(french, 0.25).amount, french).toBe(0.25);
      expect(scale(english, 0.25).amount, english).toBe(0.25);
    });
  }

  it("takes a quarter of the foods only one of the two languages names", () => {
    for (const line of ["1 avocat", "1 reblochon", "1 bûche de saumon"]) {
      expect(scale(line, 0.25).amount, line).toBe(0.25);
    }
  });
});

describe("a portion cut off a bird or a joint stops at the half", () => {
  it("halves a cuisse, an aile and a pilon", () => {
    for (const line of ["3 cuisses de poulet", "2 ailes de poulet", "1 pilon de poulet"]) {
      expect(scale(line, 0.1).amount, line).toBe(0.5);
    }
  });

  it("halves a thigh, a drumstick and a wing", () => {
    for (const line of ["3 chicken thighs", "2 chicken drumsticks", "6 chicken wings"]) {
      expect(scale(line, 0.1).amount, line).toBe(0.5);
    }
  });
});

describe("a clove is the bud or the wedge of garlic, by what the line says", () => {
  it("takes a quarter of a clove of garlic, as it does of a gousse", () => {
    expect(scale("4 cloves garlic, minced", 0.25).text).toBe("1 clove garlic, minced");
    expect(scale("4 gousses d'ail", 0.25).text).toBe("1 gousse d'ail");
  });

  it("counts the dried bud whole, as it does a clou de girofle", () => {
    expect(scale("4 cloves", 0.5).text).toBe("2 cloves");
    expect(scale("4 whole cloves", 0.5).text).toBe("2 whole cloves");
    expect(scale("1 clove", 0.25).amount).toBe(1);
  });

  it("leaves a head of garlic at the half, cloves or no cloves", () => {
    expect(scale("1 head of garlic, cloves crushed", 0.25).amount).toBe(0.5);
  });
});

describe("a measure cut off something larger goes to the quarter", () => {
  it("takes a quarter of a tranche and of a slice", () => {
    expect(scale("1 tranche de pain", 0.25).amount).toBe(0.25);
    expect(scale("1 slice of bread", 0.25).amount).toBe(0.25);
  });
});

describe("a container holding enough for a quarter to be a portion", () => {
  it("takes a quarter of a jar, as it does of a pot", () => {
    expect(scale("1 jar of salsa", 0.25).amount).toBe(0.25);
  });

  it("takes a quarter of a pot", () => {
    const result = scale("1 pot de crème fraîche", 0.25);
    expect(result.amount).toBe(0.25);
    expect(result.text).toBe("1/4 pot de crème fraîche");
  });

  it("takes a quarter of a pot the line names inside the item", () => {
    expect(scale("1 petit pot de crème", 0.25).amount).toBe(0.25);
  });

  it("takes a quarter of a bouteille and of a bottle alike", () => {
    expect(scale("1 bouteille de vin", 0.25).text).toBe("1/4 bouteille de vin");
    expect(scale("1 bottle of wine", 0.25).text).toBe("1/4 bottle of wine");
  });

  it("takes a quarter of a block", () => {
    expect(scale("1 block firm tofu", 0.25).text).toBe("1/4 block firm tofu");
  });

  it("still stops a boîte and a can at the half", () => {
    expect(scale("1 boîte de tomates", 0.25).amount).toBe(0.5);
    expect(scale("1 can tomatoes", 0.25).amount).toBe(0.5);
  });
});

describe("a dozen states how many things are counted", () => {
  it("counts the things themselves, twelve to the dozen", () => {
    const result = scale("2 dozen mushrooms", 0.75);
    expect(result.amount).toBe(18);
    expect(result.text).toBe("18 mushrooms");
  });

  it("counts them the same way in French", () => {
    const result = scale("2 douzaines d'escargots", 0.75);
    expect(result.amount).toBe(18);
    expect(result.text).toBe("18 escargots");
  });

  it("reads the same when the line writes the count as a word", () => {
    expect(scale("a dozen eggs", 0.5).text).toBe("6 eggs");
    expect(scale("une douzaine d'oeufs", 0.5).text).toBe("6 oeufs");
  });

  it("divides the way the thing counted divides", () => {
    expect(scale("1 dozen eggs", 0.4).amount).toBe(5);
  });
});

describe("a bare piece count names no measure", () => {
  it("leaves the marker out of the line it writes", () => {
    const result = scale("3 ea. tamarind pods", 3);
    expect(result.amount).toBe(9);
    expect(result.text).toBe("9 tamarind pods");
  });

  it("agrees the thing counted with the number that is left", () => {
    expect(scale("½ ea. apple", 2).text).toBe("1 apple");
  });

  it("reads divisibility off the thing counted", () => {
    expect(scale("12 ea. eggs", 5 / 12).amount).toBe(5);
    expect(scale("1 ea. onion", 0.25).amount).toBe(0.25);
  });
});

describe("a blanc is divided by which blanc it is", () => {
  it("counts the white of an egg whole, as the egg and the yolk are", () => {
    for (const line of ["2 blancs d'oeufs", "2 blancs d'œufs", "2 egg whites"]) {
      expect(scale(line, 0.5).amount, line).toBe(1);
    }
  });

  it("halves the breast of a bird, which is a piece of meat", () => {
    for (const line of ["1 blanc de poulet", "1 blanc de dinde", "1 chicken breast"]) {
      expect(scale(line, 0.5).amount, line).toBe(0.5);
    }
  });

  it("halves the meat even when the line also names a fruit", () => {
    expect(scale("2 blancs de poulet aux pommes", 0.25).amount).toBe(0.5);
    expect(scale("1 chicken breast with apple sauce", 0.25).amount).toBe(0.5);
  });

  it("leaves the colour alone, which names no blanc at all", () => {
    expect(scale("1 oignon blanc", 0.25).amount).toBe(0.25);
    expect(scale("1 bouteille de vin blanc", 0.25).amount).toBe(0.25);
  });

  it("puts both readings side by side in one list", () => {
    const [white, breast] = [scale("2 blancs d'oeufs", 0.5), scale("2 blancs de poulet", 0.5)];
    expect(white.text).toBe("1 blanc d'oeufs");
    expect(breast.text).toBe("1 blanc de poulet");
  });
});

describe("what the criterion already settled stays settled", () => {
  it("keeps an oeuf and an egg whole", () => {
    expect(scale("1 oeuf", 0.5).amount).toBe(1);
    expect(scale("1 egg", 0.5).amount).toBe(1);
  });

  it("splits a boîte and a can in two", () => {
    expect(scale("1 boîte de tomates", 0.5).amount).toBe(0.5);
    expect(scale("1 can tomatoes", 0.5).amount).toBe(0.5);
  });

  it("takes an oignon and an onion to a quarter", () => {
    expect(scale("1 oignon", 0.25).amount).toBe(0.25);
    expect(scale("1 onion", 0.25).amount).toBe(0.25);
  });
});
