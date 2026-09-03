/**
 * Whether a line names a tool rather than something eaten.
 *
 * Some sites write what a recipe is cooked with inside the list they write the
 * ingredients in, so a mould, a tin or an air fryer arrives in the same list as
 * the chicken. Multiplying such a line asks for six air fryers, which is the
 * one wrong answer a scaler can give that a reader has no way to catch: the
 * arithmetic is right and the sentence is absurd.
 *
 * The reading is done on the head noun, which is what the line is about, after
 * the quantity and the article in front of it have been taken off. A word that
 * names a tool in one reading and a food in another is settled by what follows
 * it: "papel de hornear" is baking paper and "papel de arroz" is rice paper, so
 * a tool word is only taken as one when nothing behind it names the food.
 */

/** Whatever stands before the noun the line is about. */
const LEADING_QUANTITY = /^\s*(?:\d+(?:[.,/]\d+)?|[¼½¾⅓⅔⅛])\s*/u;
const LEADING_ARTICLE = /^(?:un|una|unos|unas|une|des|del|de|the|an?|le|la|los|las)\s+/iu;
const WORD_SPLIT = /[\s,;:()]+/u;

/**
 * How many words of a line are read for the noun it is about.
 *
 * Two, because English writes the qualifier first: the noun of "baking tin" is
 * the second word, and anything beyond that names what the dish is made with.
 */
const OPENING_WORDS = 2;
/** How far behind an ambiguous noun a qualifier can stand, past the partitive. */
const AFTER_WORDS = 2;

/**
 * Nouns that name a tool and nothing else.
 *
 * One list for the three languages, because a word naming a tool in one of them
 * names nothing at all in the others, so nothing is gained by keeping them
 * apart and a line whose language was read one way still reaches the right
 * answer.
 *
 * A word this vocabulary already carries as a measure stays out of it. A
 * "cuillère" and a "cazo" are spoons a recipe measures with, and reading either
 * as a tool would leave every spoonful in the list unscaled.
 */
const TOOL_NOUNS = new Set([
  // Spanish
  "freidora",
  "sarten",
  "cazuela",
  "olla",
  "molde",
  "batidora",
  "licuadora",
  "termomix",
  "espatula",
  "varillas",
  "colador",
  "rallador",
  "mortero",
  "microondas",
  "brocheta",
  "escurridor",
  "vaporera",
  "amasadora",
  // French
  "poele",
  "casserole",
  "cocotte",
  "sauteuse",
  "saladier",
  "fouet",
  "spatule",
  "passoire",
  "rape",
  "mixeur",
  "pinceau",
  "mandoline",
  // English
  "skillet",
  "saucepan",
  "whisk",
  "spatula",
  "sieve",
  "colander",
  "grater",
  "blender",
  "processor",
  "ramekin",
  "thermometer",
  "rollingpin",
  "peeler",
]);

/**
 * Nouns that name a tool in one reading and food in another.
 *
 * "1 tin tomatoes" is food and "1 baking tin" is the tin it bakes in; "papel de
 * arroz" is eaten and "papel de hornear" is not. Such a noun is read as a tool
 * only where a word beside it says the recipe means the object, which is the
 * word before it in English and the word after it in French and Spanish.
 */
const AMBIGUOUS_TOOL_NOUNS = new Set([
  "tin",
  "pan",
  "dish",
  "tray",
  "sheet",
  "bowl",
  "mould",
  "mold",
  "paper",
  "foil",
  "board",
  "papel",
  "film",
  "bandeja",
  "fuente",
  "plato",
  "tabla",
  "plancha",
  "papier",
  "plaque",
  // "moule" names the tin a cake is baked in and the shellfish a recipe counts.
  "moule",
  "plat",
  "planche",
]);

/**
 * Words that say a nearby noun names the object rather than the food.
 *
 * They qualify the tool without naming anything eaten, so a line carrying one
 * beside an ambiguous noun is about the tool.
 */
const QUALIFIES_A_TOOL = new Set([
  "hornear",
  "horno",
  "aire",
  "barro",
  "silicona",
  "antiadherente",
  "desmontable",
  "aluminio",
  "hondo",
  "llano",
  "baking",
  "greaseproof",
  "parchment",
  "nonstick",
  "cake",
  "loaf",
  "roasting",
  "frying",
  "cuisson",
  "sulfurise",
  "tarte",
  "manque",
  "patisserie",
]);

/**
 * Words that name a food, which turn an ambiguous noun back into an ingredient
 * and stop an unambiguous one from claiming what follows it.
 */
const NAMES_A_FOOD = new Set([
  "arroz",
  "gelatina",
  "azucar",
  "riz",
  "gelatine",
  "sucre",
  "rice",
  "gelatin",
  "sugar",
  "atun",
  "thon",
  "tuna",
  "cabra",
  "chevre",
  "goat",
  "sopa",
  "soupe",
  "soup",
  "tomates",
  "tomatoes",
  "tomate",
]);

/** Accents removed, so a list written in plain letters answers for every spelling. */
function fold(word: string): string {
  return word.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").toLowerCase();
}

/**
 * Whether a set holds the word, in the number the line wrote it in.
 *
 * The lists are written in the singular, and a recipe asks for two moulds as
 * readily as for one. Both plural marks the three languages use are undone,
 * "-s" and the "-es" Spanish writes after a consonant.
 */
function holds(vocabulary: Set<string>, word: string): boolean {
  if (vocabulary.has(word)) {
    return true;
  }
  if (word.endsWith("es") && vocabulary.has(word.slice(0, -2))) {
    return true;
  }
  return word.endsWith("s") && vocabulary.has(word.slice(0, -1));
}

/**
 * Whether the line is about a tool.
 *
 * The noun the line is about stands at its head in French and Spanish and at
 * the end of the group that opens an English line, so both positions are read.
 * A noun naming a tool and nothing else settles the line unless a food is named
 * behind it; an ambiguous noun settles it only where a qualifier stands beside
 * it. Anything else is food, however far along the line a tool word appears, so
 * "200 g de queso de cabra" is never read as a dish.
 */
export function isEquipmentLine(line: string): boolean {
  const head = line.replace(LEADING_QUANTITY, "").replace(LEADING_ARTICLE, "").trim();
  const words = head.split(WORD_SPLIT).filter((word) => word !== "");
  // Only the opening noun group is read. A word further along names what the
  // dish is made with or served on rather than what it is.
  const opening = words.slice(0, OPENING_WORDS).map(fold);

  for (const [index, word] of opening.entries()) {
    if (holds(TOOL_NOUNS, word)) {
      return !namesAFoodAfter(words, index);
    }
    if (holds(AMBIGUOUS_TOOL_NOUNS, word) && qualifiedBeside(words, index)) {
      return true;
    }
  }

  return false;
}

/** Whether a food is named behind the noun at `index`, which makes the line food. */
function namesAFoodAfter(words: string[], index: number): boolean {
  return words.slice(index + 1).some((word) => holds(NAMES_A_FOOD, fold(word)));
}

/**
 * Whether a qualifier stands beside the noun at `index`.
 *
 * English writes it in front, "baking tin", and French and Spanish behind, with
 * the partitive between them, "papel de hornear". Both neighbours are therefore
 * read, and the partitive is stepped over.
 */
function qualifiedBeside(words: string[], index: number): boolean {
  const before = words[index - 1];
  if (before !== undefined && holds(QUALIFIES_A_TOOL, fold(before))) {
    return true;
  }
  for (const word of words.slice(index + 1, index + 1 + AFTER_WORDS)) {
    const folded = fold(word);
    if (holds(NAMES_A_FOOD, folded)) {
      return false;
    }
    if (holds(QUALIFIES_A_TOOL, folded)) {
      return true;
    }
  }
  return false;
}

/** What the answer says about a line it left alone for naming a tool. */
export const EQUIPMENT_NOTE =
  "This line names a tool rather than an ingredient, so it was left as published: " +
  "a recipe made for more people uses the same one.";
