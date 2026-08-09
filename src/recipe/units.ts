/**
 * Cooking measures in French and in English, and what scaling means for each.
 *
 * What matters about a measure is how far its number divides before it stops
 * naming something a cook can produce.
 * Doubling "200 g" gives "400 g", to the tenth of a gram. Doubling "1 pincée"
 * gives "2 pincées", which is the whole of what a pinch can say: the count
 * carries the quantity, and the size of one pinch is the hand's business.
 */

import type { Language } from "./language.js";

export type UnitKind =
  /** Mass or volume: scales continuously and cleanly. */
  | "measured"
  /** Spoons, cups, cloves, sachets: scales, but only to sensible fractions. */
  | "portioned"
  /**
   * Pinches, dashes, handfuls, pincées, poignées: a real amount, held to no
   * better than the hand that produces it. The count is multiplied and lands on
   * a whole one, and the line says the measure is approximate.
   */
  | "approximate";

export type UnitSystem = "metric" | "imperial" | "none";

export interface UnitInfo {
  /** Canonical singular form, used when rewriting the ingredient line. */
  canonical: string;
  kind: UnitKind;
  system: UnitSystem;
  /** Plural form when it is not simply the singular plus an "s". */
  plural?: string;
  /** A symbol such as "g" or "ml", which never takes a plural mark. */
  symbol?: true;
}

/**
 * Measures written the same way in both languages: the metric symbols.
 *
 * "g", "kg", "ml" and "l" are read off a French line and an English line alike,
 * and they take no plural mark in either.
 */
const SHARED_UNITS: Record<string, UnitInfo> = {
  mg: { canonical: "mg", kind: "measured", system: "metric", symbol: true },
  g: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  gr: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  kg: { canonical: "kg", kind: "measured", system: "metric", symbol: true },
  kilo: { canonical: "kg", kind: "measured", system: "metric", symbol: true },
  kilos: { canonical: "kg", kind: "measured", system: "metric", symbol: true },
  ml: { canonical: "ml", kind: "measured", system: "metric", symbol: true },
  cl: { canonical: "cl", kind: "measured", system: "metric", symbol: true },
  dl: { canonical: "dl", kind: "measured", system: "metric", symbol: true },
  l: { canonical: "l", kind: "measured", system: "metric", symbol: true },
  litre: { canonical: "l", kind: "measured", system: "metric", symbol: true },
  litres: { canonical: "l", kind: "measured", system: "metric", symbol: true },
};

/**
 * Keys are matched lowercased and accent-stripped, so a single entry covers
 * "cuillere", "cuillère" and "Cuillères".
 */
const FRENCH_UNITS: Record<string, UnitInfo> = {
  ...SHARED_UNITS,

  gramme: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  grammes: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  kilogramme: { canonical: "kg", kind: "measured", system: "metric", symbol: true },
  kilogrammes: { canonical: "kg", kind: "measured", system: "metric", symbol: true },
  millilitre: { canonical: "ml", kind: "measured", system: "metric", symbol: true },
  millilitres: { canonical: "ml", kind: "measured", system: "metric", symbol: true },
  centilitre: { canonical: "cl", kind: "measured", system: "metric", symbol: true },
  centilitres: { canonical: "cl", kind: "measured", system: "metric", symbol: true },
  // A page glossing a metric weight names the pound, which French writes as a
  // livre: "450 g (1 livre) de spaghetti".
  livre: { canonical: "livre", kind: "measured", system: "imperial", plural: "livres" },
  livres: { canonical: "livre", kind: "measured", system: "imperial", plural: "livres" },
  lb: { canonical: "lb", kind: "measured", system: "imperial", symbol: true },
  lbs: { canonical: "lb", kind: "measured", system: "imperial", symbol: true },

  // Spoons and cups: real measures, but only in sensible fractions.
  "cuillere a soupe": {
    canonical: "cuillère à soupe",
    kind: "portioned",
    system: "none",
    plural: "cuillères à soupe",
  },
  "cuilleres a soupe": {
    canonical: "cuillère à soupe",
    kind: "portioned",
    system: "none",
    plural: "cuillères à soupe",
  },
  "c a soupe": {
    canonical: "cuillère à soupe",
    kind: "portioned",
    system: "none",
    plural: "cuillères à soupe",
  },
  "c a s": {
    canonical: "cuillère à soupe",
    kind: "portioned",
    system: "none",
    plural: "cuillères à soupe",
  },
  cas: {
    canonical: "cuillère à soupe",
    kind: "portioned",
    system: "none",
    plural: "cuillères à soupe",
  },
  "cuillere a cafe": {
    canonical: "cuillère à café",
    kind: "portioned",
    system: "none",
    plural: "cuillères à café",
  },
  "cuilleres a cafe": {
    canonical: "cuillère à café",
    kind: "portioned",
    system: "none",
    plural: "cuillères à café",
  },
  "c a cafe": {
    canonical: "cuillère à café",
    kind: "portioned",
    system: "none",
    plural: "cuillères à café",
  },
  "c a c": {
    canonical: "cuillère à café",
    kind: "portioned",
    system: "none",
    plural: "cuillères à café",
  },
  cac: {
    canonical: "cuillère à café",
    kind: "portioned",
    system: "none",
    plural: "cuillères à café",
  },
  verre: { canonical: "verre", kind: "portioned", system: "none" },
  verres: { canonical: "verre", kind: "portioned", system: "none" },
  bol: { canonical: "bol", kind: "portioned", system: "none" },
  bols: { canonical: "bol", kind: "portioned", system: "none" },
  tasse: { canonical: "tasse", kind: "portioned", system: "none" },
  tasses: { canonical: "tasse", kind: "portioned", system: "none" },

  // Packaging and natural units: countable, so they round to whole things.
  sachet: { canonical: "sachet", kind: "portioned", system: "none" },
  sachets: { canonical: "sachet", kind: "portioned", system: "none" },
  gousse: { canonical: "gousse", kind: "portioned", system: "none" },
  gousses: { canonical: "gousse", kind: "portioned", system: "none" },
  tranche: { canonical: "tranche", kind: "portioned", system: "none" },
  tranches: { canonical: "tranche", kind: "portioned", system: "none" },
  botte: { canonical: "botte", kind: "portioned", system: "none" },
  bottes: { canonical: "botte", kind: "portioned", system: "none" },
  boite: { canonical: "boîte", kind: "portioned", system: "none", plural: "boîtes" },
  boites: { canonical: "boîte", kind: "portioned", system: "none", plural: "boîtes" },
  pot: { canonical: "pot", kind: "portioned", system: "none" },
  pots: { canonical: "pot", kind: "portioned", system: "none" },
  brique: { canonical: "brique", kind: "portioned", system: "none" },
  briques: { canonical: "brique", kind: "portioned", system: "none" },
  feuille: { canonical: "feuille", kind: "portioned", system: "none" },
  feuilles: { canonical: "feuille", kind: "portioned", system: "none" },
  branche: { canonical: "branche", kind: "portioned", system: "none" },
  branches: { canonical: "branche", kind: "portioned", system: "none" },

  // Held to no better than a hand: the count scales, the size of one does not.
  // `readPartitiveMeasure` explains what else lands here.
  bouchon: { canonical: "bouchon", kind: "approximate", system: "none" },
  bouchons: { canonical: "bouchon", kind: "approximate", system: "none" },
  larme: { canonical: "larme", kind: "approximate", system: "none" },
  larmes: { canonical: "larme", kind: "approximate", system: "none" },
  doigt: { canonical: "doigt", kind: "approximate", system: "none" },
  doigts: { canonical: "doigt", kind: "approximate", system: "none" },
  nuage: { canonical: "nuage", kind: "approximate", system: "none" },
  nuages: { canonical: "nuage", kind: "approximate", system: "none" },
  louche: { canonical: "louche", kind: "approximate", system: "none" },
  louches: { canonical: "louche", kind: "approximate", system: "none" },
  lichette: { canonical: "lichette", kind: "approximate", system: "none" },
  lichettes: { canonical: "lichette", kind: "approximate", system: "none" },
  pointe: { canonical: "pointe", kind: "approximate", system: "none" },
  pointes: { canonical: "pointe", kind: "approximate", system: "none" },
  pincee: { canonical: "pincée", kind: "approximate", system: "none", plural: "pincées" },
  pincees: { canonical: "pincée", kind: "approximate", system: "none", plural: "pincées" },
  trait: { canonical: "trait", kind: "approximate", system: "none" },
  traits: { canonical: "trait", kind: "approximate", system: "none" },
  filet: { canonical: "filet", kind: "approximate", system: "none" },
  filets: { canonical: "filet", kind: "approximate", system: "none" },
  goutte: { canonical: "goutte", kind: "approximate", system: "none", plural: "gouttes" },
  gouttes: { canonical: "goutte", kind: "approximate", system: "none", plural: "gouttes" },
  poignee: { canonical: "poignée", kind: "approximate", system: "none", plural: "poignées" },
  poignees: { canonical: "poignée", kind: "approximate", system: "none", plural: "poignées" },
  // "noix" carries its own plural mark already.
  noix: { canonical: "noix", kind: "approximate", system: "none", plural: "noix" },
  soupcon: { canonical: "soupçon", kind: "approximate", system: "none", plural: "soupçons" },
  soupcons: { canonical: "soupçon", kind: "approximate", system: "none", plural: "soupçons" },
};

/**
 * Keys are matched lowercased with dots dropped, so a single entry covers
 * "Tbsp", "tbsp." and "TBSP".
 */
const ENGLISH_UNITS: Record<string, UnitInfo> = {
  ...SHARED_UNITS,

  milligram: { canonical: "mg", kind: "measured", system: "metric", symbol: true },
  milligrams: { canonical: "mg", kind: "measured", system: "metric", symbol: true },
  gram: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  grams: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  gramme: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  grammes: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  kilogram: { canonical: "kg", kind: "measured", system: "metric", symbol: true },
  kilograms: { canonical: "kg", kind: "measured", system: "metric", symbol: true },
  milliliter: { canonical: "ml", kind: "measured", system: "metric", symbol: true },
  milliliters: { canonical: "ml", kind: "measured", system: "metric", symbol: true },
  millilitre: { canonical: "ml", kind: "measured", system: "metric", symbol: true },
  millilitres: { canonical: "ml", kind: "measured", system: "metric", symbol: true },
  liter: { canonical: "l", kind: "measured", system: "metric", symbol: true },
  liters: { canonical: "l", kind: "measured", system: "metric", symbol: true },

  // Imperial mass
  oz: { canonical: "oz", kind: "measured", system: "imperial", symbol: true },
  ounce: { canonical: "ounce", kind: "measured", system: "imperial", plural: "ounces" },
  ounces: { canonical: "ounce", kind: "measured", system: "imperial", plural: "ounces" },
  lb: { canonical: "lb", kind: "measured", system: "imperial", symbol: true },
  lbs: { canonical: "lb", kind: "measured", system: "imperial", symbol: true },
  pound: { canonical: "pound", kind: "measured", system: "imperial", plural: "pounds" },
  pounds: { canonical: "pound", kind: "measured", system: "imperial", plural: "pounds" },

  // Imperial volume
  "fl oz": { canonical: "fl oz", kind: "measured", system: "imperial", symbol: true },
  "fluid ounce": {
    canonical: "fluid ounce",
    kind: "measured",
    system: "imperial",
    plural: "fluid ounces",
  },
  "fluid ounces": {
    canonical: "fluid ounce",
    kind: "measured",
    system: "imperial",
    plural: "fluid ounces",
  },
  pint: { canonical: "pint", kind: "measured", system: "imperial", plural: "pints" },
  pints: { canonical: "pint", kind: "measured", system: "imperial", plural: "pints" },
  quart: { canonical: "quart", kind: "measured", system: "imperial", plural: "quarts" },
  quarts: { canonical: "quart", kind: "measured", system: "imperial", plural: "quarts" },
  gallon: { canonical: "gallon", kind: "measured", system: "imperial", plural: "gallons" },
  gallons: { canonical: "gallon", kind: "measured", system: "imperial", plural: "gallons" },

  // Spoons and cups: real measures, but only in sensible fractions.
  tsp: { canonical: "tsp", kind: "portioned", system: "imperial", symbol: true },
  teaspoon: { canonical: "teaspoon", kind: "portioned", system: "imperial", plural: "teaspoons" },
  teaspoons: { canonical: "teaspoon", kind: "portioned", system: "imperial", plural: "teaspoons" },
  tbsp: { canonical: "Tbsp", kind: "portioned", system: "imperial", symbol: true },
  tbs: { canonical: "Tbsp", kind: "portioned", system: "imperial", symbol: true },
  tablespoon: {
    canonical: "tablespoon",
    kind: "portioned",
    system: "imperial",
    plural: "tablespoons",
  },
  tablespoons: {
    canonical: "tablespoon",
    kind: "portioned",
    system: "imperial",
    plural: "tablespoons",
  },
  cup: { canonical: "cup", kind: "portioned", system: "imperial", plural: "cups" },
  cups: { canonical: "cup", kind: "portioned", system: "imperial", plural: "cups" },

  // Packaging and natural units: countable, so they round to whole things.
  can: { canonical: "can", kind: "portioned", system: "none" },
  cans: { canonical: "can", kind: "portioned", system: "none" },
  jar: { canonical: "jar", kind: "portioned", system: "none" },
  jars: { canonical: "jar", kind: "portioned", system: "none" },
  packet: { canonical: "packet", kind: "portioned", system: "none" },
  packets: { canonical: "packet", kind: "portioned", system: "none" },
  package: { canonical: "package", kind: "portioned", system: "none" },
  packages: { canonical: "package", kind: "portioned", system: "none" },
  sachet: { canonical: "sachet", kind: "portioned", system: "none" },
  sachets: { canonical: "sachet", kind: "portioned", system: "none" },
  clove: { canonical: "clove", kind: "portioned", system: "none" },
  cloves: { canonical: "clove", kind: "portioned", system: "none" },
  slice: { canonical: "slice", kind: "portioned", system: "none" },
  slices: { canonical: "slice", kind: "portioned", system: "none" },
  stick: { canonical: "stick", kind: "portioned", system: "none" },
  sticks: { canonical: "stick", kind: "portioned", system: "none" },
  stalk: { canonical: "stalk", kind: "portioned", system: "none" },
  stalks: { canonical: "stalk", kind: "portioned", system: "none" },
  sprig: { canonical: "sprig", kind: "portioned", system: "none" },
  sprigs: { canonical: "sprig", kind: "portioned", system: "none" },
  bunch: { canonical: "bunch", kind: "portioned", system: "none", plural: "bunches" },
  bunches: { canonical: "bunch", kind: "portioned", system: "none", plural: "bunches" },
  head: { canonical: "head", kind: "portioned", system: "none" },
  heads: { canonical: "head", kind: "portioned", system: "none" },
  sheet: { canonical: "sheet", kind: "portioned", system: "none" },
  sheets: { canonical: "sheet", kind: "portioned", system: "none" },
  leaf: { canonical: "leaf", kind: "portioned", system: "none", plural: "leaves" },
  leaves: { canonical: "leaf", kind: "portioned", system: "none", plural: "leaves" },
  ea: { canonical: "ea", kind: "portioned", system: "none", symbol: true },
  // A dish of the book standing as an ingredient of another: "1 recipe Flaky
  // Pie Crust". The count is what the word measures, so the plural mark belongs
  // on it and not on the name of the dish.
  recipe: { canonical: "recipe", kind: "portioned", system: "none", plural: "recipes" },
  recipes: { canonical: "recipe", kind: "portioned", system: "none", plural: "recipes" },

  // Held to no better than a hand: the count scales, the size of one does not.
  // `readContainerLoad` explains what else lands here.
  capful: { canonical: "capful", kind: "approximate", system: "none", plural: "capfuls" },
  capfuls: { canonical: "capful", kind: "approximate", system: "none", plural: "capfuls" },
  glug: { canonical: "glug", kind: "approximate", system: "none" },
  glugs: { canonical: "glug", kind: "approximate", system: "none" },
  dollop: { canonical: "dollop", kind: "approximate", system: "none" },
  dollops: { canonical: "dollop", kind: "approximate", system: "none" },
  squeeze: { canonical: "squeeze", kind: "approximate", system: "none" },
  squeezes: { canonical: "squeeze", kind: "approximate", system: "none" },
  sprinkle: { canonical: "sprinkle", kind: "approximate", system: "none" },
  sprinkles: { canonical: "sprinkle", kind: "approximate", system: "none" },
  sprinkling: { canonical: "sprinkling", kind: "approximate", system: "none" },
  sprinklings: { canonical: "sprinkling", kind: "approximate", system: "none" },
  grating: { canonical: "grating", kind: "approximate", system: "none" },
  gratings: { canonical: "grating", kind: "approximate", system: "none" },
  twist: { canonical: "twist", kind: "approximate", system: "none" },
  twists: { canonical: "twist", kind: "approximate", system: "none" },
  smidgen: { canonical: "smidgen", kind: "approximate", system: "none" },
  smidgens: { canonical: "smidgen", kind: "approximate", system: "none" },
  pinch: { canonical: "pinch", kind: "approximate", system: "none", plural: "pinches" },
  pinches: { canonical: "pinch", kind: "approximate", system: "none", plural: "pinches" },
  dash: { canonical: "dash", kind: "approximate", system: "none", plural: "dashes" },
  dashes: { canonical: "dash", kind: "approximate", system: "none", plural: "dashes" },
  splash: { canonical: "splash", kind: "approximate", system: "none", plural: "splashes" },
  splashes: { canonical: "splash", kind: "approximate", system: "none", plural: "splashes" },
  drizzle: { canonical: "drizzle", kind: "approximate", system: "none" },
  drizzles: { canonical: "drizzle", kind: "approximate", system: "none" },
  handful: { canonical: "handful", kind: "approximate", system: "none", plural: "handfuls" },
  handfuls: { canonical: "handful", kind: "approximate", system: "none", plural: "handfuls" },
  drop: { canonical: "drop", kind: "approximate", system: "none" },
  drops: { canonical: "drop", kind: "approximate", system: "none" },
  knob: { canonical: "knob", kind: "approximate", system: "none" },
  knobs: { canonical: "knob", kind: "approximate", system: "none" },
};

const VOCABULARY: Record<Language, Record<string, UnitInfo>> = {
  fr: FRENCH_UNITS,
  en: ENGLISH_UNITS,
};

/**
 * Lowercase, strip accents and drop abbreviation dots, so a lookup survives the
 * spellings a recipe actually uses. Recipes write "c. à soupe" and "Tbsp." as
 * readily as the full words, and an unrecognised measure is worse than a wrong
 * one: the amount falls through to the countable branch and gets rounded as
 * though a spoonful were an indivisible object.
 */
export function normalizeUnitKey(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\./g, " ")
      // A recipe that does not know how many it will be writes the plural mark in
      // brackets: "4 cuillère(s) à soupe". The measure is the word without it.
      .replace(/\((?:s|x|es)\)/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Longest keys first, so "cuillère à soupe" wins over "cuillère". */
function orderedKeys(vocabulary: Record<string, UnitInfo>): string[] {
  return Object.keys(vocabulary).sort(
    (a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length,
  );
}

const UNIT_KEYS: Record<Language, string[]> = {
  fr: orderedKeys(FRENCH_UNITS),
  en: orderedKeys(ENGLISH_UNITS),
};

export function unitKeys(language: Language): string[] {
  return UNIT_KEYS[language];
}

export function lookupUnit(text: string, language: Language): UnitInfo | null {
  return VOCABULARY[language][normalizeUnitKey(text)] ?? null;
}

/**
 * Matches a number followed by a measure anywhere in a piece of text.
 *
 * Used to spot a quantity the parser did not take, such as the second half of
 * "1 Tbsp vanilla sugar OR 1 tsp vanilla extract", which would otherwise sit in
 * a scaled line still saying what the original said.
 */
const EMBEDDED: Record<Language, RegExp> = {
  fr: buildEmbedded("fr"),
  en: buildEmbedded("en"),
};

function buildEmbedded(language: Language): RegExp {
  const keys = UNIT_KEYS[language].map((key) => key.replace(/ /g, "\\s+"));
  // A quantity keeps the same shape whether the measure stands against the
  // figure or behind the word introducing it: "3/4 tasse" and "3/4 de tasse"
  // are one quantity written twice. Reading only the first spelling leaves the
  // second sitting on a scaled line, still saying what the page said.
  const joiner = "(?:(?:de|du|des|d|of|a|an|the)\\s+)?";
  // The digits and the whitespace are kept in separate pieces that cannot both
  // match a space. Letting them overlap makes the engine try every way of
  // splitting a run of spaces between them, which turns a long line into
  // seconds of work for an answer that was always going to be no.
  return new RegExp(`\\d[\\d.,/]*\\s*${joiner}(?:${keys.join("|")})\\b`, "i");
}

/**
 * Nouns naming what a food is sold in.
 *
 * A measure written in front of one of them gives what that container holds:
 * "12 oz can" is the size of the tin rather than an amount to weigh out, and
 * doubling the recipe means opening a second tin rather than finding a bigger
 * one.
 *
 * Written in either language, because what a word names has nothing to do with
 * which language names it.
 */
export const CONTAINER_NOUN =
  /^(?:cans?|tins?|jars?|packets?|packages?|packs?|box|boxes|bottles?|cartons?|bags?|tubs?|sachets?|blocks?|blocs?|boites?|pots?|briques?|bocaux|bocals?|barquettes?)\b/i;

/**
 * The text is normalized first, because the vocabulary is keyed without accents
 * and a French line writes "cuillère à soupe" with them.
 */
export function hasEmbeddedMeasure(text: string, language: Language): boolean {
  return EMBEDDED[language].test(normalizeUnitKey(text));
}

/**
 * Words that stand where a measure would and name no container: "un peu de
 * sel" states that there is some salt, and multiplying it says nothing.
 */
const NOT_A_MEASURE = new Set([
  "peu",
  "beaucoup",
  "plus",
  "moins",
  "assez",
  "trop",
  "autant",
  "tant",
  "moitie",
  "quart",
  "tiers",
  "reste",
  "melange",
  "ensemble",
]);

/**
 * Read a French measure named with a container or a gesture the vocabulary has
 * no entry for.
 *
 * What makes a measure approximate is that its size belongs to whoever pours
 * it: a bouchon, a poignée, a ramequin hold what they hold, and the recipe's
 * proportion lives in how many are asked for. French marks that grammatically,
 * by placing the noun between the amount and the partitive that introduces the
 * thing measured: "un bouchon de rhum", "2 bouquets de persil". A noun in that
 * position measures whatever follows it, so a container nobody thought to list
 * is read by the same rule as the ones that are, and the vocabulary only has to
 * carry the words whose plural or spelling the rule would get wrong.
 *
 * The amount has to come first. A line opening on the noun, as in "beurre
 * pommade", carries no quantity, and inventing one from the grammar would put a
 * number where the recipe wrote none.
 */
export function readPartitiveMeasure(text: string): { unit: UnitInfo; rest: string } | null {
  const match = /^\s*(\p{L}+)\s+(?=(?:de|du|des)\s|d')/u.exec(text);
  if (!match) return null;

  const word = match[1]!;
  if (word.length < 3) return null;
  if (NOT_A_MEASURE.has(normalizeUnitKey(word))) return null;
  if (lookupUnit(word, "fr")) return null;

  const canonical = frenchSingular(word);
  return {
    unit: {
      canonical,
      kind: "approximate",
      system: "none",
      plural: frenchPlural(canonical),
    },
    rest: text.slice(match[0].length),
  };
}

/**
 * Read an English measure named after the thing that holds it: a capful, a
 * spoonful, a jarful.
 *
 * What makes a measure approximate is that its size belongs to whoever pours
 * it rather than to a standard, and English marks that in the word itself. The
 * suffix -ful means "as much as one of these holds", and what a cap, a bowl or
 * a handful holds is whatever the one in the kitchen holds. Any noun built that
 * way is therefore a measure of the same family as a pinch, which is why the
 * suffix is read as a rule: a container nobody thought to list is understood
 * the first time it appears, and the vocabulary only has to carry the gestures
 * whose name says nothing about their size either.
 */
export function readContainerLoad(word: string): UnitInfo | null {
  const key = normalizeUnitKey(word);
  // At least three letters name the container, which keeps "awful" out of the
  // kitchen.
  if (!/^[a-z]{3,}fuls?$/.test(key)) return null;

  const canonical = key.endsWith("fuls") ? key.slice(0, -1) : key;
  return { canonical, kind: "approximate", system: "none", plural: `${canonical}s` };
}

/**
 * The singular of a French noun a line wrote in the plural, so the rewrite can
 * put it back in either number.
 *
 * "ananas", "jus" and "anis" carry their -s in the singular, and "morceaux"
 * comes from "morceau", so the ending decides rather than the last letter
 * alone.
 */
function frenchSingular(word: string): string {
  if (/eaux$/i.test(word)) return word.slice(0, -1);
  if (/aux$/i.test(word)) return `${word.slice(0, -3)}al`;
  if (/[aiou]s$/i.test(word)) return word;
  if (/s$/i.test(word) && word.length > 3) return word.slice(0, -1);
  return word;
}

/** The plural French writes for a noun, or the noun itself when it takes no mark. */
function frenchPlural(word: string): string {
  if (/[sxz]$/i.test(word)) return word;
  if (/eau$/i.test(word)) return `${word}x`;
  if (/al$/i.test(word)) return `${word.slice(0, -2)}aux`;
  return `${word}s`;
}

/**
 * What a kitchen usually takes each approximate measure to be.
 *
 * Offered as words for a note, never as the quantity: writing "2 teaspoons"
 * where the page wrote "4 pinches" puts a figure on the page it never claimed,
 * and the cook is the one holding the pinch.
 */
const APPROXIMATE_EQUIVALENT: Record<string, string> = {
  capful: "commonly taken as about a tablespoon, the size of a bottle cap",
  glug: "commonly taken as about two tablespoons poured free-hand",
  dollop: "commonly taken as about a heaped tablespoon",
  pinch: "commonly taken as about half a teaspoon",
  dash: "commonly taken as about an eighth of a teaspoon",
  splash: "commonly taken as about a tablespoon",
  handful: "commonly taken as about a quarter of a cup",
  knob: "commonly taken as about a tablespoon of butter",
  drizzle: "commonly taken as about a teaspoon poured in a thin line",
  pincee: "commonly taken as about half a teaspoon",
  poignee: "commonly taken as about a quarter of a cup",
  bouchon: "commonly taken as about a tablespoon, the size of a bottle cap",
  goutte: "commonly taken as a single drop",
  filet: "commonly taken as about a teaspoon poured in a thin line",
  noix: "commonly taken as about a tablespoon of butter",
  louche: "commonly taken as about half a cup",
  soupcon: "commonly taken as the smallest amount a spoon tip carries",
};

/** The everyday equivalence for an approximate measure, when there is a settled one. */
export function approximateEquivalent(unit: UnitInfo): string | null {
  return APPROXIMATE_EQUIVALENT[normalizeUnitKey(unit.canonical)] ?? null;
}

/**
 * Ladders, used to keep a scaled amount at a human size.
 *
 * Multiplying a recipe by thirty is arithmetically fine and practically poor:
 * "8335 g of sugar" is correct, and nobody weighs eight thousand grams. Each
 * measured unit therefore knows the unit above and below it, so a large amount
 * climbs the ladder and a small one comes back down. Each system keeps its own
 * ladder, because converting between them changes what the recipe said.
 */
interface UnitStep {
  /** Unit to switch to, and how many of the current unit it holds. */
  to: string;
  per: number;
  /** Which vocabulary the step's spelling comes from. */
  language: Language;
}

const PROMOTIONS: Record<string, UnitStep> = {
  mg: { to: "g", per: 1000, language: "en" },
  g: { to: "kg", per: 1000, language: "en" },
  ml: { to: "l", per: 1000, language: "en" },
  cl: { to: "l", per: 100, language: "en" },
  dl: { to: "l", per: 10, language: "en" },
  oz: { to: "lb", per: 16, language: "en" },
  ounce: { to: "pound", per: 16, language: "en" },
  "fl oz": { to: "pint", per: 20, language: "en" },
  pint: { to: "quart", per: 2, language: "en" },
  quart: { to: "gallon", per: 4, language: "en" },
};

const DEMOTIONS: Record<string, UnitStep> = {
  // Spoons and cups hold a fixed volume, so a share of one is stated in the
  // smaller spoon rather than as a fraction no measuring set carries. The
  // spelling of the step matches the spelling of the unit it comes from, so a
  // line written in abbreviations stays in abbreviations, and a French line
  // stays in French.
  cup: { to: "tablespoon", per: 16, language: "en" },
  tablespoon: { to: "teaspoon", per: 3, language: "en" },
  tbsp: { to: "tsp", per: 3, language: "en" },
  "cuillere a soupe": { to: "cuillere a cafe", per: 3, language: "fr" },
  tasse: { to: "cuillere a soupe", per: 16, language: "fr" },

  kg: { to: "g", per: 1000, language: "en" },
  g: { to: "mg", per: 1000, language: "en" },
  l: { to: "cl", per: 100, language: "en" },
  dl: { to: "cl", per: 10, language: "en" },
  cl: { to: "ml", per: 10, language: "en" },
  lb: { to: "oz", per: 16, language: "en" },
  pound: { to: "ounce", per: 16, language: "en" },
  gallon: { to: "quart", per: 4, language: "en" },
  quart: { to: "pint", per: 2, language: "en" },
  pint: { to: "fl oz", per: 20, language: "en" },
};

/**
 * The unit one step down the ladder, with how many of it fit in one of the
 * current unit. Null at the bottom of a ladder, where there is nothing smaller
 * to express the amount in.
 */
export function demoteUnit(unit: UnitInfo): { unit: UnitInfo; per: number } | null {
  const step = DEMOTIONS[normalizeUnitKey(unit.canonical)];
  if (!step) return null;
  const target = lookupUnit(step.to, step.language);
  return target ? { unit: target, per: step.per } : null;
}

/**
 * Spoons and cups: a portion, and at the same time a fixed volume. The volume
 * is what lets a share of one be restated in a smaller spoon.
 */
export function isSpoonMeasure(unit: UnitInfo): boolean {
  return /^(cup|tablespoon|Tbsp|teaspoon|tsp|cuillère à soupe|cuillère à café|tasse)$/.test(
    unit.canonical,
  );
}

/** How finely a kitchen can divide one of a counted thing. */
export type Divisibility =
  /** An egg: half of one is not something a cook takes out of the shell. */
  | "whole"
  /** A clove, a tin, a sachet: half of it is a quantity a kitchen can take. */
  | "half"
  /** An onion, an apple: a knife takes it to quarters. */
  | "quarter";

/**
 * How far one of a measure divides.
 *
 * A measure divides as far as half of what it holds stays a quantity a kitchen
 * can take out. Almost always it does: what a tin, a jar, a sachet, a bottle or
 * a carton holds is
 * poured, weighed or spooned, so half a tin of tomatoes is half a tin of
 * tomatoes and the rest keeps in the fridge. A leaf of gelatine and a sprig of
 * thyme are cut with a knife. A handful is halved by taking less.
 *
 * What does not divide is what has no half a cook can measure out. An egg is
 * the case: half of one means beating it and weighing the result, which no
 * recipe asks for, and the same holds for a yolk and a white on their own. That
 * is a fact about the contents, so it is decided where the item is named rather
 * than here.
 *
 * A gesture keeps its own answer. A pincée, a poignée, a pinch is the amount a
 * hand produces in one go, and there is no half of a hand: the size of one is
 * the cook's and the count is the whole of what the measure can say, so the
 * count lands on a whole and the line reports that it moved.
 *
 * A doubtful word takes the half. A cook reading "1/2 sachet" knows what to do
 * with it, so a measure answers `half` apart from the few named below, and the
 * one thing that does not divide is decided from the item's own name.
 */
export function unitDivisibility(unit: UnitInfo): Divisibility {
  if (unit.kind === "approximate") return "whole";
  return QUARTERED_MEASURE.test(unit.canonical) ? "quarter" : "half";
}

/**
 * Measures a cook takes a quarter of.
 *
 * The half is as far as the criterion goes on its own, because that is the
 * share most measures give up by eye. These answer the size question
 * differently, in two ways. A pot de crème fraîche, a bouteille, a jar and a
 * block hold enough that a quarter is still a portion someone serves and the
 * rest still keeps: a quarter of a pot is a couple of spoonfuls, a quarter of a
 * bouteille is a glass, a quarter of a block of tofu is a piece cut on a board.
 * A tranche is already cut off something larger, and the board that produced
 * one takes a corner off it in the same gesture: a quarter of a tranche de pain
 * is a crouton.
 *
 * Each measure is listed in either language, because how far one of them
 * divides has nothing to do with the words a page uses for it.
 *
 * The pattern is exported because any of these words can stand where the
 * measure goes or inside the name of what is counted, and both readings answer
 * to the same list.
 */
export const QUARTERED_MEASURE =
  /\b(pots?|bouteilles?|bottles?|jars?|blocs?|blocks?|tranches?|slices?)\b/i;

/**
 * True for a measure that counts pieces without saying anything about them.
 *
 * "ea" is short for "each": it announces that the figure is a count of objects
 * and names no measure of any one of them. How far the count divides therefore
 * belongs to the thing standing beside it, and the marker itself has nothing to
 * say in a line a cook reads.
 */
export function countsBarePieces(unit: UnitInfo): boolean {
  return unit.canonical === "ea";
}

export interface ChosenUnit {
  unit: UnitInfo;
  /** What to multiply an amount in the original unit by to express it in this one. */
  ratio: number;
}

/**
 * Choose the unit a cook would actually write a quantity in, and say how to get
 * there.
 *
 * A ratio rather than a converted number, because a range has two bounds and
 * they have to end up in the same unit: converting each on its own gives the
 * unreadable "13 oz to 1.5 pounds". The caller picks one bound to choose from,
 * then applies the ratio to both.
 *
 * Demotion repeats while the amount is under one, so a quantity divided a
 * thousandfold walks all the way down its ladder instead of rounding away.
 * Promotion takes one step, at a full unit of the step above, so 999 g stays
 * grams and 1000 g becomes a kilo.
 *
 * Both directions ask whether the unit can hold the figure. A kitchen reads two
 * decimals and no more, so 2468 g written in kilos is 2.47 and the eight grams
 * are gone. A quantity the bigger unit cannot state stays where the page wrote
 * it, and a quantity the page's own unit cannot state walks down to the one that
 * can, so the same mass comes out the same however the page spelled it: "1234 g"
 * and "1 kg 234" are one quantity and answer with one figure.
 */
export function chooseReadableUnit(unit: UnitInfo, amount: number): ChosenUnit {
  if (unit.kind !== "measured" || !Number.isFinite(amount) || amount <= 0) {
    return { unit, ratio: 1 };
  }

  let current = unit;
  let ratio = 1;

  while (amount * ratio < 1) {
    const step = demoteUnit(current);
    if (!step) break;
    ratio *= step.per;
    current = step.unit;
  }

  const up = PROMOTIONS[normalizeUnitKey(current.canonical)];
  if (up && amount * ratio >= up.per && writesExactly((amount * ratio) / up.per)) {
    const target = lookupUnit(up.to, up.language);
    if (target) {
      ratio /= up.per;
      current = target;
    }
  }

  while (!writesExactly(amount * ratio)) {
    const step = demoteUnit(current);
    if (!step) break;
    ratio *= step.per;
    current = step.unit;
  }

  return { unit: current, ratio };
}

/** Whether a figure survives being written with the two decimals a kitchen reads. */
function writesExactly(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

/**
 * Render a measure for a given amount, choosing singular or plural.
 *
 * The threshold differs by language. English marks the plural above one, so 1.5
 * is plural: "1.5 cups". French takes it from two onwards, so 1,5 stays
 * singular: "1,5 cuillère à soupe".
 */
export function formatUnit(unit: UnitInfo, amount: number, language: Language): string {
  if (unit.symbol) return unit.canonical;
  const singular = language === "fr" ? amount < 2 : amount <= 1;
  if (singular) return unit.canonical;
  return unit.plural ?? `${unit.canonical}s`;
}
