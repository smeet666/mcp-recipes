/**
 * Scaling ingredient quantities, in French and in English.
 *
 * The guiding rule is that a scaled quantity must be something a cook can act
 * on. Multiplying every number by the factor is arithmetically correct and
 * practically useless: it produces "2,4 oeufs" and "0.67 pinch of salt" with
 * the same confidence as "267 g flour". Each line is therefore classified by
 * what its measure allows, and the classification travels with the result so
 * the caller can see what was computed and what was left alone.
 *
 * Leaving a line alone is a decision of the same weight. A quantity a recipe
 * states loosely still holds a share of the dish, and a leavening agent left at
 * one pinch for twenty-five servings is a recipe that does not rise.
 *
 * The two languages are read by one set of rules. A list holding French lines
 * and English lines comes back scaled by the same arithmetic, with each line
 * written the way its own language writes numbers, plurals and measures.
 */

import type { Language, LanguageChoice } from "./language.js";
import { formatAmount, parseIngredient } from "./quantity.js";
import type { HeldBack, Measure, ParsedIngredient } from "./quantity.js";
import type { Divisibility, UnitInfo } from "./units.js";
import {
  QUARTERED_MEASURE,
  approximateEquivalent,
  chooseReadableUnit,
  countsBarePieces,
  demoteUnit,
  formatUnit,
  hasEmbeddedMeasure,
  isSpoonMeasure,
  unitDivisibility,
} from "./units.js";

const DASH_ONLY = /^[-–—]$/;

const AL_ENDING = /al$/i;
const AUX_ENDING = /aux$/i;
const CLOVE = /\bcloves?\b/i;
const CONSONANT_THEN_Y = /[^aeiou]y$/i;
const DOUBLE_S_ENDING = /ss$/i;
const EAUX_ENDING = /eaux$/i;
const EAU_ENDING = /eau$/i;
const F_ENDING = /(?:[^f]f|fe)$/i;
const F_OR_FE_ENDING = /fe?$/i;
const GARLIC = /\bgarlic\b/i;
const IES_ENDING = /ies$/i;
const LETTER = /\p{L}/u;
const LETTERS_ONLY = /^[A-Za-z]+$/;
const OF_JOINER = / of /i;
const PLURAL_ENDING = /s$|eaux$|aux$/i;
const SIBILANT_ENDING = /(?:ch|sh|s|x|z)$/i;
const SIBILANT_LETTER = /[sxz]$/i;
const SIBILANT_PLURAL = /(?:ch|sh|s|x|z)es$/i;
const TRAILING_S_ANY_CASE = /s$/i;
const VOWEL_OPENING = /^[aeiouàâäéèêëîïôöûü]/i;
const X_ENDING = /x$/i;

export type { Language, LanguageChoice } from "./language.js";

export type ScalingKind =
  /** The arithmetic was exact. */
  | "scaled"
  /**
   * A countable item was moved to a whole or half unit, or a measurement was
   * demoted to a smaller unit to stay usable.
   */
  | "rounded"
  /** The line carries nothing that can be multiplied. */
  | "unscaled";

export interface ScaledIngredient {
  /** The line after scaling, identical to `original` when unscaled. */
  text: string;
  /** The line as published. */
  original: string;
  scaling: ScalingKind;
  /**
   * The scaled quantity, expressed in `unit`, and the lower bound when the line
   * gives a range.
   *
   * Read it together with `unit`, never on its own: a large result is moved to
   * a bigger unit, so scaling "200 g" by ten gives an amount of 2 with a unit
   * of "kg". The bare number can therefore shrink while the quantity grows.
   */
  amount: number | null;
  /** Upper bound when the line gives a range, null otherwise. */
  amountMax: number | null;
  /** The unit `amount` is in, which may differ from the one the recipe used. */
  unit: string | null;
  /** The language the line was read and rewritten in. */
  language: Language;
  /** Why the line was rounded, clamped or left alone. */
  note?: string;
}

/** Round to a step, keeping two decimals at most. */
function roundTo(value: number, step: number): number {
  return Math.round(Math.round(value / step) * step * 100) / 100;
}

/**
 * Round a measured amount to something a kitchen scale can show.
 *
 * Large amounts do not need fine precision and small ones do, so the step grows
 * with the value rather than being fixed. The step stays a tenth in the single
 * digits because a unit can be a pound as easily as a gram, and rounding 2.2 lb
 * to 2 would throw away a tenth of the ingredient.
 *
 * A whole number is already what a scale shows, so it is left where the
 * arithmetic put it: 1234 g doubled is 2468 g, and a step of five grams would
 * report 2470 for a product that needed no rounding at all.
 */
function roundMeasured(value: number): number {
  if (Number.isInteger(value)) {
    return value;
  }
  if (value >= 100) {
    return roundTo(value, 5);
  }
  if (value >= 10) {
    return roundTo(value, 1);
  }
  if (value >= 1) {
    return roundTo(value, 0.1);
  }
  return Math.round(value * 100) / 100;
}

/** Below this there is nothing a kitchen can measure out of a spoonful. */
const SMALLEST_USABLE_FRACTION = 0.25;

/** The smallest share of one thing that is still worth putting in a bowl. */
const SMALLEST_USABLE: Record<Divisibility, number> = {
  whole: 1,
  half: 0.5,
  quarter: 0.25,
};

/** True when a number is a whole or a half, to the last bit of precision. */
function isHalfStep(value: number): boolean {
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9;
}

/** Two decimals, which is finer than any kitchen resolves. */
function trim(value: number): number {
  return Math.round(value * 100) / 100;
}

interface CountableResult {
  value: number;
  /** The floor was hit, so this line no longer holds its share of the recipe. */
  clamped: boolean;
}

/**
 * Round a counted thing to an amount a kitchen produces.
 *
 * A count lands on a whole. The one exception is a share that comes out on a
 * half by itself, for a thing a knife can halve: half a clove of garlic is a
 * real amount, and rounding it up to a whole adds a fifth of the garlic to a
 * recipe that asked for five cloves.
 *
 * How finely the thing divides decides the floor. Under that floor the amount
 * is clamped up rather than shrunk towards nothing, which keeps the ingredient
 * in the recipe at the cost of its proportion, and the caller is told through
 * `clamped`. The ceiling stops a shrinking recipe from ever asking for more
 * than it started with.
 */
function roundCountable(
  value: number,
  divisibility: Divisibility,
  ceiling: number,
): CountableResult {
  if (value <= 0) {
    return { value: 0, clamped: false };
  }

  const floor = SMALLEST_USABLE[divisibility];

  if (divisibility !== "whole" && value >= floor && isHalfStep(value)) {
    return { value: trim(value), clamped: false };
  }

  if (divisibility === "whole") {
    // Below the halfway mark the nearest whole is none, and dropping the
    // ingredient is worse than overstating it, so the line keeps one and says
    // it no longer holds its share.
    if (value < 0.5) {
      return { value: floor, clamped: true };
    }
    return { value: Math.round(value), clamped: false };
  }

  if (value < floor) {
    return { value: floor, clamped: true };
  }

  if (value < 1) {
    // A knife takes a vegetable to quarters and thirds; anything else offers
    // the half it can be split on.
    const steps = divisibility === "quarter" ? [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1] : [0.5, 1];
    const candidates = steps.filter(
      (candidate) => candidate >= floor && candidate <= Math.max(ceiling, floor),
    );
    let closest = candidates[0] ?? floor;
    for (const candidate of candidates) {
      if (Math.abs(value - candidate) < Math.abs(value - closest)) {
        closest = candidate;
      }
    }
    return { value: trim(closest), clamped: false };
  }

  return { value: Math.round(value), clamped: false };
}

/**
 * Round a spoon or a cup, which a kitchen measures out in halves and in the
 * fractions printed on a measuring set.
 */
function roundSpoon(value: number, ceiling: number): CountableResult {
  if (value <= 0) {
    return { value: 0, clamped: false };
  }

  if (value < 1) {
    const candidates = [SMALLEST_USABLE_FRACTION, 1 / 3, 0.5, 2 / 3, 0.75, 1].filter(
      (candidate) => candidate <= Math.max(ceiling, SMALLEST_USABLE_FRACTION),
    );
    let closest = candidates[0] ?? SMALLEST_USABLE_FRACTION;
    for (const candidate of candidates) {
      if (Math.abs(value - candidate) < Math.abs(value - closest)) {
        closest = candidate;
      }
    }
    return { value: trim(closest), clamped: value < SMALLEST_USABLE_FRACTION };
  }

  return { value: roundTo(value, 0.5), clamped: false };
}

/**
 * Walk a spoon or a cup down to the smaller spoon while the amount sits under
 * one, so a share is stated in a measure that exists.
 *
 * An amount already on a whole or a half stays where the line put it: half a
 * tablespoon is a spoon a kitchen owns, and there is nothing to gain by calling
 * it a teaspoon and a half.
 */
function stepDownSpoon(unit: UnitInfo, reference: number): { unit: UnitInfo; ratio: number } {
  let current = unit;
  let ratio = 1;

  while (reference * ratio < 1 && !isHalfStep(reference * ratio)) {
    const step = demoteUnit(current);
    if (!step) {
      break;
    }
    ratio *= step.per;
    current = step.unit;
  }

  return { unit: current, ratio };
}

/**
 * How close a result has to be to the exact product to be called exact.
 *
 * Two tests, because one of them alone is wrong at some scale. An absolute gap
 * of a hundredth is beneath what a kitchen resolves at ordinary sizes, and at a
 * hundredth of a millilitre it is the whole quantity: 0.006 rounded to 0.01 sits
 * inside the absolute gap while being two thirds larger than what was asked for.
 * A share of half a percent catches that without calling ordinary rounding
 * inexact.
 */
const EXACT_WITHIN = 0.01;
const EXACT_SHARE = 0.005;

function landedExactly(exact: number, amount: number): boolean {
  const gap = Math.abs(exact - amount);
  if (gap > EXACT_WITHIN) {
    return false;
  }
  return exact === 0 || gap / Math.abs(exact) <= EXACT_SHARE;
}

/**
 * Whether a bound came out as the exact product, judged in the finer of the two
 * units involved.
 *
 * An absolute tolerance only means what it says at one scale. Read in kilos, a
 * hundredth is ten grams, so a quantity moved from 2468 g to 2470 g passes as
 * exact for being 0.002 kg away; read in grams, the same gap is two grams and
 * the answer is that the value moved.
 */
function boundLandedExactly(bound: ScaledBound): boolean {
  const fine = Math.max(bound.ratio, 1);
  return landedExactly(bound.raw * fine, bound.amount * (fine / bound.ratio));
}

export interface ScaleOptions {
  /** Multiplier applied to the quantities. */
  factor: number;
  /**
   * Which language to read the lines in. Left out, each line is read on its
   * own, so a list holding both comes back written the way each line was.
   */
  language?: LanguageChoice;
}

interface ScaledBound {
  amount: number;
  /** The exact product, expressed in the unit that came back. */
  exact: number;
  clamped: boolean;
  /** The exact product in the unit the recipe wrote, for a readable note. */
  raw: number;
  /** How many of the unit that came back fit in one of the unit the recipe wrote. */
  ratio: number;
}

interface ScaledMeasure {
  /**
   * One bound for a single measure, two for a range, in that order. The shape
   * says so, because every reader takes the first without checking: a measure
   * that scaled to nothing is not a thing this can produce.
   */
  bounds: [ScaledBound, ...ScaledBound[]];
  /** The unit every bound is expressed in, which both ends of a range share. */
  unit: UnitInfo | null;
}

/**
 * Scale one measure, both ends of a range together.
 *
 * The unit is chosen once, from the smaller end of a range, and applied to
 * every bound.
 *
 * A measurement walks down to a smaller unit before it is rounded, so a
 * quantity divided a thousandfold never rounds to zero and states that the
 * recipe needs none of it.
 */
function scaleMeasure(
  low: number,
  high: number | null,
  unit: UnitInfo | null,
  factor: number,
  divisibility: Divisibility,
): ScaledMeasure {
  /** What the page published at one end of the measure, and what it scales to. */
  interface End {
    published: number;
    raw: number;
  }

  const ends: [End, ...End[]] =
    high === null
      ? [{ published: low, raw: low * factor }]
      : [
          { published: low, raw: low * factor },
          { published: high, raw: high * factor },
        ];

  /** Read both ends, keeping the shape every caller of the bounds relies on. */
  const eachEnd = <T>(read: (end: End) => T): [T, ...T[]] => [
    read(ends[0]),
    ...ends.slice(1).map(read),
  ];

  const raws = ends.map((end) => end.raw);
  /**
   * The unit is chosen from the smaller end of a range.
   *
   * Both ends have to share one unit, or "½ to 1 pound" comes back as "13 oz to
   * 1.5 pounds", where the second number reads smaller than the first. Of the
   * two, the smaller end is the one a unit can ruin: choosing from the larger
   * turns "450 to 1000 g" into "0.45 to 1 kg", and pushed one step further it
   * rounds the small end away entirely. A large number in a small unit is
   * merely long to read.
   */
  const positive = raws.filter((raw) => raw > 0);
  const reference = positive.length > 0 ? Math.min(...positive) : low * factor;

  /** Both bounds share one unit, and each keeps the precision that unit affords. */
  const inUnit = (target: UnitInfo, ratio: number): ScaledMeasure => ({
    bounds: eachEnd(({ published, raw }) => {
      const exact = raw * ratio;
      // The rounding happens in the smaller of the two units, so moving to a
      // bigger one never throws away precision the page wrote: 1500 g rounded
      // as kilos is 2, and rounded as grams it is the 1.5 kg a scale shows.
      const rounded =
        ratio < 1 ? Number((roundMeasured(raw) * ratio).toPrecision(12)) : roundMeasured(exact);
      // At the bottom of a ladder, keep what precision is left rather than
      // deleting the ingredient.
      const usable = rounded === 0 && exact > 0 ? Number(exact.toPrecision(2)) : rounded;
      // Rounding to a step of five grams above a hundred can round upwards, and
      // a recipe being made smaller must never come out asking for more than
      // the page published.
      const ceiling = factor < 1 ? published * ratio : Number.POSITIVE_INFINITY;
      return {
        amount: Math.min(usable, ceiling),
        exact,
        clamped: false,
        raw,
        ratio,
      };
    }),
    unit: target,
  });

  if (unit && unit.kind === "measured") {
    const chosen = chooseReadableUnit(unit, reference);
    return inUnit(chosen.unit, chosen.ratio);
  }

  if (unit && isSpoonMeasure(unit)) {
    const stepped = stepDownSpoon(unit, reference);
    // A share stated in the smaller spoon is a measurement, and keeps the
    // precision of one rather than being snapped to the fractions of a spoon
    // it no longer fills.
    if (stepped.ratio !== 1) {
      return inUnit(stepped.unit, stepped.ratio);
    }

    const bounds = eachEnd(({ published, raw }) => {
      const ceiling = factor < 1 ? published : Number.POSITIVE_INFINITY;
      const rounded = roundSpoon(raw, ceiling);
      return { amount: rounded.value, exact: raw, clamped: rounded.clamped, raw, ratio: 1 };
    });
    return { bounds, unit };
  }

  const bounds = eachEnd(({ published, raw }) => {
    // Scaling down must never end up asking for more than the recipe did.
    const ceiling = factor < 1 ? published : Number.POSITIVE_INFINITY;
    const rounded = roundCountable(raw, divisibility, ceiling);
    return { amount: rounded.value, exact: raw, clamped: rounded.clamped, raw, ratio: 1 };
  });
  return { bounds, unit };
}

/**
 * How finely a counted thing divides, decided by the size of one of them
 * against what a recipe puts in.
 *
 * `PORTION_SIZED_ITEM` and `QUARTERED_ITEM` are the two ends of that one
 * comparison, and each entry earns its place by where the food falls on it.
 *
 * A shrimp, a mussel, a hazelnut, a peppercorn, a juniper berry, a star anise
 * is already a portion on its own. A recipe counts five, twelve, twenty of
 * them, and a cook taking a share of that recipe puts one fewer in the pan;
 * cutting one in two is not a thing a kitchen does. These land on a whole
 * number.
 *
 * A leg of lamb, a baguette, a camembert, a pineapple, an onion, a watermelon,
 * a guinea fowl sits at the other end: a recipe asks for one or for two, and
 * the share it wants out of one is decided by a knife. A quarter of one is a
 * piece someone serves, and what is left keeps.
 *
 * Both lists carry each food in either language, because where a food falls on
 * that comparison has nothing to do with the words a page uses for it.
 */
const PORTION_SIZED_ITEM = new RegExp(
  "\\b(?:" +
    "shrimps?|prawns?|langoustines?|mussels?|hazelnuts?|peppercorns?|junipers?|grains?|anise" +
    // The same foods, as a French line names them.
    "|crevettes?|gambas|moules?|noisettes?|genievres?|genevriers?|badianes?|anis" +
    ")\\b",
  "iu",
);

const QUARTERED_ITEM = new RegExp(
  "\\b(?:" +
    "onions?|shallots?|potatoes|potato|carrots?|apples?|pears?|lemons?|limes?|oranges?" +
    "|tomato(?:es)?|cucumbers?|courgettes?|zucchinis?|aubergines?|eggplants?|squash(?:es)?" +
    "|pumpkins?|cabbages?|melons?|watermelons?|peppers?|beets?|turnips?|parsnips?" +
    "|leeks?|bananas?|mango(?:e?s)?|avocados?" +
    "|legs? of lamb|lamb legs?|baguettes?|camemberts?|cheeses?|chorizos?|pineapples?" +
    "|peach(?:es)?|apricots?|milk|chickens?|guinea fowls?|roasts?" +
    // The same produce, as a French line names it.
    "|oignons?|échalotes?|echalotes?|pommes? de terre|carottes?|pommes?|poires?|citrons?" +
    "|tomates?|concombres?|courgettes?|aubergines?|potirons?|choux?|chou|melons?|poivrons?" +
    "|betteraves?|navets?|panais|poireaux?|bananes?|mangues?|avocats?|pastèques?|pasteques?" +
    "|gigots?|fromages?|chèvres?|chevres?|ananas|pêches?|peches?|abricots?|laits?" +
    "|poulets?|pintades?|reblochons?|bûches?|buches?|rôtis?|rotis?" +
    ")\\b",
  "iu",
);

/**
 * A juice, the one counted thing whose division stops at the half.
 *
 * Half the juice of a lemon is taken by squeezing half the fruit, which is a
 * step a recipe writes. A quarter of one has to be poured out and measured
 * back, and no recipe asks for that.
 *
 * It reads before the fruit, which a knife divides further on its own.
 */
const HALVED_ITEM = /\b(?:jus|juices?)\b/iu;

/**
 * Things a kitchen takes one of or none of.
 *
 * An egg comes out of its shell whole, and so does the yolk or the white a
 * recipe asks for on its own: half of one means beating it and weighing the
 * result, which no recipe asks for, and there is no way to keep the other half.
 * A count of them therefore lands on a whole number, whichever side of the half
 * the arithmetic fell on.
 *
 * This list is short on purpose, and a word joins it only when half of the
 * thing is genuinely not something a cook can measure out. Anything that is
 * poured, weighed or cut halves, and takes the half.
 *
 * Two more belong here for reasons the criterion cannot reach on its own:
 *
 * - a clou de girofle is a dried flower bud, dropped into the pot and fished
 *   back out of it. Nothing about it is measured, so there is no half of one to
 *   take;
 * - a zeste is what comes off one fruit in one go. A line asking for the zeste
 *   of a citron is asking for all of it, and a share of a zeste names no amount
 *   a cook stops at.
 */
const WHOLE_ITEM =
  /\b(?:eggs?|yolks?|egg\s+whites?|oeufs?|œufs?|jaunes?\s+d['e]|clous?|zestes?|zests?)\b/iu;

/**
 * A piece carved off a bird or off a joint, which stops at the half.
 *
 * The whole animal divides by the knife that portions it, and one of these is
 * already the portion that knife produced: a blanc or a cuisse feeds one, and
 * half of one is the share a smaller recipe serves. Taking a quarter would name
 * a piece no one plates.
 *
 * It reads before the animal, and before the fruit or the vegetable a line
 * often names beside the meat, so that neither answers for the cut.
 */
const HALVED_CUT =
  /\b(?:breasts?|thighs?|drumsticks?|wings?|cutlets?|cuisses?|ailes?|pilons?|escalopes?|magrets?)\b/iu;

/**
 * How far a "clove" divides, when a line counts one.
 *
 * The word names two foods that answer the question in opposite ways. A clove
 * of garlic is a wedge broken off a bulb, the gousse d'ail, and the share of
 * one a recipe asks for is the half a knife makes of it. A clove on its own is
 * the dried flower bud, the clou de girofle, dropped into the pot and fished
 * back out of it: nothing about it is measured, so there is no share of one to
 * take.
 *
 * Garlic named in the line is what separates the two, and that is how the great
 * majority of lines writing the word say which food they mean. The French words
 * need none of this, each naming one food and one only.
 *
 * The question is asked only where the clove is the thing being counted. A head
 * of garlic that mentions its cloves is a head, and divides as one.
 *
 * Null when the line counts no clove at all.
 */
function cloveDivisibility(unit: UnitInfo | null, item: string): Divisibility | null {
  const counted = unit ? unit.canonical === "clove" : CLOVE.test(item);
  if (!counted) {
    return null;
  }
  return GARLIC.test(item) ? "half" : "whole";
}

/**
 * How far a "blanc" divides, when a line names one.
 *
 * The word covers two foods that answer the question in opposite ways. The
 * white of an oeuf goes with the oeuf and the jaune: half of one would have to
 * be beaten and weighed. A blanc de poulet or de dinde is a piece of meat, and
 * half of one is a portion a knife cuts and a fridge keeps.
 *
 * Deciding the word here rather than letting the line fall through is what
 * keeps the fruit or the vegetable such a line often names beside the meat from
 * answering for it.
 *
 * Null when the line names no blanc at all.
 */
const BLANC_OF = /\bblancs?\s+d(?:e\s|['’])/iu;
const BLANC_OF_EGG = /\bblancs?\s+d(?:e\s|['’])\s*(?:oeufs?|œufs?)\b/iu;

function blancDivisibility(item: string): Divisibility | null {
  // The noun is the one followed by what it is the blanc of. "vin blanc" and
  // "oignon blanc" use the same letters as a colour and count as neither.
  if (!BLANC_OF.test(item)) {
    return null;
  }
  return BLANC_OF_EGG.test(item) ? "whole" : "half";
}

/**
 * Accents removed and the ligature spelled out, so "échalote" and "echalote"
 * hit one entry.
 *
 * A word boundary sits between an ASCII letter and a non-letter and nowhere
 * else, so a pattern opening on "é" never matches at the start of a word:
 * folding the item is what lets the lists below be written once, in plain
 * letters.
 */
function foldItem(item: string): string {
  return item
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0153/g, "oe")
    .replace(/\u0152/g, "OE");
}

function divisibilityOf(unit: UnitInfo | null, item: string): Divisibility {
  const key = foldItem(item);
  const clove = cloveDivisibility(unit, key);
  if (clove) {
    return clove;
  }
  if (unit && !countsBarePieces(unit)) {
    return unitDivisibility(unit);
  }
  const blanc = blancDivisibility(key);
  if (blanc) {
    return blanc;
  }
  if (WHOLE_ITEM.test(key)) {
    return "whole";
  }
  if (PORTION_SIZED_ITEM.test(key)) {
    return "whole";
  }
  if (HALVED_ITEM.test(key)) {
    return "half";
  }
  if (HALVED_CUT.test(key)) {
    return "half";
  }
  if (QUARTERED_MEASURE.test(key)) {
    return "quarter";
  }
  return QUARTERED_ITEM.test(key) ? "quarter" : "half";
}

/* -------------------------------------------------------------------------- */
/* Agreement between a number and the thing it counts                          */
/* -------------------------------------------------------------------------- */

/**
 * Names of food that read the same whatever the number.
 *
 * Some are mass nouns a recipe counts in spoons rather than in units, and some
 * are plurals already. An -s added to one of them names a thing no shop sells.
 */
const INVARIABLE_ITEM = new Set([
  "anise",
  "ananas",
  "asparagus",
  "bacon",
  "basil",
  "beef",
  "bison",
  "broccoli",
  "butter",
  "celery",
  "cilantro",
  "citrus",
  "cinnamon",
  "cocoa",
  "cod",
  "coriander",
  "corn",
  "cornstarch",
  "couscous",
  "cream",
  "deer",
  "fish",
  "flour",
  "gambas",
  "garlic",
  "ginger",
  "ham",
  "honey",
  "hummus",
  "jus",
  "kale",
  "lamb",
  "macaroni",
  "milk",
  "miso",
  "musk",
  "moose",
  "mutton",
  "nutmeg",
  "oil",
  "okra",
  "oregano",
  "parsley",
  "pasta",
  "pork",
  "quinoa",
  "rice",
  "rosemary",
  "saffron",
  "salmon",
  "salt",
  "shrimp",
  "spinach",
  "squid",
  "sugar",
  "thyme",
  "tofu",
  "trout",
  "tuna",
  "vanilla",
  "veal",
  "venison",
  "vinegar",
  "water",
  "yeast",
  "yogurt",
]);

/** Names whose plural the ordinary English rules get wrong. */
const IRREGULAR_PLURAL: Record<string, string> = {
  calf: "calves",
  chili: "chilies",
  chilli: "chillies",
  goose: "geese",
  half: "halves",
  knife: "knives",
  leaf: "leaves",
  loaf: "loaves",
  mango: "mangoes",
  potato: "potatoes",
  shelf: "shelves",
  tomato: "tomatoes",
};

const IRREGULAR_SINGULAR: Record<string, string> = Object.fromEntries(
  Object.entries(IRREGULAR_PLURAL).map(([one, many]) => [many, one]),
);

/**
 * Keep the capitalisation the line used while looking the word up in lower
 * case.
 *
 * A page writes its ingredients in whichever case it likes, and the shape of a
 * word is the page's rather than this server's: a list set in capitals reads as
 * a list somebody typed over when one line of it comes back in lower case.
 * Three shapes carry: all capitals, one leading capital, and everything else,
 * which keeps the replacement as the vocabulary spells it.
 */
function matchCase(source: string, replacement: string): string {
  const hasLetter = LETTER.test(source);
  if (hasLetter && source === source.toUpperCase()) {
    return replacement.toUpperCase();
  }
  const first = source.slice(0, 1);
  if (
    first !== "" &&
    first === first.toUpperCase() &&
    source.slice(1) === source.slice(1).toLowerCase()
  ) {
    return (replacement[0] ?? "").toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function toEnglishPlural(word: string): string {
  const key = word.toLowerCase();
  if (INVARIABLE_ITEM.has(key)) {
    return word;
  }
  const irregular = IRREGULAR_PLURAL[key];
  if (irregular) {
    return matchCase(word, irregular);
  }
  if (SIBILANT_ENDING.test(word)) {
    return `${word}es`;
  }
  if (CONSONANT_THEN_Y.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }
  if (F_ENDING.test(word)) {
    return `${word.replace(F_OR_FE_ENDING, "")}ves`;
  }
  return `${word}s`;
}

function toEnglishSingular(word: string): string {
  const key = word.toLowerCase();
  if (INVARIABLE_ITEM.has(key)) {
    return word;
  }
  const irregular = IRREGULAR_SINGULAR[key];
  if (irregular) {
    return matchCase(word, irregular);
  }
  if (IES_ENDING.test(word) && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }
  // A -ves plural belongs to a noun ending in -f or -fe, and those are named
  // one by one in `IRREGULAR_PLURAL`: turning every -ves back into -f makes a
  // "clof" out of "cloves" and an "olif" out of "olives".
  if (SIBILANT_PLURAL.test(word)) {
    return word.slice(0, -2);
  }
  // "glass", "molasses": the -s belongs to the singular. Beyond the doubled -s
  // the ending settles nothing, "couscous" and "kiwis" both closing on -us, so
  // the names that carry their -s are named in `INVARIABLE_ITEM`.
  if (DOUBLE_S_ENDING.test(word)) {
    return word;
  }
  if (TRAILING_S_ANY_CASE.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Make an English item agree with its number, in both directions.
 *
 * English marks the plural above one, so "5 egg yolks" divided reads "1 egg
 * yolk" and "1 loaf" tripled reads "3 loaves". Only the head noun is touched,
 * which is the last word before any comma: everything after a comma is
 * preparation, and "cloves garlic, minced" must not become "minceds".
 *
 * "of" moves the head to the left of it. What is being counted in "bottles of
 * orange blossom water" is the bottles, and the number says nothing about the
 * water.
 */
function agreeInEnglish(item: string, amount: number): string {
  if (!item) {
    return item;
  }

  const comma = item.indexOf(",");
  const head = comma < 0 ? item : item.slice(0, comma);
  const tail = comma < 0 ? "" : item.slice(comma);

  const preposition = OF_JOINER.exec(head);
  if (preposition) {
    const counted = agreeInEnglish(head.slice(0, preposition.index), amount);
    return `${counted}${head.slice(preposition.index)}${tail}`;
  }

  const words = head.trimEnd().split(" ");
  const last = words.at(-1) ?? "";
  if (!LETTERS_ONLY.test(last) || last.length <= 2) {
    return item;
  }

  const wantsPlural = amount > 1;
  const plural = toEnglishPlural(last);
  const singular = toEnglishSingular(last);
  const isPlural = last.toLowerCase() !== singular.toLowerCase();

  if (wantsPlural && !isPlural) {
    words[words.length - 1] = plural;
  } else if (!wantsPlural && isPlural) {
    words[words.length - 1] = singular;
  } else {
    return item;
  }

  return `${words.join(" ")}${tail}`;
}

/**
 * French nouns carrying a final -s, -x or -z in the singular.
 *
 * The word is the same whatever the number, so the ending a plural would give
 * back belongs to the singular and must stay.
 */
/**
 * French nouns in -ou whose plural takes an -x.
 *
 * The ending settles nothing on its own: "clou" and "trou" take the ordinary
 * -s, and only these few take the -x. A cabbage is the one a recipe counts, and
 * the others are here because the list is the rule.
 */
const FRENCH_OU_PLURAL_IN_X = new Set([
  "bijou",
  "caillou",
  "chou",
  "genou",
  "hibou",
  "joujou",
  "pou",
]);

const INVARIABLE_FRENCH_NOUN = new Set([
  "ananas",
  "anis",
  "brebis",
  "cassis",
  "colis",
  "coulis",
  "couscous",
  "gambas",
  "houmous",
  "jus",
  "mais",
  "pastis",
  "pois",
  "radis",
  "ris",
  "souris",
  "tamis",
  "tapas",
]);

/**
 * Adjectives a French recipe puts after the noun, and which take a plain -s.
 *
 * A French adjective agrees with the noun it qualifies, so "1 piment entier"
 * counted four times reads "4 piments entiers". Only this list is declined: an
 * unknown trailing word can be a brand ("Golden"), a proper noun ("Cayenne") or
 * a phrase whose head sits elsewhere, and a word left as the recipe wrote it
 * reads as faithful where an invented ending reads as wrong.
 */
const AGREEABLE_ADJECTIVES = new Set([
  "entier",
  "entiere",
  "etoile",
  "etoilee",
  "moyen",
  "moyenne",
  "petit",
  "petite",
  "grand",
  "grande",
  "gros",
  "grosse",
  "mur",
  "mure",
  "vert",
  "verte",
  "rouge",
  "jaune",
  "noir",
  "noire",
  "blanc",
  "blanche",
  "rond",
  "ronde",
  "hache",
  "hachee",
  "coupe",
  "coupee",
  "rape",
  "rapee",
  "pele",
  "pelee",
  "epluche",
  "epluchee",
  "denoyaute",
  "denoyautee",
  "emince",
  "emincee",
]);

/** Lowercase and strip accents, so "entière" and "entiere" hit the same entry. */
function foldWord(word: string): string {
  return word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** The trailing adjective agreed with the count, or null when it is left alone. */
function agreeTrailingAdjective(word: string, wantsPlural: boolean): string | null {
  const folded = foldWord(word);
  const isPlural = folded.endsWith("s");
  const singular = isPlural ? word.slice(0, -1) : word;

  if (!AGREEABLE_ADJECTIVES.has(foldWord(singular))) {
    return null;
  }
  if (wantsPlural === isPlural) {
    return null;
  }

  return wantsPlural ? `${word}s` : singular;
}

/**
 * The head of a French noun phrase, put in the number its count asks for.
 *
 * The marks are not uniform: "morceau" and "chou" take -x where an ordinary
 * noun takes -s, "bocal" takes -aux, a word ending in -s, -x or -z takes no
 * mark at all, and "ananas" or "couscous" carry their -s in the singular. A
 * head already in the number wanted is left as written.
 */
function agreeFrenchHead(
  head: string,
  number: { wantsPlural: boolean; isPlural: boolean; ouPlural: boolean },
): string {
  const { wantsPlural, isPlural, ouPlural } = number;

  if (wantsPlural && !isPlural) {
    if (SIBILANT_LETTER.test(head)) {
      return head;
    }
    if (EAU_ENDING.test(head)) {
      return `${head}x`;
    }
    if (FRENCH_OU_PLURAL_IN_X.has(foldWord(head))) {
      return `${head}x`;
    }
    if (AL_ENDING.test(head)) {
      return `${head.slice(0, -2)}aux`;
    }
    return `${head}s`;
  }

  if (!wantsPlural && isPlural) {
    if (EAUX_ENDING.test(head)) {
      return head.slice(0, -1);
    }
    if (AUX_ENDING.test(head)) {
      return `${head.slice(0, -3)}al`;
    }
    if (ouPlural) {
      return head.slice(0, -1);
    }
    if (INVARIABLE_FRENCH_NOUN.has(foldWord(head))) {
      return head;
    }
    return head.slice(0, -1);
  }

  return head;
}

/**
 * Make a French item agree with its number, in both directions.
 *
 * French takes the plural from two onwards, so "2 oeufs" halved reads "1 oeuf"
 * and "1 brioche" tripled reads "3 brioches". Only the head word is touched,
 * and only its trailing "s": nouns already ending in -s, -x or -z are
 * invariable in the plural ("ananas", "choux"), and forcing one would be worse
 * than leaving the word as the recipe wrote it.
 *
 * Going back down needs `INVARIABLE_FRENCH_NOUN`, because the ending settles
 * nothing on its own: "jus" and "clous" both end in -us, and the first is a
 * singular where the second is a plural of "clou".
 */
function agreeInFrench(item: string, amount: number): string {
  if (!item) {
    return item;
  }

  const words = item.split(" ");
  const head = words[0] ?? "";
  if (head.length <= 3) {
    return item;
  }

  const wantsPlural = amount >= 2;
  // A final -x marks the plural of the few nouns in -ou that take one, and it
  // belongs to the singular of everything else ("prix", "houx").
  const ouPlural = X_ENDING.test(head) && FRENCH_OU_PLURAL_IN_X.has(foldWord(head.slice(0, -1)));
  const isPlural = PLURAL_ENDING.test(head) || ouPlural;

  words[0] = agreeFrenchHead(head, { wantsPlural, isPlural, ouPlural });

  const last = words.length - 1;
  const trailing = last > 0 ? words[last] : undefined;
  if (trailing !== undefined) {
    const adjective = agreeTrailingAdjective(trailing, wantsPlural);
    if (adjective) {
      words[last] = adjective;
    }
  }

  return words.join(" ");
}

/**
 * Agree the adjective a line put in front of its measure, as in the "grosse" of
 * "1 grosse pincée".
 *
 * The word qualifies the measure, so in French it takes the number the measure
 * takes: "2 grosses pincées". English adjectives do not decline, and a French
 * word outside the declinable list stays as the recipe wrote it, for the same
 * reason it does after the noun.
 */
function agreeLeadingAdjective(word: string, amount: number, language: Language): string {
  if (language === "en") {
    return word;
  }

  const wantsPlural = amount >= 2;
  const folded = foldWord(word);
  const isPlural = folded.endsWith("s") && !AGREEABLE_ADJECTIVES.has(folded);
  const singular = isPlural ? word.slice(0, -1) : word;

  if (!AGREEABLE_ADJECTIVES.has(foldWord(singular))) {
    return word;
  }
  if (wantsPlural === isPlural) {
    return word;
  }
  return wantsPlural ? `${singular}s` : singular;
}

function agreeWithAmount(item: string, amount: number, language: Language): string {
  return language === "fr" ? agreeInFrench(item, amount) : agreeInEnglish(item, amount);
}

/**
 * Agree the container a line counts, which is the word the item opens with.
 *
 * "2 (14 oz) cans tomatoes" counts tins and names what is in them, so the
 * number belongs to the tin. English otherwise agrees the last word before a
 * comma, which would put the plural mark on the tomatoes and leave the tin
 * reading as one.
 */
function agreeCountedContainer(item: string, amount: number, language: Language): string {
  if (language === "fr") {
    return agreeInFrench(item, amount);
  }
  const space = item.indexOf(" ");
  if (space < 0) {
    return agreeInEnglish(item, amount);
  }
  return `${agreeInEnglish(item.slice(0, space), amount)}${item.slice(space)}`;
}

/**
 * "de" becomes "d'" before a vowel sound.
 *
 * The h is the hard case: it is silent in "huile" and sounded in "haricot", and
 * only a word list separates them. Elision is therefore limited to vowels plus
 * the handful of h-words a recipe actually uses, because "de haricots" merely
 * reads as careless while "d'haricots" reads as wrong.
 */
const MUTE_H_WORDS = /^(?:huile|huiles|huitre|huitres|huître|huîtres|herbe|herbes|hysope)\b/i;

/**
 * Put the item back after the measure, the way the language joins them.
 *
 * French needs the partitive: "6 cuillères à soupe **de** beurre". English puts
 * the two side by side: "6 tablespoons butter".
 */
function joinItem(item: string, language: Language): string {
  if (!item) {
    return "";
  }
  if (language === "en") {
    return ` ${item}`;
  }
  const elides = VOWEL_OPENING.test(item) || MUTE_H_WORDS.test(item);
  return elides ? ` d'${item}` : ` de ${item}`;
}

/* -------------------------------------------------------------------------- */
/* Scaling one line                                                            */
/* -------------------------------------------------------------------------- */

/** How a line writes the choice between two quantities, in either language. */
const BRANCH_SEPARATORS: Record<Language, RegExp> = {
  en: /\s+or\s+/gi,
  fr: /\s+ou\s+/gi,
};

interface Branch {
  head: string;
  /** The separator as published, so the rewrite reads the way the line did. */
  separator: string;
  tail: string;
}

/**
 * Split a line that offers one ingredient twice, at the word that offers the
 * choice.
 *
 * The search starts where the item name starts, so the "or" of a published
 * range such as "2 or 3 cloves garlic" is left to the range parser. A branch
 * counts only when it carries a quantity of its own; "butter or margarine"
 * names one amount and stays one line.
 */
function splitBranch(text: string, parsed: ParsedIngredient): Branch | null {
  const itemStart = parsed.item ? text.indexOf(parsed.item) : text.length;
  if (itemStart < 0) {
    return null;
  }

  const separator = BRANCH_SEPARATORS[parsed.language];
  separator.lastIndex = 0;
  for (let match = separator.exec(text); match; match = separator.exec(text)) {
    if (match.index < itemStart) {
      continue;
    }
    const tail = text.slice(match.index + match[0].length);
    if (parseIngredient(tail, parsed.language).amount === null) {
      continue;
    }
    return { head: text.slice(0, match.index), separator: match[0], tail };
  }
  return null;
}

/**
 * Scale one ingredient line.
 *
 * Countable items are rounded to something a kitchen can measure, ranges are
 * scaled at both ends, equivalents and alternatives are scaled with the amount
 * they stand beside, and an approximate measure such as a pinch has its count
 * scaled with a note saying how loosely one of them is defined.
 */
export function scaleIngredient(line: string, options: ScaleOptions): ScaledIngredient {
  const { factor } = options;
  // A factor of one changes nothing, and rewriting the line anyway would round
  // "178 ml" to "180 ml" and report a difference the caller never asked for.
  if (factor === 1) {
    return passthroughIngredient(line, options.language);
  }

  const text = line.trim();
  const parsed = parseIngredient(text, options.language ?? "auto");
  const branch = splitBranch(text, parsed);
  if (branch) {
    return scaleBranchedLine(line, branch, { ...options, language: parsed.language });
  }

  return scaleSingleLine(line, options);
}

/**
 * Scale a line that offers a choice, one branch at a time.
 *
 * A cook follows one branch and ignores the other, so both have to carry the
 * same share of the recipe: a doubled line whose second branch still reads as
 * published hands whoever takes it half the ingredient. The two branches name
 * different things, and how far one stands for the other is the page's claim
 * rather than arithmetic, so such a line is never reported as exact.
 */
function scaleBranchedLine(line: string, branch: Branch, options: ScaleOptions): ScaledIngredient {
  const head = scaleSingleLine(branch.head, options);
  if (head.scaling === "unscaled") {
    return { ...head, text: line.trim(), original: line };
  }

  const tail = scaleAlternative(branch.tail, options);
  const result: ScaledIngredient = {
    ...head,
    original: line,
    text: `${head.text}${branch.separator}${tail.text}`,
    scaling: "rounded",
  };

  const branchNote = tail.rewritten
    ? "This line offers a choice between two quantities, and each was scaled on its own. " +
      "How far one stands for the other is the page's own claim."
    : "This line carries a further quantity after the first one, and only the first was scaled. " +
      "Read the rest as published.";
  result.note = head.note ? `${head.note} ${branchNote}` : branchNote;

  return result;
}

/**
 * Scale the branch a line offers as an alternative, when it can be stated in
 * the measure the line offered it in.
 *
 * Under one of that measure the branch would have to be restated in another
 * one, which changes the shape of the choice the cook is being handed, so it
 * keeps its published wording and the line says that it did.
 */
function scaleAlternative(
  tail: string,
  options: ScaleOptions,
): { text: string; rewritten: boolean } {
  const parsed = parseIngredient(tail, options.language ?? "auto");
  const published = tail.trim();
  if (parsed.amount === null) {
    return { text: published, rewritten: false };
  }

  const largest = (parsed.amountMax ?? parsed.amount) * options.factor;
  if (largest < 1) {
    return { text: published, rewritten: false };
  }

  return { text: scaleIngredient(tail, options).text, rewritten: true };
}

/**
 * The equivalents beside a measure, written the way the line wrote them.
 *
 * A trailing restatement is printed after the item rather than beside the
 * amount, so it carries no label here.
 */
function alternateLabel(
  count: number,
  style: string | null,
  texts: readonly string[],
  bracketed: string,
): string {
  if (count === 0) {
    return "";
  }
  if (style === "slash") {
    return ` / ${texts.join(" / ")}`;
  }
  if (style === "trailing") {
    return "";
  }
  return bracketed;
}

/**
 * What follows the amount: the partitive French puts between a measure and what
 * it measures, or the counted item itself, which stands straight after its
 * number in both languages and agrees with it.
 */
function itemLabelFor(
  named: UnitInfo | null,
  item: string,
  counted: string,
  language: Language,
): string {
  if (named) {
    return joinItem(item, language);
  }
  if (counted) {
    return ` ${counted}`;
  }
  return "";
}

/** What the answer says about a line beyond the figure it came to. */
interface LineOutcome {
  parsed: ParsedIngredient;
  bounds: readonly ScaledBound[];
  unit: UnitInfo | null;
  low: ScaledBound;
  clamped: ScaledBound | null;
  movedPrimary: boolean;
  movedAlternate: boolean;
  restated: boolean;
  collapsed: boolean;
  language: Language;
  carriesMore: boolean;
}

/**
 * Everything the answer owes a caller about one scaled line, in one string.
 *
 * The reasons stack: a line can be clamped, carry a second quantity, collapse
 * its range and state an approximation, and each has to be said without
 * cancelling the others.
 */
function noteForScaledLine(outcome: LineOutcome): string | undefined {
  const {
    parsed,
    bounds: primaryBounds,
    unit,
    low,
    clamped,
    movedPrimary,
    movedAlternate,
    restated,
    collapsed,
    language,
    carriesMore,
  } = outcome;
  let note: string | undefined;

  /**
   * The exact product, written for a note.
   *
   * Decimals rather than kitchen fractions: this number exists to be compared
   * against the one on the line, and a fraction snapped from 0.32 to "1/3"
   * reads as the exact product while being a different number.
   */
  const asPublished = (value: number, source: UnitInfo | null) =>
    `${formatAmount(value, language, { fractions: false })}${
      source ? ` ${formatUnit(source, value, language)}` : ""
    }`;

  const sentences: string[] = [];

  if (clamped) {
    sentences.push(
      `Clamped up to ${formatAmount(clamped.amount, language)} from ` +
        `${formatAmount(Math.round(clamped.raw * 1000) / 1000, language)}, the smallest amount ` +
        "worth measuring. This line no longer holds its share of the recipe.",
    );
  } else if (movedPrimary) {
    // Every bound that moved is named, with the direction it moved in. On a
    // range the two ends can move opposite ways, and reporting one of them as
    // though it spoke for both states the wrong direction for half the
    // quantity.
    const moved = primaryBounds.filter((bound) => !boundLandedExactly(bound));
    sentences.push(
      moved
        .map(
          (bound) =>
            `Rounded ${bound.amount > bound.exact ? "up" : "down"} from ` +
            `${asPublished(bound.raw, parsed.unit)}.`,
        )
        .join(" "),
    );
  } else if (movedAlternate) {
    // The amount itself came out exact, and only the equivalent beside it had
    // to move. Saying "rounded from 300 g" when 300 g is exact would send a
    // cook looking for an error that is not there.
    sentences.push(
      `The amount is exact; the equivalent ${
        restated ? "beside it" : "in brackets"
      } was rounded to stay readable.`,
    );
  } else if (restated) {
    sentences.push(
      "This line states one quantity twice, and both readings were scaled. " +
        "They agree as closely as the page wrote them, and no closer.",
    );
  }

  // A line can offer a substitute with its own amount, as in "1 Tbsp vanilla
  // sugar OR 1 tsp vanilla extract". Only the amount the line opens with is
  // scaled, and a substitute left at its published size contradicts it. This is
  // said whatever else happened to the line: a line that was also rounded is the
  // one where a stale second quantity is hardest to spot.
  if (carriesMore) {
    sentences.push(
      "This line carries a further quantity after the first one, and only the first was scaled. " +
        "Read the rest as published.",
    );
  }

  if (parsed.capacity) {
    sentences.push(
      `${parsed.capacity} is what one container holds, so it stays as published and the count is ` +
        "what the factor moved. Scaling this line is a matter of opening that many containers of " +
        "the size named.",
    );
  }

  if (collapsed) {
    sentences.push("The page gave a range, and at this size both ends come to the same amount.");
  }

  // Below what any scale shows, the arithmetic is right and the kitchen cannot
  // follow it. Saying so is the difference between an answer and a number.
  if (unit?.kind === "measured" && low.amount > 0 && low.amount < 0.05) {
    sentences.push(
      "This is smaller than a kitchen scale resolves. Make a larger batch, or measure it by eye.",
    );
  }

  // The page put the amount forward as loose, and multiplying it keeps it that
  // way: the answer is as approximate as the figure it came from.
  if (parsed.approximation) {
    sentences.push(
      "The page gave this amount as an approximation, and the scaled figure is no firmer.",
    );
  }

  if (sentences.length > 0) {
    note = sentences.join(" ");
  }

  if (parsed.unit && parsed.unit.kind === "approximate") {
    note = withApproximateNote(parsed.unit, note);
  }

  // A line that wrote its amount as a word says which word it was, so a caller
  // can see the figure came from the grammar rather than from a digit.
  if (parsed.articleWord) {
    // `amount` carries the product once a word such as "dozen" has multiplied
    // it, and quoting that back would credit the article with a figure it never
    // gave.
    const stood = (parsed.amount ?? 0) / (parsed.countMultiplier ?? 1);
    const read = `"${parsed.articleWord}" read as ${formatAmount(stood, language)}.`;
    note = note ? `${read} ${note}` : read;
  }

  return note;
}

/**
 * The line as it reads once scaled: the amount, its measure, what the container
 * holds, the equivalents beside it, and the item they belong to.
 *
 * The size word the page put in front of its measure goes back in front of it,
 * and the equivalents go back the way the line offered them, since a slash and
 * a bracket are two different ways of restating one quantity.
 */
function renderScaledLine(
  parsed: ParsedIngredient,
  alternates: ReadonlyArray<{ text: string }>,
  unit: UnitInfo | null,
  shown: number,
  language: Language,
): {
  named: UnitInfo | null;
  unitLabel: string;
  capacityLabel: string;
  altLabel: string;
  trailingLabel: string;
  itemLabel: string;
} {
  const named = unit && !countsBarePieces(unit) ? unit : null;
  // The size word the page put in front of its measure goes back in front of
  // it: the page asked for a grosse pincée, and a pincée is not the same ask.
  const adjective =
    named && parsed.measureAdjective
      ? ` ${agreeLeadingAdjective(parsed.measureAdjective, shown, language)}`
      : "";
  const unitLabel = named ? `${adjective} ${formatUnit(named, shown, language)}` : "";
  const alternateTexts = alternates.map((entry) => entry.text);
  const introduced = parsed.alternateIntro ? `${parsed.alternateIntro} ` : "";
  const bracketed = alternates.length === 0 ? "" : ` (${introduced}${alternateTexts.join(" / ")})`;
  // Equivalents go back where the line offered them: inside brackets beside the
  // amount, after a slash, or in the bracket the line closes on.
  const altLabel = alternateLabel(
    alternates.length,
    parsed.alternateStyle,
    alternateTexts,
    bracketed,
  );
  const trailingLabel = parsed.alternateStyle === "trailing" ? bracketed : "";
  // What a container holds is the page's figure and not the factor's, so it
  // goes back between the count and the container, exactly as published.
  const capacityLabel = parsed.capacity ? ` ${parsed.capacity}` : "";
  // A measure needs the partitive that French puts between it and what it
  // measures. A counted item stands straight after its number in both
  // languages, and agrees with it: "1 egg yolk", "3 brioches".
  const counted = parsed.capacity
    ? agreeCountedContainer(parsed.item, shown, language)
    : agreeWithAmount(parsed.item, shown, language);
  const itemLabel = itemLabelFor(named, parsed.item, counted, language);

  return { named, unitLabel, capacityLabel, altLabel, trailingLabel, itemLabel };
}

/** Why a line showing a figure came back as the page published it. */
const HELD_BACK_NOTE: Record<HeldBack, string> = {
  sizeQualifier:
    "The figures here give the size of one item rather than how many, so the line is " +
    "left as published.",
  itemSize:
    "The measure standing behind the item gives the size of one of them rather than how many, " +
    "so the line is left as published. Serving more people is a matter of taking a bigger one, " +
    "and serving fewer a smaller one.",
  containerSize:
    "The measure here gives what one container holds rather than how many of them the recipe " +
    "uses, and the line states no count, so it is left as published. Scaling it is a matter of " +
    "opening that many containers of the size named.",
  perPerson:
    "This line already states an amount for one person, and the factor is what changes " +
    "how many people the recipe serves, so the line is left as published.",
  duration:
    "This line states a length of time rather than an amount of an ingredient, so it is left as " +
    "published. A rest, a proof or a bake takes as long for a large batch as for a small one, " +
    "and the factor has nothing to say about it.",
  ambiguousDecimal:
    "The comma in this number marks thousands in one convention and the decimal point in " +
    "another, and the line gives no sign which was meant, so it is left as published.",
};

function scaleSingleLine(line: string, options: ScaleOptions): ScaledIngredient {
  const { factor } = options;
  const parsed = parseIngredient(line, options.language ?? "auto");
  const language = parsed.language;

  if (parsed.amount === null || parsed.heldBack) {
    return {
      text: parsed.original,
      original: parsed.original,
      scaling: "unscaled",
      amount: null,
      amountMax: null,
      unit: null,
      language,
      note: parsed.heldBack
        ? HELD_BACK_NOTE[parsed.heldBack]
        : "No quantity given; adjust to taste.",
    };
  }

  const divisibility = divisibilityOf(parsed.unit, parsed.item);
  const primary = scaleMeasure(parsed.amount, parsed.amountMax, parsed.unit, factor, divisibility);
  const alternates = parsed.alternates.map((measure) => renderMeasure(measure, factor, language));

  const primaryBounds = primary.bounds;
  const alternateBounds = alternates.flatMap((entry) => entry.bounds);
  const movedPrimary = primaryBounds.some((bound) => !boundLandedExactly(bound));
  const movedAlternate = alternateBounds.some((bound) => !boundLandedExactly(bound));
  const clamped = [...primaryBounds, ...alternateBounds].find((bound) => bound.clamped) ?? null;
  // Two figures beside each other agree only as closely as the page wrote
  // them, and multiplying both keeps that gap rather than closing it.
  const restated = parsed.alternateStyle === "slash";
  const carriesMore = hasEmbeddedMeasure(parsed.item, language);
  // A further quantity beside a mass or a volume restates or qualifies it, and
  // it did not move, so the line as a whole is not the exact product of what
  // the page published. Beside a counted container the same figure gives the
  // size of one of them, which is a thing the factor must leave alone: "2
  // boîtes de 400 g" is exactly twice "1 boîte de 400 g".
  const leftover = carriesMore && parsed.unit?.kind === "measured";

  const low = primaryBounds[0];
  const high = primaryBounds[1] ?? null;
  const unit = primary.unit;
  const shown = high?.amount ?? low.amount;
  const asText = (value: number) =>
    formatAmount(value, language, { fractions: unit?.kind !== "measured" });

  // A range whose two ends land on the same amount stopped being a range. "1 to
  // 1 clove" is not something a cook reads, so the line states the one amount
  // both ends came to.
  const collapsed = high !== null && high.amount === low.amount;
  const amountText = renderRange(
    asText(low.amount),
    high === null || collapsed ? null : asText(high.amount),
    parsed.rangeSeparator,
  );
  // "ea" announces that the figure counts pieces, and names no measure of them,
  // so the line reads as the count of the thing itself and the marker has
  // nothing to say in it.
  const { named, unitLabel, capacityLabel, altLabel, trailingLabel, itemLabel } = renderScaledLine(
    parsed,
    alternates,
    unit,
    shown,
    language,
  );
  const result: ScaledIngredient = {
    text: `${parsed.decoration ? `${parsed.decoration} ` : ""}${parsed.approximation ?? ""}${amountText}${unitLabel}${capacityLabel}${altLabel}${itemLabel}${trailingLabel}`.trim(),
    original: parsed.original,
    scaling: movedPrimary || movedAlternate || restated || leftover ? "rounded" : "scaled",
    amount: low.amount,
    amountMax: collapsed ? null : (high?.amount ?? null),
    unit: named?.canonical ?? null,
    language,
  };

  const note = noteForScaledLine({
    parsed,
    bounds: primaryBounds,
    unit,
    low,
    clamped,
    movedPrimary,
    movedAlternate,
    restated,
    collapsed,
    language,
    carriesMore,
  });
  if (note !== undefined) {
    result.note = note;
  }
  return result;
}

/**
 * Say that a measure is held to no better than the hand that produces it, and
 * what a kitchen usually takes one to be.
 *
 * The equivalence belongs in the note. A recipe that asks for four pinches of
 * baking soda has said nothing about teaspoons, and answering in teaspoons
 * would hand back a figure with a precision the page never claimed. The
 * quantity stays in the measure the line used, and the count is what carries
 * the scaling.
 */
function withApproximateNote(unit: UnitInfo, existing: string | undefined): string {
  const equivalence = approximateEquivalent(unit);
  const sentence =
    `A ${unit.canonical} is an approximate measure${equivalence ? `, ${equivalence}` : ""}. ` +
    "The count was scaled and the size of one is the cook's.";
  return existing ? `${existing} ${sentence}` : sentence;
}

/**
 * Scale an equivalent the line states beside the amount, and render it the way
 * the line wrote it.
 */
function renderMeasure(
  measure: Measure,
  factor: number,
  language: Language,
): { text: string; bounds: ScaledBound[] } {
  const scaled = scaleMeasure(
    measure.amount,
    measure.amountMax,
    measure.unit,
    factor,
    divisibilityOf(measure.unit, ""),
  );
  const low = scaled.bounds[0];
  const high = scaled.bounds[1] ?? null;
  const unit = scaled.unit;
  const shown = high?.amount ?? low.amount;
  const asText = (value: number) =>
    formatAmount(value, language, { fractions: unit?.kind !== "measured" });

  return {
    text: `${renderRange(
      asText(low.amount),
      high === null ? null : asText(high.amount),
      measure.rangeSeparator,
    )}${unit ? ` ${formatUnit(unit, shown, language)}` : ""}`,
    bounds: scaled.bounds,
  };
}

/** Keep a range in the shape the recipe wrote it: "3–4", "2 to 3" or "2 à 3". */
function renderRange(low: string, high: string | null, separator: string | null): string {
  if (high === null || separator === null) {
    return low;
  }
  return DASH_ONLY.test(separator) ? `${low}${separator}${high}` : `${low} ${separator} ${high}`;
}

export function scaleIngredients(lines: string[], options: ScaleOptions): ScaledIngredient[] {
  return lines.map((line) => scaleIngredient(line, options));
}

/**
 * A line returned as published, with whatever quantity could be read off it.
 *
 * A line that carries a readable amount is `scaled`, because leaving it alone
 * is what multiplying by one does. A line with no amount at all is `unscaled`
 * and says why.
 */
export function passthroughIngredient(
  line: string,
  language: LanguageChoice = "auto",
): ScaledIngredient {
  const parsed = parseIngredient(line, language);

  const held = parsed.amount === null || parsed.heldBack !== null;
  const result: ScaledIngredient = {
    text: parsed.original,
    original: parsed.original,
    scaling: held ? "unscaled" : "scaled",
    amount: held ? null : parsed.amount,
    amountMax: held ? null : parsed.amountMax,
    unit: held ? null : (parsed.unit?.canonical ?? null),
    language: parsed.language,
  };
  if (parsed.heldBack) {
    result.note = HELD_BACK_NOTE[parsed.heldBack];
  } else if (parsed.amount === null) {
    result.note = "No quantity given; adjust to taste.";
  } else if (parsed.unit?.kind === "approximate") {
    result.note = withApproximateNote(parsed.unit, undefined);
  }
  return result;
}

/** An ingredient list returned unchanged, for when no scaling was requested. */
export function passthroughIngredients(
  lines: string[],
  language: LanguageChoice = "auto",
): ScaledIngredient[] {
  return lines.map((line) => passthroughIngredient(line, language));
}
