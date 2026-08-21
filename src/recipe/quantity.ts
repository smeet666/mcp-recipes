/**
 * Reading quantities out of ingredient lines, in French and in English.
 *
 * Recipes are written as prose rather than as data: "200 g de farine",
 * "450 g (1 pound) spaghetti", "3 ¼ cups quick oats", "sel". Everything
 * downstream depends on reading these correctly, so the parser is deliberate
 * about what it recognises and returns nothing rather than guessing.
 */

import type { Language, LanguageChoice, LanguageEvidence } from "./language.js";
import { readLanguage } from "./language.js";
import type { UnitInfo } from "./units.js";
import {
  CONTAINER_NOUN,
  demoteUnit,
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
 * Named HTML entities a page writes where the character itself would do.
 *
 * The fractions are the ones that matter: a line reading "3&frac12; cups" holds
 * three and a half cups, and a reader that does not decode it sees three and
 * carries the rest into the item name, where doubling the line loses half a cup
 * without saying so.
 */
const NAMED_ENTITIES: Record<string, string> = {
  frac12: "\u00bd",
  frac13: "\u2153",
  frac23: "\u2154",
  frac14: "\u00bc",
  frac34: "\u00be",
  frac15: "\u2155",
  frac18: "\u215b",
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  deg: "\u00b0",
  times: "\u00d7",
  minus: "\u2212",
  ndash: "\u2013",
  mdash: "\u2014",
};

/**
 * Turn HTML entities back into the characters they stand for.
 *
 * A numeric entity names a code point directly, and the fraction glyphs a
 * recipe uses live well inside the range a page can write that way, so
 * "&#8532;" is two thirds and reads as such once decoded.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (whole, hex: string) => codePoint(parseInt(hex, 16), whole))
    .replace(/&#(\d+);/g, (whole, digits: string) => codePoint(Number(digits), whole))
    .replace(
      /&([a-z][a-z0-9]*);/gi,
      (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole,
    );
}

/** A code point a page named, or the entity as published when it names none. */
function codePoint(value: number, published: string): string {
  if (!Number.isInteger(value) || value < 32 || value > 0x10ffff) return published;
  try {
    return String.fromCodePoint(value);
  } catch {
    return published;
  }
}

/**
 * Empty brackets, which a page leaves behind when it carried a conversion the
 * source did not render. They say nothing and belong in no answer.
 */
const EMPTY_BRACKETS = /\(\s*\)/g;

/**
 * Prepare a published line for reading: entities decoded, empty brackets
 * dropped, runs of spaces squeezed.
 */
function readable(text: string): string {
  return decodeEntities(text).replace(EMPTY_BRACKETS, " ").replace(/\s+/g, " ").trim();
}

/**
 * Signs and words a page puts before a number to say it is not exact.
 *
 * The number behind one of them is still a number, and reading none at all
 * hands back the line with a note saying it carries no quantity, which is
 * untrue. It is read, scaled and given back with the mark the page put on it,
 * so the answer stays as loose as the page was.
 */
const APPROXIMATION_PREFIX: Record<Language, RegExp> = {
  en: /^(?:~|\u2248|about|approx\.?|approximately|around|roughly)\s*/i,
  fr: /^(?:~|\u2248|environ|approximativement|\u00e0 peu pr\u00e8s|a peu pres)\s*/i,
};

/**
 * Words that introduce what a container holds.
 *
 * "1 pot de 500 g de miel" counts pots and says how much honey is in one, so
 * the count is the recipe's to multiply. The partitive standing after the
 * measure is what marks the line as a container and its contents.
 */
const CONTAINER_CONTENTS = /^\s*(?:de\s|d'|du\s|des\s)/i;

/**
 * Whether the measure standing behind an item gives the size of one of them,
 * as in "1 dinde de 3 kg".
 *
 * The count and the measure answer different questions: how many birds, and how
 * heavy one bird is. A cook serving half again as many people takes a heavier
 * bird, so the count belongs to the page rather than to the factor.
 *
 * Read on the item alone, which is what the line counts once its own measure
 * has been taken off it, so "450 g (1 livre) de spaghetti" never reaches here:
 * that line counts grams, and its bracket restates the same quantity.
 */
function statesItemSize(item: string): boolean {
  const attached = /\s+de\s+(?=\d)/i.exec(item);
  if (!attached) return false;

  const named = item.slice(0, attached.index).trim();
  if (!named || /\d/.test(named)) return false;

  return isStatedSize(item.slice(attached.index + attached[0].length));
}

/** A mass or a volume standing on its own, with nothing it is the amount of. */
function isStatedSize(text: string): boolean {
  const size = parseLeadingQuantity(text, "fr");
  if (!size) return false;

  const measure = takeUnit(text.slice(size.length).trimStart(), "fr");
  if (!measure.unit || measure.unit.kind !== "measured") return false;

  return !CONTAINER_CONTENTS.test(measure.rest);
}

/**
 * A second measure a line writes straight after the first, both of them naming
 * one quantity: "1 lb 4 oz beef", "2 kg 300 g de farine", and the French
 * "1 kg 500", which leaves the smaller unit for the reader to supply.
 *
 * What joins the two members is the ladder: the second is written in the unit
 * the first steps down to, and it holds less than one of the first. A measure
 * from another ladder restates the quantity instead of continuing it, and a
 * number followed by a food names a second ingredient; neither is folded in
 * here.
 *
 * The share the second member adds is returned rather than the number itself,
 * so the quantity comes out as one amount in the unit the line opened with:
 * 1 lb 4 oz is 1.25 lb, and doubling it gives the 2.5 lb a butcher weighs.
 * Reading only the first member leaves the rest of the quantity sitting in the
 * item name, where doubling the line loses it.
 *
 * The two members can be joined by a sign or a word saying they add up, as in
 * "2 c. à s. + 1 c. à c.". The joiner is read wherever the same ladder relation
 * holds, since it states outright what juxtaposition leaves implicit.
 */
function takeCompoundMember(
  text: string,
  unit: UnitInfo | null,
  language: Language,
): { adds: number; rest: string } | null {
  if (!unit) return null;
  const step = demoteUnit(unit);
  if (!step) return null;

  const joiner = ADDS_UP.exec(text);
  if (joiner) text = text.slice(joiner[0].length);

  const second = parseLeadingQuantity(text, language);
  if (!second || second.amount <= 0 || second.amount >= step.per) return null;

  const after = text.slice(second.length);
  const measure = takeUnit(after.trimStart(), language);
  if (measure.unit) {
    if (measure.unit.canonical !== step.unit.canonical) return null;
    return { adds: second.amount / step.per, rest: measure.rest.trimStart() };
  }

  // The unwritten form: "1 kg 500" is a kilo and five hundred grams. It is read
  // only where a mass or a volume opened the line, and only where nothing but
  // the partitive follows the figure, so "1 cup 2 eggs" stays two eggs.
  if (unit.kind !== "measured") return null;
  if (!Number.isInteger(second.amount)) return null;
  const trailing = after.trimStart();
  if (trailing !== "" && !/^(?:de\s|d'|du\s|des\s|,)/i.test(trailing)) return null;

  return { adds: second.amount / step.per, rest: trailing };
}

/** How a line joins two measures that add up to one quantity. */
const ADDS_UP = /^\s*(?:\+|et|and|plus)\s+/i;

/**
 * A mark a page opens an ingredient line with, in front of the quantity.
 *
 * A bullet, a dash or a picture of the food is decoration: it says nothing
 * about how much, and a reader stopping at it answers that the line carries no
 * quantity, so a doubled recipe keeps the published amount of whatever the mark
 * stood in front of. It is set aside for reading and put back for writing.
 *
 * The signs that say an amount is loose are excluded, because those do carry a
 * claim about the figure behind them, and the mark has to be followed by space
 * so that a bracket or a decimal point opening a line is left where it is.
 */
const LEADING_DECORATION = /^(?:(?!~|≈|\()[^\p{L}\p{N}\s])+(?=\s)/u;

/** The mark a line opens with, or null when it opens on the quantity. */
function takeDecoration(text: string): string | null {
  const match = LEADING_DECORATION.exec(text);
  return match ? match[0] : null;
}

/** Whether a word names something a food is sold in. */
function namesContainer(word: string | undefined): boolean {
  return word !== undefined && CONTAINER_NOUN.test(normalizeUnitKey(word));
}

/**
 * Measures of time, in either language.
 *
 * An ingredient list carries lines that state a length rather than an amount:
 * a rest, a proof, a marinade, a bake. The factor says how much of the dish to
 * make, and how long a dough takes to rise is no part of that.
 */
const TIME_UNIT: Record<Language, RegExp> = {
  en: /^(?:h|hr|hrs|hours?|mins?|minutes?|secs?|seconds?|days?|nights?|weeks?)\b/i,
  fr: /^(?:h|mn|heures?|mins?|minutes?|secs?|secondes?|jours?|nuits?|semaines?)\b/i,
};

/**
 * The letters a language glues to a figure to make it a rank: the "er" of
 * "1er choix", the "e" of "2e couche", the "st" of "1st choice".
 *
 * A rank names a position rather than an amount, so the line carries nothing to
 * multiply. The letters have to sit against the figure; a line that puts a
 * space between them wrote a number and then a word.
 */
const ORDINAL_SUFFIX = /^(?:ers?|[eè]res?|[eè]mes?|es?|st|nd|rd|th)\b/i;

/**
 * A line that states its amount for one eater.
 *
 * The factor already says how many people the recipe is being made for, so
 * multiplying an amount that is per person applies it twice and asks for twice
 * as much on every plate.
 */
const PER_PERSON: Record<Language, RegExp> = {
  en: /\bper\s+(?:person|head|serving|guest|diner)\b/i,
  fr: /\bpar\s+(?:personne|convive|part|t\u00eate)\b/i,
};

/**
 * Size and preparation words a recipe puts between the number and the measure.
 *
 * "1 small handful" counts handfuls and says how full one was. Reading the
 * adjective as the thing being counted loses the measure, and with it the fact
 * that a handful is held to no better than the hand: the line comes back as an
 * exact count of something the page never named.
 */
const MEASURE_ADJECTIVES: Record<Language, Set<string>> = {
  en: new Set([
    "big",
    "generous",
    "good",
    "heaped",
    "heaping",
    "large",
    "level",
    "medium",
    "scant",
    "small",
  ]),
  fr: new Set([
    "beau",
    "belle",
    "bon",
    "bonne",
    "grand",
    "grande",
    "gros",
    "grosse",
    "petit",
    "petite",
  ]),
};

/** The adjective a line put in front of its measure, and what stands after it. */
function takeMeasureAdjective(
  text: string,
  language: Language,
): { adjective: string | null; rest: string } {
  const match = /^\s*(\p{L}+)\s+/u.exec(text);
  if (!match) return { adjective: null, rest: text };

  const [adjective = ""] = match.slice(1);
  const folded = normalizeUnitKey(adjective);
  // The word can be written in the plural where the count is, as in "2 grosses
  // cuillères", and the list carries the singular.
  const listed =
    MEASURE_ADJECTIVES[language].has(folded) ||
    MEASURE_ADJECTIVES[language].has(folded.replace(/s$/, ""));
  if (!listed) return { adjective: null, rest: text };

  return { adjective, rest: text.slice(match[0].length) };
}

/**
 * A comma neither reading can account for.
 *
 * English groups thousands in threes and marks the decimal with a point;
 * French marks the decimal with a comma and never groups with one. A comma
 * followed by anything other than three digits is therefore not an English
 * number, and a second comma group is not a French one. Where the line gives no
 * sign which language it is in, "1,500" is fifteen hundred under one reading
 * and one and a half under the other, and choosing wrong is wrong by a factor
 * of a thousand. Neither is safe, so the line goes back as published and says
 * why.
 */
const COMMA_GROUPED = /^\s*\d{1,3}(?:,\d{3})+(?!\d)/;
const COMMA_DECIMAL = /^\s*\d+,\d+/;

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
    const fraction = VULGAR_FRACTIONS[mixedGlyph[2] ?? ""] ?? Number.NaN;
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
    return { amount: VULGAR_FRACTIONS[glyph] ?? Number.NaN, length: offset + 1 };
  }

  // English groups thousands with the comma it never uses as a decimal mark, so
  // "1,500 g" is fifteen hundred grams. Reading the digits up to the comma and
  // stopping there answers 1 for a line that said 1500, and leaves ",500 g"
  // behind in the item name.
  const decimal = (
    language === "fr" ? /^(\d+(?:[.,]\d+)?)/ : /^(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/
  ).exec(trimmed);
  if (decimal) {
    const [written = ""] = decimal.slice(1);
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
  const denominator = WRITTEN_DENOMINATORS[(match[2] ?? "").toLowerCase()];
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
    separator: separator[1] ?? "",
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

/**
 * Why a line that shows a figure is still not the factor's to multiply.
 *
 * Each of these is a reading the parser can make and a scaling it must not do,
 * and they are kept apart from a line with no figure at all so the answer can
 * say which of the two it is looking at.
 */
export type HeldBack =
  /** "4 to 5-pound roast": the figures give the size of one, not how many. */
  | "sizeQualifier"
  /** "1 dinde de 3 kg": the measure behind the item weighs one of them. */
  | "itemSize"
  /** "12 oz can tomatoes": the measure gives what the tin holds, and no count is written. */
  | "containerSize"
  /** "2 pommes de terre par personne": the amount is already stated for one eater. */
  | "perPerson"
  /** "2 h de repos": the figure measures a length of time rather than an amount. */
  | "duration"
  /** "1,500 g" with nothing to say whether the comma groups or divides. */
  | "ambiguousDecimal";

export interface ParsedIngredient {
  /** The line exactly as it was given. */
  original: string;
  /** The language the line was read in. */
  language: Language;
  /**
   * Why the figure on this line must not be multiplied, when there is such a
   * reason. Null for the ordinary line, whose amount is the factor's to scale.
   */
  heldBack: HeldBack | null;
  /**
   * The mark the page opened the line with, in front of the quantity, such as a
   * bullet or a picture of the food. It goes back where the page had it.
   */
  decoration: string | null;
  /**
   * The sign or word the page put before the amount to say it is loose, as in
   * the "~" of "~1 cup water". Null when the page stated the amount plainly.
   */
  approximation: string | null;
  /**
   * A size word standing between the number and the measure, as in the "small"
   * of "1 small handful". It goes back in front of the measure so the answer
   * reads the way the page did.
   */
  measureAdjective: string | null;
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
   * How the line introduced its equivalents: in brackets beside the amount, as
   * in "450 g (1 pound)", after a slash, as in "500 g / 1.1 lb", or in a
   * bracket closing the line, as in "1 cup milk (240 ml)". The rewrite puts
   * them back the way the line offered them.
   */
  alternateStyle: "bracket" | "slash" | "trailing" | null;
  /**
   * The word the bracket opened on, as in the "soit" of "(soit 3/4 de tasse)".
   * Null when the line stated the equivalent without one.
   */
  alternateIntro: string | null;
  /**
   * A bracket giving what one container holds, as in "1 (14 oz) can", exactly
   * as the page wrote it. The count is the factor's to multiply and this figure
   * is not, so it goes back untouched.
   */
  capacity: string | null;
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

/**
 * Articles a French line writes where a digit would go, and what they count as.
 *
 * "un" and "une" are the number one written out, so a line using one has stated
 * a count. A word that says merely that there are several, "quelques" as much
 * as "plusieurs" or the English "a few", has stated none: any figure put behind
 * it is this server's reading rather than the page's quantity, and a reading
 * multiplied is a number nobody wrote.
 */
const FRENCH_ARTICLES: Record<string, number> = { un: 1, une: 1 };

/**
 * Take a measure off the front of `text`, longest spelling first, so "cuillère
 * à soupe" is not read as "cuillère" with "à soupe" spilling into the item
 * name, and "fluid ounce" is not read as "ounce" with "fluid" left dangling.
 */
export function takeUnit(
  text: string,
  language: Language,
): { unit: UnitInfo | null; rest: string } {
  const normalized = normalizeUnitKey(text);
  for (const key of unitKeys(language)) {
    if (normalized !== key && !normalized.startsWith(`${key} `)) continue;
    const unit = lookupUnit(key, language);
    if (!unit) continue;
    const rest = afterKey(text, key);
    if (rest === null) continue;
    return { unit, rest };
  }

  if (language === "en") {
    const words = text.trimStart().split(/\s+/);
    const load = words[0] ? readContainerLoad(words[0]) : null;
    if (load) return { unit: load, rest: words.slice(1).join(" ") };
  }

  return { unit: null, rest: text };
}

/**
 * What stands after the measure a key names, or null when the key does not line
 * up with the words the line is written in.
 *
 * How many words a key spells and how many words the line spends on it are
 * different numbers: normalising turns the abbreviation "c.à.s" into the three
 * words "c a s", and the line writes it as one. Consuming the key's own word
 * count would take two words of the ingredient with it, so the words the line
 * wrote are consumed one at a time until they normalise to the key.
 */
function afterKey(text: string, key: string): string | null {
  const words = text.trim().split(/\s+/);
  for (let count = 1; count <= words.length; count += 1) {
    if (normalizeUnitKey(words.slice(0, count).join(" ")) !== key) continue;
    return words.slice(count).join(" ");
  }
  return null;
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
  return readEvidence(line).language;
}

/** The language a line reads as, with the weight each side gathered. */
function readEvidence(line: string): LanguageEvidence {
  const text = line.trim();
  // Whatever a leading figure, fraction or article occupies, so the probe looks
  // at the position a measure would stand in.
  const afterFigures = text.replace(/^[\s\d.,/½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞\-–—]+/u, "").trimStart();
  const afterArticle = afterFigures.replace(/^(?:un|une|quelques|of\s+an?|an?)\s+/iu, "");

  const frenchUnit = takeUnit(afterArticle, "fr").unit !== null;
  const englishUnit = takeUnit(afterArticle, "en").unit !== null;

  return readLanguage(text, { frenchUnit, englishUnit });
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
  const marked = readable(line);
  const decoration = takeDecoration(marked);
  const text = decoration ? marked.slice(decoration.length).trimStart() : marked;
  const evidence = readEvidence(text);
  const language = choice === "auto" ? evidence.language : choice;

  const empty = (heldBack: HeldBack | null): ParsedIngredient => ({
    original,
    language,
    heldBack,
    decoration,
    approximation: null,
    measureAdjective: null,
    amount: null,
    amountMax: null,
    rangeSeparator: null,
    unit: null,
    alternates: [],
    alternateStyle: null,
    alternateIntro: null,
    capacity: null,
    item: text,
    articleWord: null,
    countMultiplier: null,
  });

  if (unreadableComma(text, language, evidence)) return empty("ambiguousDecimal");

  const loose = APPROXIMATION_PREFIX[language].exec(text);
  const stated = loose ? text.slice(loose[0].length) : text;

  const range = parseLeadingRange(stated, language);
  const article = range ? null : readArticle(stated, language);
  const quantity = range ?? parseLeadingQuantity(stated, language) ?? article;
  if (!quantity) return empty(null);

  // A figure joined to a word by a hyphen describes one thing rather than
  // counting things: "4 to 5-pound roast" is one roast that weighs that much.
  const behindFigure = stated.slice(quantity.length);
  if (/^-\p{L}/u.test(behindFigure)) return empty("sizeQualifier");

  // A rank names a position in an order, and there is no amount in it.
  if (quantity !== article && ORDINAL_SUFFIX.test(behindFigure)) return empty(null);

  // A length of time belongs to the method rather than to the proportions.
  if (TIME_UNIT[language].test(behindFigure.trimStart())) return empty("duration");

  let rest = stated.slice(quantity.length).trimStart();
  // "two thirds of a cup" names a share of one cup, and the measure stands
  // behind the preposition and the article that introduce it.
  if (language === "en") rest = rest.replace(/^(?:of\s+)?an?\s+/i, "");

  // "2 dozen mushrooms" counts mushrooms, twelve to the dozen, so the multiplier
  // is folded into the amount and the line goes on to be read as the count of a
  // thing it now is.
  const multiplier = readCountMultiplier(rest);
  if (multiplier) rest = multiplier.rest;
  const times = multiplier?.times ?? 1;

  const fromArticle = quantity === article;
  const direct = takeLeadingUnit(rest, language, fromArticle);
  const described = direct.unit ? { adjective: null, rest } : takeMeasureAdjective(rest, language);
  // The adjective is only an adjective when a measure stands behind it. In
  // "1 cleaned leek green" the words that follow name the food itself, and
  // taking one off would hand back a line the page never wrote.
  const behind = described.adjective
    ? takeLeadingUnit(described.rest, language, fromArticle)
    : null;
  const leading = direct.unit ? direct : behind?.unit ? behind : direct;
  rest = leading.rest;

  // A range gives two amounts, and a second member behind it would belong to
  // one of them without saying which.
  const compound = range ? null : takeCompoundMember(rest, leading.unit, language);
  if (compound) rest = compound.rest;
  const whole = quantity.amount + (compound?.adds ?? 0);

  // The partitive can stand between the measure and the bracket restating it,
  // as in "150 g de (3/4 de tasse) de sucre". It introduces the equivalent
  // rather than the food, so it is stepped over and the bracket read behind it.
  const introducedBracket = /^(?:de\s+|du\s+|des\s+|d'|of\s+)(?=\()/i.exec(rest);
  const bracketed = takeAlternates(
    introducedBracket ? rest.slice(introducedBracket[0].length) : rest,
    language,
  );
  rest = bracketed.measures.length > 0 ? bracketed.rest : rest;

  const slashed = bracketed.measures.length > 0 ? null : takeSlashAlternates(rest, language);
  if (slashed) rest = slashed.rest;

  let item = stripItemLead(rest, language);

  const trailing =
    bracketed.measures.length === 0 && !slashed ? takeTrailingAlternates(item, language) : null;
  if (trailing) item = trailing.item;

  const group = trailing ?? (bracketed.measures.length > 0 ? bracketed : null);
  // A measure inside a bracket beside a container gives what one of them holds,
  // as in "1 (14 oz) can". The recipe's proportion lives in how many tins are
  // opened, and a tin of twice the size is a tin no shop sells, so the figure
  // goes back exactly as the page wrote it.
  const capacity =
    group !== null &&
    group.measures.every((measure) => measure.unit?.kind === "measured") &&
    (namesContainer(leading.unit?.canonical) || namesContainer(item))
      ? group.published
      : null;

  // A counted thing whose size the line states: the number the line opens with
  // is one bird, and the measure behind it is what that bird weighs.
  if (language === "fr" && !leading.unit && statesItemSize(item)) return empty("itemSize");

  // "une dinde de 3 kg" writes the noun where a measure stands, and the
  // partitive takes it for one. A noun the vocabulary lists as a measure keeps
  // counting, since a pot or a boîte is a thing to buy more of; a noun read as
  // a measure only for standing there names the food itself, and a mass behind
  // it is the size of one of them.
  if (language === "fr" && leading.partitive && isStatedSize(item)) return empty("itemSize");

  // "12 oz can tomatoes": the measure qualifies the tin, and how many tins the
  // recipe wants is not written anywhere on the line.
  if (leading.unit?.kind === "measured" && CONTAINER_NOUN.test(normalizeUnitKey(item))) {
    return empty("containerSize");
  }

  const alternates = capacity !== null ? [] : (slashed?.measures ?? group?.measures ?? []);

  return {
    original,
    language,
    heldBack: PER_PERSON[language].test(text) ? "perPerson" : null,
    decoration,
    approximation: loose ? loose[0] : null,
    measureAdjective: behind?.unit ? described.adjective : null,
    amount: whole * times,
    amountMax: range === null ? null : range.max * times,
    rangeSeparator: range?.separator ?? null,
    unit: leading.unit,
    alternates,
    alternateStyle:
      alternates.length === 0 ? null : slashed ? "slash" : trailing ? "trailing" : "bracket",
    alternateIntro: capacity !== null ? null : (group?.intro ?? null),
    capacity,
    item,
    articleWord: fromArticle ? (article?.word ?? null) : null,
    countMultiplier: multiplier?.times ?? null,
  };
}

/**
 * Whether the comma in a leading number is one this line cannot settle.
 *
 * A group of exactly three digits reads as thousands in English and as a
 * decimal in French, so it needs the line to say which language it is in; where
 * nothing does, both readings stand and they differ by a factor of a thousand.
 * A group of any other size is not an English number at all, and a second group
 * is not a French one.
 */
function unreadableComma(text: string, language: Language, evidence: LanguageEvidence): boolean {
  if (COMMA_GROUPED.test(text)) {
    const settled = evidence.french !== evidence.english;
    return !settled;
  }
  if (language === "en") return COMMA_DECIMAL.test(text);
  return /^\s*\d+,\d+,\d/.test(text);
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
    const match = /^\s*(un|une)\b\s*/i.exec(text);
    if (!match) return null;
    if (!counts(text.slice(match[0].length))) return null;
    const [word = ""] = match.slice(1);
    const amount = FRENCH_ARTICLES[word.toLowerCase()];
    if (amount === undefined) return null;
    return { amount, length: match[0].length, word };
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

  const [word = ""] = match.slice(1);
  const times = COUNT_MULTIPLIERS[normalizeUnitKey(word)];
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
): { unit: UnitInfo | null; rest: string; partitive: boolean } {
  const taken = takeUnit(text, language);
  if (taken.unit) return { ...taken, partitive: false };

  if (language === "fr" && fromArticle) {
    const measure = readPartitiveMeasure(text);
    // A noun the vocabulary never listed, read as a measure for standing
    // between the article and the partitive.
    if (measure) return { unit: measure.unit, rest: measure.rest, partitive: true };
  }

  return { ...taken, partitive: false };
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
function takeAlternates(text: string, language: Language): BracketedMeasures {
  const none: BracketedMeasures = { measures: [], intro: null, published: "", rest: text };
  if (!text.startsWith("(")) return none;
  const close = text.indexOf(")");
  if (close < 0) return none;

  const read = readBracket(text.slice(0, close + 1), language);
  if (!read) return none;
  return { ...read, rest: text.slice(close + 1).trimStart() };
}

interface BracketedMeasures {
  measures: Measure[];
  /** What introduced the restatement, as the line wrote it. */
  intro: string | null;
  /** The bracket exactly as published, for a figure that must not be scaled. */
  published: string;
  rest: string;
}

/**
 * Words a page puts inside a bracket to announce that what follows restates the
 * quantity beside it rather than adding to it.
 */
const EQUIVALENT_INTRODUCER = /^(?:soit|environ|about|approx\.?|approximately|or|ou|=)\s*/i;

/**
 * The partitive a line can put between a figure and the measure it names.
 *
 * "3/4 de tasse" and "3/4 tasse" are one quantity written two ways, and a
 * reader that only knows the second leaves the first sitting in prose beside an
 * amount that moved.
 */
const MEASURE_PARTITIVE = /^(?:de\s+la\s+|de\s+l'|d'|de\s+|du\s+|des\s+|of\s+)/i;

/** The measure a figure names, allowing for the partitive introducing it. */
function takeMeasureAfterQuantity(
  text: string,
  language: Language,
): { unit: UnitInfo | null; rest: string } {
  const direct = takeUnitEitherLanguage(text, language);
  if (direct.unit) return direct;

  const partitive = MEASURE_PARTITIVE.exec(text);
  if (!partitive) return direct;
  return takeUnitEitherLanguage(text.slice(partitive[0].length), language);
}

/**
 * Read a whole bracket as a group of equivalent measures, or nothing.
 *
 * The group is only taken when every part of it reads as an amount with a
 * measure. A bracket holding a remark, as in "(the riper the better)" or
 * "(cup)", is prose, and scaling prose is not something a reader can check.
 */
function readBracket(bracket: string, language: Language): Omit<BracketedMeasures, "rest"> | null {
  const inside = bracket.slice(1, -1);
  const intro = EQUIVALENT_INTRODUCER.exec(inside);
  const body = intro ? inside.slice(intro[0].length) : inside;
  // A slash separates two ways of stating the quantity, and it also writes a
  // fraction. One sitting between two digits belongs to the number, so
  // "(3/4 de tasse)" is one measure rather than a three and a four.
  const parts = body.split(/(?<!\d)\/|\/(?!\d)/).map((part) => part.trim());
  const measures: Measure[] = [];

  for (const part of parts) {
    const range = parseLeadingRange(part, language);
    const quantity = range ?? parseLeadingQuantity(part, language);
    if (!quantity) return null;

    const after = takeMeasureAfterQuantity(part.slice(quantity.length).trimStart(), language);
    // A trailing word means the bracket is not purely a measure, as in
    // "(1-inch pieces)", so the whole group is left as prose.
    if (!after.unit || after.rest.trim() !== "") return null;

    measures.push({
      amount: quantity.amount,
      amountMax: range?.max ?? null,
      rangeSeparator: range?.separator ?? null,
      unit: after.unit,
    });
  }

  if (measures.length === 0) return null;
  return { measures, intro: intro ? intro[0].trim() : null, published: bracket };
}

/**
 * Read a bracket a line closes on, as in "150 g de sucre (soit 3/4 de tasse)".
 *
 * A page states an equivalence wherever it reads best, and after the name of
 * the food is as common as beside the figure. Both say the same thing about the
 * same quantity, so both move with it: a doubled line whose closing bracket
 * still reads as published tells the cook that 300 g is three quarters of a
 * cup.
 */
function takeTrailingAlternates(
  item: string,
  language: Language,
): (Omit<BracketedMeasures, "rest"> & { item: string }) | null {
  const closing = /\s*(\([^()]*\))\s*$/.exec(item);
  if (!closing) return null;

  const read = readBracket(closing[1] ?? "", language);
  if (!read) return null;

  const head = item.slice(0, closing.index).trim();
  // A bracket standing on its own is the quantity itself rather than a
  // restatement of one, and there would be nothing left for it to qualify.
  if (head === "") return null;

  return { ...read, item: head };
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
