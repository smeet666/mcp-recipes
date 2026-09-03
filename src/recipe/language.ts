/**
 * Which language an ingredient line is written in.
 *
 * A list can hold lines in more than one language at once, because a cook
 * comparing two versions of a dish keeps both in front of them. The language
 * decides how a number is written, how a noun agrees with it, and which
 * vocabulary of measures applies, so it is settled per line rather than once
 * for a whole list.
 */

export type Language = "fr" | "en" | "es";

/** What a caller may ask for: a language, or a reading taken per line. */
export type LanguageChoice = Language | "auto";

/**
 * Structural words, which are the reliable signal.
 *
 * A line names its ingredient in whatever language the page is written in, and
 * an ingredient name travels: a French recipe asks for "Mountain Dew" and an
 * English one for "crème fraîche". The small words that hold a line together do
 * not travel, so "du", "aux" and "of" say more about the line than the name of
 * the food does.
 *
 * Only the words one language alone writes stand here. French and Spanish
 * share "de", "la", "un" and "en", and counting a shared word for one of them
 * would read every Spanish line as French.
 */
const FRENCH_WORDS =
  /(?:^|[\s(])(?:du|des|à|au|aux|le|les|une|quelques|dans|avec|sans|pour|selon|environ)(?=[\s),.]|$)|\bd'|\bl'|\bqu'/iu;

/**
 * The bare article "a" is left out on purpose. French recipes abbreviate
 * "cuillère à soupe" as "c a s", dropping the accent, and counting that "a" as
 * English evidence would send a French line through the English vocabulary.
 */
const ENGLISH_WORDS =
  /(?:^|[\s(])(?:of|an|the|and|with|without|for|into|about|each|per|plus|freshly|finely|roughly|coarsely|optional)(?=[\s),.]|$)/iu;

/**
 * Spanish is written with its own articles and its own past participles, and a
 * recipe line spends most of its words on the second: "picado", "troceado" and
 * "rallado" say how the ingredient arrives in the pan.
 */
const SPANISH_WORDS =
  /(?:^|[\s(])(?:del|el|los|las|una|unos|unas|con|sin|para|al|y|según|aproximadamente|picad[oa]s?|tro?cead[oa]s?|rallad[oa]s?|molid[oa]s?|cortad[oa]s?|pelad[oa]s?|opcional)(?=[\s),.]|$)/iu;

/**
 * The words French and Spanish both write.
 *
 * They tell the two apart from English and say nothing between them, so they
 * count for both and cancel out, leaving whatever else the line carries to
 * decide.
 */
const ROMANCE_WORDS = /(?:^|[\s(])(?:de|la|un|en)(?=[\s),.]|$)/iu;

/** Letters only French writes, which no Spanish or English word borrows. */
const FRENCH_LETTERS = /[àâçèêëîïôùûœ]/iu;

/** Letters only Spanish writes. */
const SPANISH_LETTERS = /[áíóúñ¿¡]/iu;

/** Letters both write, which place a line in neither. */
const ROMANCE_LETTERS = /[éü]/iu;

/**
 * Foods each language names its own way.
 *
 * Weak evidence, and deliberately so: a name is the part of a line most likely
 * to be borrowed, and a structural word outranks any number of these. It is
 * enough to settle a line that carries nothing else, such as "6 oeufs", where
 * every other signal is silent.
 *
 * A name two of the languages spell alike is in none of these lists. Spanish
 * writes "pasta" as English does and "miel" as French does, and either would
 * settle a line for the wrong side.
 */
const FRENCH_FOODS =
  /\b(?:oeufs?|œufs?|sel|poivre|sucres?|farine|beurre|lait|crème|creme|huile|ail|oignons?|fromage|pain|poulet|boeuf|bœuf|riz|pâtes|pates|jambon|citrons?|pommes?|vin|eau|persil|thym|jaunes?|blancs?)\b/iu;

const ENGLISH_FOODS =
  /\b(?:eggs?|salt|pepper|sugar|flour|butter|milk|cream|oil|garlic|onions?|cheese|bread|chicken|beef|rice|pasta|ham|lemons?|apples?|wine|water|parsley|thyme|honey|yolks?|whites?)\b/iu;

const SPANISH_FOODS =
  /\b(?:huevos?|sal|pimienta|azúcar|azucar|harina|mantequilla|leche|nata|aceite|ajos?|cebollas?|queso|pollo|ternera|cerdo|arroz|jamón|jamon|limones|limón|limon|manzanas?|patatas?|vino|agua|perejil|tomillo|yemas?|claras?)\b/iu;

/** Weight of one structural signal, which outranks a vocabulary match. */
const STRUCTURAL = 3;
/** Weight of a measure only one of the vocabularies carries. */
const VOCABULARY = 2;
/** Weight of a food name, which is the signal a line borrows most readily. */
const NAME = 1;

export interface LanguageEvidence {
  language: Language;
  french: number;
  english: number;
  spanish: number;
}

/** Whether each vocabulary recognised a measure standing in the line. */
export interface UnitEvidence {
  frenchUnit: boolean;
  englishUnit: boolean;
  spanishUnit: boolean;
}

const NO_UNIT: UnitEvidence = { frenchUnit: false, englishUnit: false, spanishUnit: false };

/**
 * Read the language off one line.
 *
 * The unit flags say whether each vocabulary recognised a measure in the line.
 * They count for less than a structural word, because a French line can name an
 * English measure in passing: "1 dose (cup) de Mountain Dew" is French with an
 * English gloss inside it, and the "de" is what settles it.
 *
 * English is the answer when nothing points anywhere, which is what an
 * ingredient with no small words and no measure gets. Between French and
 * Spanish an equal score can only come from evidence the two share, and shared
 * evidence is written the same way in both, so it is read as French.
 */
export function readLanguage(line: string, evidence: UnitEvidence = NO_UNIT): LanguageEvidence {
  let french = 0;
  let english = 0;
  let spanish = 0;

  if (ROMANCE_WORDS.test(line)) {
    french += STRUCTURAL;
    spanish += STRUCTURAL;
  }
  if (ROMANCE_LETTERS.test(line)) {
    french += STRUCTURAL;
    spanish += STRUCTURAL;
  }
  if (FRENCH_WORDS.test(line)) {
    french += STRUCTURAL;
  }
  if (FRENCH_LETTERS.test(line)) {
    french += STRUCTURAL;
  }
  if (ENGLISH_WORDS.test(line)) {
    english += STRUCTURAL;
  }
  if (SPANISH_WORDS.test(line)) {
    spanish += STRUCTURAL;
  }
  if (SPANISH_LETTERS.test(line)) {
    spanish += STRUCTURAL;
  }
  if (evidence.frenchUnit) {
    french += VOCABULARY;
  }
  if (evidence.englishUnit) {
    english += VOCABULARY;
  }
  if (evidence.spanishUnit) {
    spanish += VOCABULARY;
  }
  if (FRENCH_FOODS.test(line)) {
    french += NAME;
  }
  if (ENGLISH_FOODS.test(line)) {
    english += NAME;
  }
  if (SPANISH_FOODS.test(line)) {
    spanish += NAME;
  }

  return { language: winner(french, english, spanish), french, english, spanish };
}

function winner(french: number, english: number, spanish: number): Language {
  if (french >= spanish && french > english) {
    return "fr";
  }
  if (spanish > english) {
    return "es";
  }
  return "en";
}

/** The language a list is written in, when a caller wants one answer for all of it. */
export function readListLanguage(lines: string[]): Language {
  let french = 0;
  let english = 0;
  let spanish = 0;
  for (const line of lines) {
    const evidence = readLanguage(line);
    french += evidence.french;
    english += evidence.english;
    spanish += evidence.spanish;
  }
  return winner(french, english, spanish);
}
