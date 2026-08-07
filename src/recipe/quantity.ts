/**
 * Reading quantities out of ingredient lines, in French and in English.
 *
 * Recipes are written as prose rather than as data: "200 g de farine",
 * "450 g (1 pound) spaghetti", "3 ¼ cups quick oats", "sel". Everything
 * downstream depends on reading these correctly, so the parser is deliberate
 * about what it recognises and returns nothing rather than guessing.
 */

import type { Language, LanguageChoice } from "./language.js";
import { readLanguage } from "./language.js";
import type { UnitInfo } from "./units.js";
import {
  lookupUnit,
  normalizeUnitKey,
  readContainerLoad,
  readPartitiveMeasure,
  unitKeys,
} from "./units.js";

export interface ParsedQuantity {
  amount: number;
  /** Characters consumed from the start of the line. */
  length: number;
}

/** Unicode vulgar fractions, which hand-written recipes use freely. */
const VULGAR_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const VULGAR_CLASS = Object.keys(VULGAR_FRACTIONS).join("");

/**
 * Read a leading amount.
 *
 * Handles, in order of precedence: a whole number followed by a fraction, in
 * either the glyph form "3 ¼" or the written form "1 1/2"; a bare fraction; a
 * bare glyph; and a decimal. French writes the decimal with a comma, so "1,5"
 * is one and a half there and two separate readings in English, where a comma
 * groups thousands.
 *
 * Returns null when the line does not start with a number, which is the normal
 * case for "sel" or "Freshly ground pepper".
 */
export function parseLeadingQuantity(text: string, language: Language): ParsedQuantity | null {
  const trimmed = text.trimStart();
  const offset = text.length - trimmed.length;

  // "3 ¼" and "3¼" before the bare "3", so the longest reading wins.
  const mixedGlyph = new RegExp(`^(\\d+)\\s*([${VULGAR_CLASS}])`).exec(trimmed);
  if (mixedGlyph) {
    const whole = Number(mixedGlyph[1]);
    const fraction = VULGAR_FRACTIONS[mixedGlyph[2]!]!;
    return { amount: whole + fraction, length: offset + mixedGlyph[0].length };
  }

  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/.exec(trimmed);
  if (mixed) {
    const denominator = Number(mixed[3]);
    if (denominator !== 0) {
      return {
        amount: Number(mixed[1]) + Number(mixed[2]) / denominator,
        length: offset + mixed[0].length,
      };
    }
  }

  const fraction = /^(\d+)\s*\/\s*(\d+)/.exec(trimmed);
  if (fraction) {
    const denominator = Number(fraction[2]);
    // A denominator of zero is not a quantity. Reading the numerator alone
    // would leave "/0" in the item name and scale a number nobody wrote.
    if (denominator === 0) return null;
    return { amount: Number(fraction[1]) / denominator, length: offset + fraction[0].length };
  }

  const glyph = trimmed[0];
  if (glyph && glyph in VULGAR_FRACTIONS) {
    return { amount: VULGAR_FRACTIONS[glyph]!, length: offset + 1 };
  }

  // English groups thousands with the comma it never uses as a decimal mark, so
  // "1,500 g" is fifteen hundred grams. Reading the digits up to the comma and
  // stopping there answers 1 for a line that said 1500, and leaves ",500 g"
  // behind in the item name.
  const decimal = (
    language === "fr" ? /^(\d+(?:[.,]\d+)?)/ : /^(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/
  ).exec(trimmed);
  if (decimal) {
    const written = decimal[1]!;
    const amount = Number(
      language === "fr" ? written.replace(",", ".") : written.replace(/,/g, ""),
    );
    if (Number.isFinite(amount)) return { amount, length: offset + decimal[0].length };
  }

  if (language === "en") {
    const written = parseWrittenFraction(trimmed);
    if (written) return { amount: written.amount, length: offset + written.length };
  }

  return null;
}

/** How many of the part a line names: "two thirds", "a quarter", "half". */
const WRITTEN_NUMERATORS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3 };

/** What the part is a part of. */
const WRITTEN_DENOMINATORS: Record<string, number> = {
  half: 2,
  halves: 2,
  third: 3,
  thirds: 3,
  quarter: 4,
  quarters: 4,
  fourth: 4,
  fourths: 4,
};

/**
 * Read a fraction an English line spells out, as in "half a bottle" or "two
 * thirds of a cup".
 *
 * Recipes write the small fractions in words as readily as in figures, and a
 * line opening on one of them carries an amount like any other. The numerator
 * is optional because "half" alone is the common form.
 *
 * What follows decides whether the words are a quantity at all. A share of one
 * thing, "half a lemon" or "two thirds of a cup", states an amount of its own.
 * A share of a definite thing, "half of the dough", points back at an amount
 * stated elsewhere, and multiplying it would answer with a number that belongs
 * to another line.
 */
function parseWrittenFraction(text: string): ParsedQuantity | null {
  const match =
    /^(?:(a|an|one|two|three)[\s-]+)?(halves|half|thirds|third|quarters|quarter|fourths|fourth)\b/i.exec(
      text,
    );
  if (!match) return null;

  const numerator = match[1] ? WRITTEN_NUMERATORS[match[1].toLowerCase()] : 1;
  const denominator = WRITTEN_DENOMINATORS[match[2]!.toLowerCase()];
  if (!numerator || !denominator) return null;

  const rest = text
    .slice(match[0].length)
    .replace(/^\s*of\s+/i, "")
    .trimStart();
  if (!/^an?\s/i.test(rest) && !takeUnit(rest, "en").unit) return null;

  return { amount: numerator / denominator, length: match[0].length };
}

export interface ParsedRange extends ParsedQuantity {
  /** Upper bound. `amount` carries the lower one. */
  max: number;
  /** How the range was written, so the rewrite can keep the same shape. */
  separator: string;
}

/**
 * Read a leading range such as "225–500", "3-4", "2 to 3" or "2 à 3".
 *
 * Recipes use ranges where the exact amount is the cook's call, and both bounds
 * describe the same quantity. Reading only the first one is worse than reading
 * neither: the second number survives unscaled into the answer and contradicts
 * it.
 *
 * A descending pair is not a range. "1/2 3" is two amounts the parser has no
 * business joining, and a dash between two numbers is a range only when the
 * second is the larger.
 */
export function parseLeadingRange(text: string, language: Language): ParsedRange | null {
  const low = parseLeadingQuantity(text, language);
  if (!low) return null;

  const after = text.slice(low.length);
  // A written separator needs whitespace around it, so "5 tomatoes" is not read
  // as "5 to" followed by an unreadable second bound.
  const written = language === "fr" ? /^\s+(à|a|ou)\s+/i : /^\s+(to|or)\s+/i;
  const separator = written.exec(after) ?? /^\s*(–|—|-)\s*/.exec(after);
  if (!separator) return null;

  const high = parseLeadingQuantity(after.slice(separator[0].length), language);
  if (!high || high.amount <= low.amount) return null;

  return {
    amount: low.amount,
    max: high.amount,
    separator: separator[1]!,
    length: low.length + separator[0].length + high.length,
  };
}

/** One amount with its measure, as the line wrote it. */
export interface Measure {
  amount: number;
  /** Upper bound when the measure is a range, null otherwise. */
  amountMax: number | null;
  /** The word or sign a range was written with. */
  rangeSeparator: string | null;
  unit: UnitInfo | null;
}

export interface ParsedIngredient {
  /** The line exactly as it was given. */
  original: string;
  /** The language the line was read in. */
  language: Language;
  amount: number | null;
  /**
   * Upper bound when the line gives a range, as in "225–500 g". Null for a
   * single amount. `amount` holds the lower bound, so the two must be scaled
   * together: multiplying only one turns "225–500" into the nonsense "450–500".
   */
  amountMax: number | null;
  rangeSeparator: string | null;
  unit: UnitInfo | null;
  /**
   * The same quantity restated in another system, which recipes give in
   * brackets: "450 g (1 pound)". Left unscaled it would contradict the amount
   * beside it, so it is parsed and scaled with the rest.
   */
  alternates: Measure[];
  /**
   * How the line introduced its equivalents: in brackets, as in "450 g (1
   * pound)", or after a slash, as in "500 g / 1.1 lb". The rewrite puts them
   * back the way the line offered them.
   */
  alternateStyle: "bracket" | "slash" | null;
  /** What the amount and the measure apply to, such as "farine" or "egg yolks". */
  item: string;
  /**
   * The article the amount was read from, as in "une" in "une pincée de sel".
   * Null when the line wrote a figure.
   */
  articleWord: string | null;
  /**
   * How many things one of the word the line counted with stands for, as in the
   * twelve of "2 dozen mushrooms". Null when the line counted the things
   * themselves. `amount` already holds the product, so this is what says where
   * the figure came from.
   */
  countMultiplier: number | null;
}

/** Articles a French line writes where a digit would go, and what they count as. */
const FRENCH_ARTICLES: Record<string, number> = { un: 1, une: 1, quelques: 3 };

/**
 * Take a measure off the front of `text`, longest spelling first, so "cuillère
 * à soupe" is not read as "cuillère" with "à soupe" spilling into the item
 * name, and "fluid ounce" is not read as "ounce" with "fluid" left dangling.
 */
export function takeUnit(text: string, language: Language): { unit: UnitInfo | null; rest: string } {
  const normalized = normalizeUnitKey(text);
  for (const key of unitKeys(language)) {
    if (normalized !== key && !normalized.startsWith(`${key} `)) continue;
    const unit = lookupUnit(key, language);
    if (!unit) continue;
    // Consume the same number of words from the original text, which may be
    // spelled with accents the normalized key has lost.
    const wordCount = key.split(" ").length;
    const words = text.trim().split(/\s+/);
    return { unit, rest: words.slice(wordCount).join(" ") };
  }

  if (language === "en") {
    const words = text.trimStart().split(/\s+/);
    const load = words[0] ? readContainerLoad(words[0]) : null;
    if (load) return { unit: load, rest: words.slice(1).join(" ") };
  }

  return { unit: null, rest: text };
}

/**
 * A measure inside brackets can be stated in the other language's vocabulary: a
 * French page glosses grams in ounces, and an English page glosses cups in
 * millilitres. The line's own language is tried first, so a word both
 * vocabularies carry keeps the spelling and the plural of the line it sits in.
 */
function takeUnitEitherLanguage(
  text: string,
  language: Language,
): { unit: UnitInfo | null; rest: string } {
  const first = takeUnit(text, language);
  if (first.unit) return first;
  return takeUnit(text, language === "fr" ? "en" : "fr");
}

/**
 * Decide which language a line is written in, using the small words that hold
 * it together and whether each vocabulary recognises the measure it names.
 */
export function detectLanguage(line: string): Language {
  const text = line.trim();
  // Whatever a leading figure, fraction or article occupies, so the probe looks
  // at the position a measure would stand in.
  const afterFigures = text.replace(/^[\s\d.,/½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞\-–—]+/u, "").trimStart();
  const afterArticle = afterFigures.replace(/^(?:un|une|quelques|of\s+an?|an?)\s+/iu, "");

  const frenchUnit = takeUnit(afterArticle, "fr").unit !== null;
  const englishUnit = takeUnit(afterArticle, "en").unit !== null;

  return readLanguage(text, { frenchUnit, englishUnit }).language;
}

/**
 * Split an ingredient line into amount, measure, bracketed equivalents and
 * item.
 *
 * A missing amount is normal and not an error: many lines are just "sel". A
 * missing measure is equally normal and means the item is counted, as in
 * "5 egg yolks".
 */
export function parseIngredient(line: string, choice: LanguageChoice = "auto"): ParsedIngredient {
  const original = line;
  const text = line.trim();
  const language = choice === "auto" ? detectLanguage(text) : choice;

  const empty: ParsedIngredient = {
    original,
    language,
    amount: null,
    amountMax: null,
    rangeSeparator: null,
    unit: null,
    alternates: [],
    alternateStyle: null,
    item: text,
    articleWord: null,
    countMultiplier: null,
  };

  const range = parseLeadingRange(text, language);
  const article = range ? null : readArticle(text, language);
  const quantity = range ?? parseLeadingQuantity(text, language) ?? article;
  if (!quantity) return empty;

  let rest = text.slice(quantity.length).trimStart();
  // "two thirds of a cup" names a share of one cup, and the measure stands
  // behind the preposition and the article that introduce it.
  if (language === "en") rest = rest.replace(/^(?:of\s+)?an?\s+/i, "");

  // "2 dozen mushrooms" counts mushrooms, twelve to the dozen, so the multiplier
  // is folded into the amount and the line goes on to be read as the count of a
  // thing it now is.
  const multiplier = readCountMultiplier(rest);
  if (multiplier) rest = multiplier.rest;
  const times = multiplier?.times ?? 1;

  const leading = takeLeadingUnit(rest, language, quantity === article);
  rest = leading.rest;

  const bracketed = takeAlternates(rest, language);
  rest = bracketed.rest;

  const slashed = bracketed.measures.length > 0 ? null : takeSlashAlternates(rest, language);
  if (slashed) rest = slashed.rest;

  return {
    original,
    language,
    amount: quantity.amount * times,
    amountMax: range === null ? null : range.max * times,
    rangeSeparator: range?.separator ?? null,
    unit: leading.unit,
    alternates: slashed ? slashed.measures : bracketed.measures,
    alternateStyle: slashed ? "slash" : bracketed.measures.length > 0 ? "bracket" : null,
    item: stripItemLead(rest, language),
    articleWord: quantity === article ? (article?.word ?? null) : null,
    countMultiplier: multiplier?.times ?? null,
  };
}

interface ParsedArticle extends ParsedQuantity {
  /** The article as the line wrote it. */
  word: string;
}

/**
 * Read the article a line uses in place of the figure one, as in "une pincée de
 * sel" or "a pinch of salt".
 *
 * The article counts as a quantity only when a measure follows it, because that
 * is where it stands for a number: "une pincée" is one pinch and "a pinch" is
 * one pinch, while "un oignon" and "a ripe apple" name a vegetable and a fruit
 * and no amount at all. Reading the second as the first would multiply a number
 * the line never wrote.
 */
function readArticle(text: string, language: Language): ParsedArticle | null {
  /** A measure or a multiplier is what makes the article stand for a number. */
  const counts = (rest: string) =>
    takeLeadingUnit(rest, language, true).unit !== null || readCountMultiplier(rest) !== null;

  if (language === "fr") {
    const match = /^\s*(un|une|quelques)\b\s*/i.exec(text);
    if (!match) return null;
    if (!counts(text.slice(match[0].length))) return null;
    const word = match[1]!;
    return { amount: FRENCH_ARTICLES[word.toLowerCase()]!, length: match[0].length, word };
  }

  const article = /^an?\s+/i.exec(text);
  if (!article) return null;
  if (!counts(text.slice(article[0].length))) return null;
  return { amount: 1, length: article[0].length, word: article[0].trim() };
}

/**
 * Words that say how many things a number stands for, rather than how much of
 * something one of them holds.
 *
 * A dozen, and a douzaine, is twelve of whatever is being counted. "2 dozen
 * mushrooms" therefore asks for twenty-four mushrooms, and the answer divides
 * the way a mushroom does. Reading the word as a measure gives "1 1/2 dozen",
 * which is not a count a kitchen works with, and it hands the question of
 * divisibility to a word that names no food.
 */
const COUNT_MULTIPLIERS: Record<string, number> = {
  dozen: 12,
  dozens: 12,
  douzaine: 12,
  douzaines: 12,
};

/** The multiplier a line opens with, and what stands after it. */
function readCountMultiplier(text: string): { times: number; rest: string } | null {
  const match = /^\s*(\p{L}+)\s+/u.exec(text);
  if (!match) return null;

  const times = COUNT_MULTIPLIERS[normalizeUnitKey(match[1]!)];
  if (times === undefined) return null;
  return { times, rest: text.slice(match[0].length) };
}

/**
 * Take the measure a line opens with, allowing for the ones no vocabulary can
 * list.
 *
 * French names a measure by the container followed by the partitive that
 * introduces what is measured, and that reading is offered only where the line
 * wrote an article instead of a digit: "un bouchon de rhum" asks for an amount,
 * while "1 piment de Cayenne" asks for a chilli whose variety happens to be
 * introduced the same way.
 */
function takeLeadingUnit(
  text: string,
  language: Language,
  fromArticle: boolean,
): { unit: UnitInfo | null; rest: string } {
  const taken = takeUnit(text, language);
  if (taken.unit) return taken;

  if (language === "fr" && fromArticle) {
    const measure = readPartitiveMeasure(text);
    if (measure) return { unit: measure.unit, rest: measure.rest };
  }

  return taken;
}

/**
 * Drop the preposition and the article that stand between a measure and what it
 * measures.
 *
 * "200 g de farine" reads better as item "farine" than "de farine", and
 * "2 heads of garlic" names the same thing as "2 heads garlic".
 *
 * The article goes with the preposition. "2/3 d'un flacon" names a share of one
 * flacon, and once the share has been multiplied the count sits where "un"
 * stood. Leaving the article behind produces "4 un flacon", which reads as
 * broken text rather than as a quantity.
 */
function stripItemLead(text: string, language: Language): string {
  if (language === "fr") {
    return text
      .replace(/^(?:de\s+la\s+|de\s+l'|d'|de\s+|du\s+|des\s+)/i, "")
      .replace(/^(?:une|un)\s+/i, "")
      .trim();
  }
  return text
    .replace(/^of\s+/i, "")
    .replace(/^an?\s+/i, "")
    .trim();
}

/**
 * Read a bracketed group of equivalent measures, as in "(1 pound)" or
 * "(500 g / 1.1 lb)".
 *
 * The group is only taken when every part of it reads as an amount with a
 * measure. A bracket holding a remark, as in "(the riper the better)" or
 * "(cup)", stays in the item text where it belongs, because scaling it would
 * mean scaling prose.
 */
function takeAlternates(text: string, language: Language): { measures: Measure[]; rest: string } {
  if (!text.startsWith("(")) return { measures: [], rest: text };
  const close = text.indexOf(")");
  if (close < 0) return { measures: [], rest: text };

  const inside = text.slice(1, close);
  const parts = inside.split("/").map((part) => part.trim());
  const measures: Measure[] = [];

  for (const part of parts) {
    const range = parseLeadingRange(part, language);
    const quantity = range ?? parseLeadingQuantity(part, language);
    if (!quantity) return { measures: [], rest: text };

    const after = takeUnitEitherLanguage(part.slice(quantity.length).trimStart(), language);
    // A trailing word means the bracket is not purely a measure, as in
    // "(1-inch pieces)", so the whole group is left as prose.
    if (!after.unit || after.rest.trim() !== "") return { measures: [], rest: text };

    measures.push({
      amount: quantity.amount,
      amountMax: range?.max ?? null,
      rangeSeparator: range?.separator ?? null,
      unit: after.unit,
    });
  }

  if (measures.length === 0) return { measures: [], rest: text };
  return { measures, rest: text.slice(close + 1).trimStart() };
}

/**
 * Read equivalents a line states after a slash, as in "500 g / 1.1 lb rolled
 * oats", where the item follows the last of them.
 *
 * Both figures name one quantity, so both have to move together: a doubled
 * line reading "1 kg / 1.1 lb" gives two answers a factor of two apart for the
 * same ingredient. A slash followed by anything other than an amount and a
 * measure is prose and stays in the item text.
 */
function takeSlashAlternates(
  text: string,
  language: Language,
): { measures: Measure[]; rest: string } | null {
  const measures: Measure[] = [];
  let rest = text;

  while (rest.startsWith("/")) {
    const after = rest.slice(1).trimStart();
    const range = parseLeadingRange(after, language);
    const quantity = range ?? parseLeadingQuantity(after, language);
    if (!quantity) break;

    const taken = takeUnitEitherLanguage(after.slice(quantity.length).trimStart(), language);
    if (!taken.unit) break;

    measures.push({
      amount: quantity.amount,
      amountMax: range?.max ?? null,
      rangeSeparator: range?.separator ?? null,
      unit: taken.unit,
    });
    rest = taken.rest.trimStart();
  }

  return measures.length > 0 ? { measures, rest } : null;
}

export interface FormatAmountOptions {
  /**
   * Whether to snap near-fractions to 1/4, 1/3, 1/2, 2/3 and 3/4.
   *
   * True for things a cook counts or spoons out: "1/3 cup" is how a kitchen
   * expresses it, "0.33 cup" is not. False for mass and volume, which are
   * decimal by nature: nobody weighs "8 1/3 kg" of sugar, they weigh 8.33 kg.
   */
  fractions?: boolean;
}

/**
 * Render an amount the way a recipe would write it, with the decimal mark the
 * language uses.
 */
export function formatAmount(
  amount: number,
  language: Language,
  options: FormatAmountOptions = {},
): string {
  const decimal = (value: number) => {
    // Two decimals is finer than any kitchen resolves, and for anything smaller
    // than that it is zero. A quantity that survived being divided a
    // thousandfold must not be handed back as none of the ingredient, so below
    // that point the significant digits are what gets written.
    const rounded =
      value !== 0 && Math.abs(value) < 0.01
        ? Number(value.toPrecision(2))
        : Math.round(value * 100) / 100;
    const rendered = String(rounded);
    return language === "fr" ? rendered.replace(".", ",") : rendered;
  };

  if (!Number.isFinite(amount)) return "";
  if (Number.isInteger(amount)) return String(amount);
  if (options.fractions === false) return decimal(amount);

  const whole = Math.floor(amount);
  const rest = amount - whole;
  const known: Array<[number, string]> = [
    [0.25, "1/4"],
    [1 / 3, "1/3"],
    [0.5, "1/2"],
    [2 / 3, "2/3"],
    [0.75, "3/4"],
  ];
  for (const [value, label] of known) {
    if (Math.abs(rest - value) < 0.02) return whole > 0 ? `${whole} ${label}` : label;
  }

  return decimal(amount);
}
