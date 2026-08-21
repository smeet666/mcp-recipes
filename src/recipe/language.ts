/**
 * Which language an ingredient line is written in.
 *
 * A list can hold French lines and English lines at once, because a cook
 * comparing two versions of a dish keeps both in front of them. The language
 * decides how a number is written, how a noun agrees with it, and which
 * vocabulary of measures applies, so it is settled per line rather than once
 * for a whole list.
 */

export type Language = "fr" | "en";

/** What a caller may ask for: a language, or a reading taken per line. */
export type LanguageChoice = Language | "auto";

/**
 * Structural words, which are the reliable signal.
 *
 * A line names its ingredient in whatever language the page is written in, and
 * an ingredient name travels: a French recipe asks for "Mountain Dew" and an
 * English one for "crème fraîche". The small words that hold a line together do
 * not travel, so "de", "à" and "of" say more about the line than the name of
 * the food does.
 */
const FRENCH_WORDS =
  /(?:^|[\s(])(?:de|du|des|à|au|aux|la|le|les|un|une|quelques|dans|avec|sans|pour|selon|environ)(?=[\s),.]|$)|\bd'|\bl'|\bqu'/iu;

/**
 * The bare article "a" is left out on purpose. French recipes abbreviate
 * "cuillère à soupe" as "c a s", dropping the accent, and counting that "a" as
 * English evidence would send a French line through the English vocabulary.
 */
const ENGLISH_WORDS =
  /(?:^|[\s(])(?:of|an|the|and|with|without|for|into|about|each|per|plus|freshly|finely|roughly|coarsely|optional)(?=[\s),.]|$)/iu;

/** Letters English does not write, which no ingredient name borrows either. */
const FRENCH_LETTERS = /[àâäçéèêëîïôöùûüœ]/iu;

/**
 * Foods each language names its own way.
 *
 * Weak evidence, and deliberately so: a name is the part of a line most likely
 * to be borrowed, and a structural word outranks any number of these. It is
 * enough to settle a line that carries nothing else, such as "6 oeufs", where
 * every other signal is silent.
 */
const FRENCH_FOODS =
  /\b(?:oeufs?|œufs?|sel|poivre|sucres?|farine|beurre|lait|crème|creme|huile|ail|oignons?|fromage|pain|poulet|boeuf|bœuf|riz|pâtes|pates|jambon|citrons?|pommes?|vin|eau|persil|thym|miel|jaunes?|blancs?)\b/iu;

const ENGLISH_FOODS =
  /\b(?:eggs?|salt|pepper|sugar|flour|butter|milk|cream|oil|garlic|onions?|cheese|bread|chicken|beef|rice|pasta|ham|lemons?|apples?|wine|water|parsley|thyme|honey|yolks?|whites?)\b/iu;

/** Weight of one structural signal, which outranks a vocabulary match. */
const STRUCTURAL = 3;
/** Weight of a measure only one of the two vocabularies carries. */
const VOCABULARY = 2;
/** Weight of a food name, which is the signal a line borrows most readily. */
const NAME = 1;

export interface LanguageEvidence {
  language: Language;
  french: number;
  english: number;
}

/**
 * Read the language off one line.
 *
 * `frenchUnit` and `englishUnit` say whether each vocabulary recognised a
 * measure in the line. They count for less than a structural word, because a
 * French line can name an English measure in passing: "1 dose (cup) de Mountain
 * Dew" is French with an English gloss inside it, and the "de" is what settles
 * it.
 *
 * English is the answer when nothing points either way, which is what an
 * ingredient with no small words and no measure gets.
 */
export function readLanguage(
  line: string,
  evidence: { frenchUnit: boolean; englishUnit: boolean } = {
    frenchUnit: false,
    englishUnit: false,
  },
): LanguageEvidence {
  let french = 0;
  let english = 0;

  if (FRENCH_WORDS.test(line)) {
    french += STRUCTURAL;
  }
  if (FRENCH_LETTERS.test(line)) {
    french += STRUCTURAL;
  }
  if (ENGLISH_WORDS.test(line)) {
    english += STRUCTURAL;
  }
  if (evidence.frenchUnit) {
    french += VOCABULARY;
  }
  if (evidence.englishUnit) {
    english += VOCABULARY;
  }
  if (FRENCH_FOODS.test(line)) {
    french += NAME;
  }
  if (ENGLISH_FOODS.test(line)) {
    english += NAME;
  }

  return { language: french > english ? "fr" : "en", french, english };
}

/** The language a list is written in, when a caller wants one answer for all of it. */
export function readListLanguage(lines: string[]): Language {
  let french = 0;
  let english = 0;
  for (const line of lines) {
    const evidence = readLanguage(line);
    french += evidence.french;
    english += evidence.english;
  }
  return french > english ? "fr" : "en";
}
