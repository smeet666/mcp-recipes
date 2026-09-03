/**
 * Whether a line names a tool.
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
 * Nouns that name a tool.
 *
 * One list for the three languages, because a word naming a tool in one of them
 * names nothing at all in the others, so nothing is gained by keeping them
 * apart and a line whose language was read one way still reaches the right
 * answer.
 *
 * A word this vocabulary already carries as a measure stays out. A "cuillère",
 * a "cazo" and a "louche" are what a recipe measures with, and reading either
 * as a tool would leave every spoonful in the list unscaled.
 */
const TOOL_NOUNS = new Set([
  // Spanish
  "freidora",
  "airfryer",
  "batidora",
  "licuadora",
  "amasadora",
  "thermomix",
  "robot",
  "olla",
  "paellera",
  "cazuela",
  "sarten",
  "molde",
  "rejilla",
  "brocha",
  "pincel",
  "espatula",
  "varilla",
  "varillas",
  "colador",
  "escurridor",
  "tamiz",
  "mortero",
  "rodillo",
  "boquilla",
  "termometro",
  "temporizador",
  "microondas",
  "vaporera",
  "parrilla",
  "cuchillo",
  "pelador",
  "rallador",
  "exprimidor",
  "pinza",
  "pinzas",
  "cuenco",
  "recipiente",
  "batidor",
  "prensa",
  "palillo",
  "palillos",
  "brocheta",
  "brochetas",
  // French
  "poele",
  "cocotte",
  "sauteuse",
  "saladier",
  "fouet",
  "spatule",
  "passoire",
  "mixeur",
  "mandoline",
  "pinceau",
  "casserole",
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
  "peeler",
]);

/**
 * Nouns that name a tool in one reading and food in another, with the words
 * that settle which.
 *
 * "1 tin tomatoes" is food and "1 baking tin" is the tin it bakes in; "papel de
 * arroz" is eaten and "papel de hornear" is not. Such a noun is read as a tool
 * only where one of its own words stands beside it, which is the word before it
 * in English and the word after it in French and Spanish.
 */
const AMBIGUOUS_TOOL_NOUNS: Record<string, RegExp> = {
  papel: /^(?:hornear|horno|aluminio|film|vegetal|absorbente|cocina|parchment|baking)$/,
  papier: /^(?:cuisson|sulfurise|aluminium|film)$/,
  vaso: /^(?:medidor|batidora|thermomix)$/,
  cuchara: /^(?:madera|silicona|helado)$/,
  manga: /^(?:pastelera)$/,
  tabla: /^(?:cortar|madera)$/,
  plancha: /^(?:electrica|hierro)$/,
  horno: /^(?:precalentado)$/,
  bol: /^(?:grande|mediano|pequeno|hondo|cristal|acero)$/,
  plato: /^(?:hondo|llano|grande)$/,
  bandeja: /^(?:horno|hornear|pastelera)$/,
  fuente: /^(?:horno|hornear|cristal)$/,
  film: /^(?:transparente|plastico|alimentario)$/,
  moule: /^(?:tarte|manque|cake|silicone|charniere)$/,
  plat: /^(?:four|gratin|cuisson)$/,
  plaque: /^(?:four|cuisson|patisserie)$/,
  planche: /^(?:decouper|bois)$/,
  tin: /^(?:baking|cake|loaf|roasting|flan|sandwich)$/,
  pan: /^(?:frying|baking|roasting|cake|loaf|sauce|griddle)$/,
  dish: /^(?:baking|roasting|ovenproof|gratin)$/,
  tray: /^(?:baking|roasting|oven)$/,
  sheet: /^(?:baking|greaseproof|parchment)$/,
  bowl: /^(?:mixing|large|small)$/,
  mould: /^(?:cake|jelly|silicone)$/,
  mold: /^(?:cake|jelly|silicone)$/,
  paper: /^(?:baking|greaseproof|parchment)$/,
  foil: /^(?:aluminium|aluminum|kitchen)$/,
  board: /^(?:chopping|cutting|wooden)$/,
};

/**
 * What follows a partitive after a tool noun, when the line is still about the
 * tool.
 *
 * French and Spanish measure by the container as readily as they name it: "une
 * casserole de lait" is an amount of milk, and "1 pincel de silicona" is the
 * brush. What stands after the partitive is what tells them apart, so a tool
 * noun followed by one takes a word from here or the line is read as an amount
 * of whatever follows. A size counts: a mould given in centimetres is a mould.
 */
const QUALIFIES_A_TOOL =
  /^(?:aire|hornear|horno|cocina|madera|silicona|silicone|barro|cristal|acero|hierro|aluminio|aluminium|plastico|papel|cortar|decouper|bois|varillas|mano|repostera|pasteleria|pastelera|tarte|manque|four|cuisson|gratin|patisserie|baking|frying|roasting|chopping|cutting|mixing|greaseproof|parchment|nonstick|cake|loaf|wooden|\d+|cm|mm|l|ml)$/;

/** The partitive a Romance line puts between a container and what it holds. */
const PARTITIVE = /^(?:de|del|du|des|d|a|au|à)$/i;

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
 * the end of the group that opens an English line, so both positions are read;
 * the second only counts where the word in front of it is one this vocabulary
 * knows, which keeps "2 carottes râpées" from being read as a grater.
 *
 * A tool noun followed by a partitive measures whatever comes after it unless
 * that word qualifies the tool: "une casserole de lait" is an amount of milk,
 * and "1 pincel de silicona" is the brush.
 */
export function isEquipmentLine(line: string): boolean {
  const head = line.replace(LEADING_QUANTITY, "").replace(LEADING_ARTICLE, "").trim();
  const words = head.split(WORD_SPLIT).filter((word) => word !== "");
  const first = words[0];
  if (first === undefined) {
    return false;
  }

  const folded = fold(first);
  if (holds(TOOL_NOUNS, folded)) {
    return notMeasuringSomethingElse(words);
  }

  const ambiguous = qualifierFor(folded);
  if (ambiguous) {
    return ambiguous.test(wordBeside(words, 0));
  }

  // English writes the qualifier first, so the noun of "baking tin" is the
  // second word. It is read only behind a word that qualifies a tool, which is
  // what keeps an ordinary line naming its preparation out of this.
  const second = words[1];
  if (second !== undefined && QUALIFIES_A_TOOL.test(folded)) {
    const behind = qualifierFor(fold(second));
    return behind ? behind.test(folded) : holds(TOOL_NOUNS, fold(second));
  }

  return false;
}

/** The qualifier pattern for an ambiguous noun, in the number the line wrote it. */
function qualifierFor(word: string): RegExp | undefined {
  return (
    AMBIGUOUS_TOOL_NOUNS[word] ??
    (word.endsWith("es") ? AMBIGUOUS_TOOL_NOUNS[word.slice(0, -2)] : undefined) ??
    (word.endsWith("s") ? AMBIGUOUS_TOOL_NOUNS[word.slice(0, -1)] : undefined)
  );
}

/** The word at `index`, folded, or an empty string where the line ends. */
function wordAt(words: string[], index: number): string {
  const word = words[index];
  return word === undefined ? "" : fold(word);
}

/**
 * The word that qualifies the noun at `index`, with the partitive stepped over.
 *
 * A Romance line writes the qualifier behind the partitive, "papel de hornear",
 * and an adjective without one, "sartén antiadherente". Both stand in the same
 * place once the partitive is passed.
 */
function wordBeside(words: string[], index: number): string {
  const next = wordAt(words, index + 1);
  return PARTITIVE.test(next) ? wordAt(words, index + 2) : next;
}

/**
 * Whether the line names the tool itself rather than an amount measured by it.
 *
 * A partitive behind the noun opens onto what is being measured, so the word
 * after it has to qualify the tool for the line to still be about the tool.
 * Anything else, an adjective or nothing at all, leaves the line about the tool.
 */
function notMeasuringSomethingElse(words: string[]): boolean {
  const after = words[1];
  if (after === undefined || !PARTITIVE.test(fold(after))) {
    return true;
  }
  return QUALIFIES_A_TOOL.test(wordAt(words, 2));
}

/** What the answer says about a line it left alone for naming a tool. */
export const EQUIPMENT_NOTE =
  "This line names a tool, so it was left as published: " +
  "a recipe made for more people uses the same one.";
