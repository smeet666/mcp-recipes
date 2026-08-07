import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("HTML entities in a published line", () => {
  it("reads a named entity as the fraction it stands for", () => {
    expect(scale("1&frac12; teaspoons salt", 2).text).toBe("3 teaspoons salt");
  });

  it("reads a numeric entity as the fraction it stands for", () => {
    const result = scale("&#8532; cups (160 ml) water", 2);
    expect(result.scaling).not.toBe("unscaled");
    expect(result.text).toBe("1 1/2 cups (320 ml) water");
  });
});

describe("a comma between digits", () => {
  it("groups thousands on an English line", () => {
    expect(scale("1,500 g flour", 2)).toMatchObject({ amount: 3, unit: "kg" });
  });

  it("marks the decimal on a French line", () => {
    expect(scale("1,500 kg de farine", 2)).toMatchObject({ amount: 3, unit: "kg" });
  });

  it("refuses the number when the line gives no sign which language it is in", () => {
    const result = scale("1,500 x", 2);
    expect(result.scaling).toBe("unscaled");
    expect(result.note).toMatch(/comma/i);
  });
});

describe("a number that qualifies the size of one thing", () => {
  it("does not order eight roasts where the page described one", () => {
    const result = scale("4 to 5-pound boneless pork loin roast", 2);
    expect(result.text).toBe("4 to 5-pound boneless pork loin roast");
    expect(result.scaling).toBe("unscaled");
    expect(result.note).toMatch(/size of one/i);
  });
});

describe("a quantity already stated per person", () => {
  it("does not apply the factor a second time in French", () => {
    const result = scale("2 pommes de terre par personne", 2);
    expect(result.text).toBe("2 pommes de terre par personne");
    expect(result.scaling).toBe("unscaled");
    expect(result.note).toMatch(/one person/i);
  });

  it("does not apply the factor a second time in English", () => {
    expect(scale("1 slice of stale french bread, per person", 2).scaling).toBe("unscaled");
  });
});

describe("brackets the page left empty", () => {
  it("drops them rather than carrying them into the answer", () => {
    expect(scale("¼ cup () superfine sugar", 2).text).toBe("1/2 cup superfine sugar");
  });
});

describe('"recipe" naming another recipe of the book', () => {
  it("puts the plural mark on the count rather than on the dish", () => {
    expect(scale("1 recipe Flaky Pie Crust", 2).text).toBe("2 recipes Flaky Pie Crust");
  });
});

describe("a number the page introduced as approximate", () => {
  it("scales the amount and keeps the sign that says it is loose", () => {
    const result = scale("~1 cup water", 2);
    expect(result.text).toBe("~2 cups water");
    expect(result.note).toMatch(/approximation/i);
  });

  it("scales an amount introduced by an English word", () => {
    expect(scale("about 6 medium lemons", 2).text).toBe("about 12 medium lemons");
  });

  it("scales an amount introduced by a French word", () => {
    expect(scale("environ 6 citrons", 2).text).toBe("environ 12 citrons");
  });
});

describe("an adjective standing between the number and the measure", () => {
  it("reads a French measure behind it", () => {
    const result = scale("1 grosse pincée de sel", 2);
    expect(result.unit).toBe("pincée");
    expect(result.text).toBe("2 grosses pincées de sel");
  });

  it("reads an English measure behind it", () => {
    const result = scale("1 small handful of parsley", 2);
    expect(result.unit).toBe("handful");
    expect(result.text).toBe("2 small handfuls parsley");
  });

  it("leaves a word that names no measure in the item", () => {
    expect(scale("1 cleaned leek green", 2).unit).toBeNull();
  });
});

describe("a measure the page restates in brackets", () => {
  it("reads the French name of the pound", () => {
    expect(scale("450 g (1 livre) de spaghetti", 2).text).toBe("900 g (2 livres) de spaghetti");
  });
});

describe("an approximate measure divided", () => {
  // A pincée has the size a hand gives it. Half of one is not a quantity a hand
  // produces, so the count lands on a whole and the line says it moved.
  it("lands the count on a whole", () => {
    expect(scale("1 pincée de sel", 0.5)).toMatchObject({ amount: 1, scaling: "rounded" });
    expect(scale("2 pinches salt", 0.25)).toMatchObject({ amount: 1, scaling: "rounded" });
    expect(scale("1 poignée de roquette", 0.5).amount).toBe(1);
    expect(scale("15 noix", 0.5).amount).toBe(8);
  });
});

describe("a measure that counts pieces without naming them", () => {
  it("leaves how far the count divides to the thing beside it", () => {
    expect(scale("4 ea eggs", 0.375).text).toBe("2 eggs");
  });
});

describe("a second quantity the line carries after the first", () => {
  it("is reported on a French line too", () => {
    const result = scale("20 g de levure dissoute dans 1 cuillère à soupe d'eau tiède", 2);
    expect(result.note).toMatch(/further quantity after the first one/i);
  });
});

describe("how far a clove of garlic divides", () => {
  // The cook who uses these recipes settled it: a clove is split in two and no
  // finer, whichever language the line names it in.
  it("stops at the half in English", () => {
    expect(scale("1 clove garlic", 0.25).text).toBe("1/2 clove garlic");
  });

  it("stops at the half in French", () => {
    expect(scale("1 gousse d'ail", 0.25).text).toBe("1/2 gousse d'ail");
  });

  it("keeps a clove that names no garlic whole", () => {
    expect(scale("1 clove", 0.25).text).toBe("1 clove");
  });
});

describe("a French produce name opening on an accent", () => {
  it("is recognised as something a knife takes to quarters", () => {
    expect(scale("1 échalote", 0.25).text).toBe("1/4 échalote");
  });
});

describe("small things a recipe counts one by one", () => {
  it("keeps a baie de genièvre whole", () => {
    expect(scale("1 baie de genièvre", 0.5).text).toBe("1 baie de genièvre");
  });

  it("keeps a baie de genévrier whole", () => {
    expect(scale("1 baie de genévrier", 0.5).text).toBe("1 baie de genévrier");
  });

  it("keeps an étoile de badiane whole", () => {
    expect(scale("1 étoile de badiane", 0.5).text).toBe("1 étoile de badiane");
  });

  it("keeps a star anise whole", () => {
    expect(scale("1 star anise", 0.5).text).toBe("1 star anise");
  });

  it("keeps a juniper berry whole", () => {
    expect(scale("1 juniper berry", 0.5).text).toBe("1 juniper berry");
  });
});
