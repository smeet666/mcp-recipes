/**
 * Several wordings from one question.
 *
 * A person asks for a recipe in a sentence, and a recipe index reads none of
 * it. One of the indexes behind this server requires every word given to appear
 * on the same page, so a sentence returns nothing where the corpus holds several
 * of the dish. The other ranks pages on the words it was handed, so the words
 * framing the question pull up whatever happens to share them and push the dish
 * down the list or out of it. Both come back to a reader looking like a
 * statement about a corpus when they are statements about a wording. Deriving
 * the shorter wordings and asking for the union is what keeps the two apart.
 *
 * Every wording is built from the words the question carried, with no
 * dictionary, no corpus statistics and no translation. That has two
 * consequences worth stating. A derived wording is one a reader can retype by
 * hand, so an answer built from several of them stays checkable. And the
 * derivations that would need a lexicon are not made: a question asked in one
 * language is never turned into the other, because a source that publishes in
 * the other language and holds nothing under the words written is an honest
 * absence, while a guessed translation is a word nobody wrote.
 *
 * The order runs from the wording closest to what was asked to the widest.
 *
 * A question also states what the recipe must not hold, and that part is read
 * by the role its words play rather than by the turn of phrase they are written
 * in: a negation, a sentence about how a food affects the person, or the name
 * of a diet. All three put a food out of the dish, so all three are set aside
 * from the derived wordings and named back to the caller. Reading them off a
 * list of phrasings is what lets a declared allergen become a word to search
 * for, and there is no phrasing whose absence from such a list is safe.
 */

/** One wording, and how it was arrived at. */
export interface Wording {
  query: string;
  /** How this wording was derived from the question, in words. */
  derivation: string;
}

/**
 * The most searches one source receives for one question.
 *
 * A ceiling per source rather than a budget shared between them, because the
 * sources are asked in parallel and each is paced on its own, so the worst case
 * is three of one source's intervals rather than six. Three is also the whole
 * ladder: the question as asked, the dish words, and the word naming the dish.
 */
export const MAX_WORDINGS_PER_SOURCE = 3;

/* -------------------------------------------------------------------------- */
/* The words a question is built out of, as opposed to the words naming a dish */
/* -------------------------------------------------------------------------- */

/**
 * Words that frame a question rather than name what is cooked.
 *
 * Both languages are applied to every question. Telling them apart would need a
 * detector, and a detector that guesses wrong strips the wrong words; the two
 * lists barely overlap, and where they do the word frames a question in both.
 *
 * A word is left out of these lists wherever it is also something a person
 * eats. French "son" is a possessive and is also bran, so it stays. The same
 * caution governs anything added here: the cost of keeping a framing word is a
 * diluted ranking, and the cost of dropping an ingredient is the dish.
 */
const FRENCH_FRAME = new Set([
  "a",
  "ai",
  "aimerais",
  "au",
  "aurais",
  "auriez",
  "aux",
  "avec",
  "avons",
  "bcp",
  "beaucoup",
  "bien",
  "bonjour",
  "bonne",
  "bonnes",
  "cherche",
  "chercher",
  "cherchez",
  "connais",
  "connaissez",
  "coucou",
  "ce",
  "ces",
  "cette",
  "comment",
  "d",
  "dans",
  "de",
  "des",
  "du",
  "en",
  "est",
  "et",
  "facile",
  "faire",
  "fais",
  "fait",
  "idee",
  "idees",
  "idée",
  "idées",
  "j",
  "je",
  "l",
  "la",
  "le",
  "les",
  "ma",
  "meilleur",
  "meilleure",
  "merci",
  "mes",
  "mon",
  "ou",
  "par",
  "peux",
  "plait",
  "plaît",
  "plus",
  "pour",
  "qu",
  "que",
  "quel",
  "quelle",
  "quelles",
  "quels",
  "qui",
  "rapide",
  "recette",
  "recettes",
  "recherche",
  "s",
  "salut",
  "se",
  "si",
  "simple",
  "sommes",
  "souhaite",
  "stp",
  "suis",
  "sur",
  "svp",
  "tres",
  "très",
  "un",
  "une",
  "veux",
  "voudrais",
  "vous",
  "à",
]);

const ENGLISH_FRAME = new Set([
  "a",
  "about",
  "am",
  "an",
  "and",
  "any",
  "anything",
  "are",
  "at",
  "be",
  "best",
  "by",
  "can",
  "could",
  "do",
  "does",
  "easy",
  "find",
  "for",
  "from",
  "get",
  "good",
  "hello",
  "hi",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "like",
  "looking",
  "make",
  "making",
  "me",
  "my",
  "need",
  "of",
  "on",
  "or",
  "please",
  "quick",
  "recipe",
  "recipes",
  "should",
  "simple",
  "some",
  "something",
  "suggest",
  "thank",
  "thanks",
  "that",
  "the",
  "less",
  "over",
  "than",
  "to",
  "under",
  "want",
  "what",
  "which",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

/**
 * What a condition is measured in.
 *
 * "under 300 calories" and "in 20 minutes" set a bound, and the word naming the
 * dimension is left in the sentence once the number has gone. No page is named
 * for it, so carrying it into a derived wording ranks pages that merely mention
 * counting calories.
 */
const CONDITION_UNITS = new Set([
  "calorie",
  "calories",
  "couvert",
  "couverts",
  "heure",
  "heures",
  "kcal",
  "min",
  "mins",
  "minute",
  "minutes",
  "part",
  "parts",
  "people",
  "person",
  "persons",
  "personne",
  "personnes",
  "portion",
  "portions",
  "serving",
  "servings",
]);

/**
 * Words whose whole job is to take something out of the dish.
 *
 * A negation is a function word, and function words are a closed class: the
 * ones a language has are the ones it has, and covering the class covers every
 * phrasing built on it, whether the question writes "sans beurre", "without
 * butter", "no butter" or "pas de beurre". That is what makes this a rule
 * rather than a collection of turns of phrase, and it is why the verbs that do
 * the same work, "avoid" and "éviter", sit here beside them.
 *
 * The price is a question such as "no bake cookies", where the negation is part
 * of a dish's name. It costs a caveat the reader can discard. Missing an
 * exclusion costs the reader the thing they wrote the question to avoid, so the
 * two errors are not weighed the same.
 */
const NEGATORS = new Set([
  "aucun",
  "aucune",
  "avoid",
  "avoiding",
  "eviter",
  "evite",
  "evitez",
  "exclude",
  "excluding",
  "exclure",
  "except",
  "ni",
  "no",
  "non",
  "not",
  "pas",
  "sans",
  "sauf",
  "without",
  "zero",
]);

/**
 * Words saying that a food does something to the person rather than to the
 * dish.
 *
 * A sentence about the eater names what the recipe must not hold just as
 * plainly as a negation does, and it is the one condition whose failure is a
 * matter of health, so it is read as its own kind and reported as one.
 */
const HEALTH_MARKERS = new Set([
  "allergene",
  "allergenes",
  "allergen",
  "allergens",
  "allergic",
  "allergie",
  "allergies",
  "allergique",
  "allergiques",
  "allergy",
  "celiac",
  "coeliaque",
  "intolerance",
  "intolerances",
  "intolerant",
  "intolerante",
  "intolerantes",
  "intolerants",
]);

/**
 * Diets, each of which names a class of recipes by what it leaves out.
 *
 * Naming one states an exclusion without writing a negation anywhere, which is
 * why a reading built on negations alone lets it through and hands the word
 * back to the index as though it named a dish.
 */
const DIETS = new Set([
  "casher",
  "cetogene",
  "halal",
  "kascher",
  "keto",
  "ketogenic",
  "kosher",
  "paleo",
  "pescatarian",
  "pescetarien",
  "pescetarienne",
  "vegan",
  "vegane",
  "veganes",
  "vegans",
  "vegetalien",
  "vegetalienne",
  "vegetaliennes",
  "vegetaliens",
  "vegetarian",
  "vegetarians",
  "vegetarien",
  "vegetarienne",
  "vegetariennes",
  "vegetariens",
  "veggie",
]);

/**
 * Where a condition ends.
 *
 * "sans farine de blé et sans oeufs" names two things to leave out, and the
 * conjunction is where the first one stops.
 */
const CONDITION_ENDS = new Set([
  "et",
  "and",
  "ou",
  "or",
  "pour",
  "for",
  "avec",
  "with",
  "mais",
  "but",
  "dans",
  "sur",
]);

/**
 * Words joining a marker to what it names, which name nothing themselves.
 *
 * "pas de beurre" and "allergique aux noix" put one of these between the word
 * carrying the condition and the food it is about. One of them standing right
 * after a marker is what says the food comes after it, which is the only sign
 * in the sentence of which side the marker reaches towards.
 */
const CONDITION_JOINERS = new Set([
  "a",
  "au",
  "aux",
  "d",
  "de",
  "des",
  "du",
  "from",
  "l",
  "la",
  "le",
  "les",
  "my",
  "of",
  "the",
  "to",
]);

/**
 * Words that carry a food's name on into a second noun.
 *
 * "farine de blé" and "noix de coco" are one food written in three words, and
 * the middle one is what says so. A food's name stops wherever no such word
 * carries it further, which is what keeps "sans gluten gateau au chocolat" from
 * reading as a condition on chocolate cake.
 */
const FOOD_LINKERS = new Set(["d", "de", "des", "du", "of"]);

/**
 * How many words a condition names before the sentence resumes.
 *
 * What a recipe has to leave out is a food, so it is a short noun phrase:
 * "beurre", "farine de blé", "noix de coco". Past that the words belong to the
 * question again, and a scope with no end turns a negation used inside a dish's
 * name into a condition swallowing the rest of the sentence.
 */
const CONDITION_WORDS = 3;

/* -------------------------------------------------------------------------- */
/* Conditions                                                                  */
/* -------------------------------------------------------------------------- */

/** How a question put a condition, which decides how it is reported back. */
export type ConditionKind =
  /** The question wrote the recipe must not hold this. */
  | "excluded"
  /** The question said the person reacts to this food. */
  | "allergy"
  /** The question named a diet, which is a class defined by what it leaves out. */
  | "diet";

/** One thing a question asks the recipe not to hold. */
export interface Condition {
  /**
   * The words the question used for the food, or null where the question states
   * a condition and the sentence does not say plainly which food it covers.
   *
   * A word named here is a word the recipe must not hold and a word no wording
   * looks for, so naming the wrong one both hides a dish and leaves the food
   * being avoided in the search. Where the reading is not certain, the caller is
   * told a condition was stated and that its food was not read, which is a
   * smaller claim than either.
   */
  named: string | null;
  kind: ConditionKind;
}

/** What a question asks the dish to avoid, and how many it has to serve. */
export interface Conditions {
  /** What the dish must not hold, in the words the question used. */
  conditions: Condition[];
  /** How many the dish has to serve, when the question said. */
  servings: number | null;
}

/** How many the question asks the dish to serve, written either way round. */
const SERVING_PHRASES = [
  /\bpour\s+(\d{1,3})\s*(?:personnes?|parts?|couverts?)\b/iu,
  /\bfor\s+(\d{1,3})\s*(?:people|persons?|servings?|portions?)\b/iu,
  /\bserves?\s+(\d{1,3})\b/iu,
  /\b(\d{1,3})\s*(?:personnes?|people|servings?)\b/iu,
];

/** A food and the marker written as a single word: "gluten-free", "sugarfree". */
const FREE_OF = /\b([\p{L}]{3,})[\s-]?free\b/iu;

/** What one reading of a question found in it. */
interface ReadQuestion {
  /** The words that name what is cooked, in the order the question wrote them. */
  dish: string[];
  conditions: Condition[];
}

/** Lowercase and strip diacritics, so "végétarien" and "vegetarien" read alike. */
function foldWord(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/œ/gu, "oe");
}

/**
 * Read a question once, deciding for every word whether it names the dish or
 * states a condition on it.
 *
 * One pass rather than two, because the two answers have to agree: a word read
 * as a condition here and as a dish word there is a condition reported to the
 * caller and searched for at the same time, which is the shape of the worst
 * thing this file can do. A single reading cannot disagree with itself.
 */
function readQuestion(question: string): ReadQuestion {
  const words = tokenise(question);
  const conditions: Condition[] = [];
  const dish: string[] = [];

  const state = (named: string | null, kind: ConditionKind): void => {
    const trimmed = named === null ? null : named.trim();
    if (trimmed === "") return;
    if (conditions.some((held) => held.named === trimmed && held.kind === kind)) return;
    conditions.push({ named: trimmed, kind });
  };

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    const key = foldWord(word);

    // A hyphen joins everywhere else, so "sans-gluten" and "no-sugar" arrive as
    // one word with the negation inside it.
    const hyphen = word.indexOf("-");
    if (hyphen > 0 && NEGATORS.has(foldWord(word.slice(0, hyphen)))) {
      state(word.slice(hyphen + 1), "excluded");
      continue;
    }

    // "gluten-free" writes the food and the marker as one word.
    const free = FREE_OF.exec(word);
    if (free) {
      state(free[1]!, "excluded");
      continue;
    }

    // "free" is also a price and a way of keeping hens, so it states a
    // condition only where the sentence puts a food on one side of it.
    if (key === "free") {
      const scope = scopeOf(words, index, dish);
      if (scope.named !== null) {
        state(scope.named, "excluded");
        index = scope.next - 1;
      }
      continue;
    }

    // A negation stands before what it negates, in both languages: "sans
    // beurre", "without butter", "pas de beurre".
    if (NEGATORS.has(key)) {
      const forward = takeFood(words, index + 1);
      state(forward.named === "" ? null : forward.named, "excluded");
      // The marker itself never names a dish, so it leaves whether or not it
      // turned out to scope over anything.
      index = forward.next - 1;
      continue;
    }

    if (HEALTH_MARKERS.has(key)) {
      const scope = scopeOf(words, index, dish);
      state(scope.named, "allergy");
      index = scope.next - 1;
      continue;
    }

    if (DIETS.has(key)) {
      state(word, "diet");
      continue;
    }

    if (FRENCH_FRAME.has(key) || ENGLISH_FRAME.has(key)) continue;
    if (FRENCH_FRAME.has(word) || ENGLISH_FRAME.has(word)) continue;
    // A number counts eaters, minutes or calories. None of them names a dish.
    if (/^\d+$/.test(word)) continue;
    // What is left of an elision once the apostrophe has split it.
    if (word.length < 2) continue;
    if (CONDITION_UNITS.has(word)) continue;

    if (!dish.includes(word)) dish.push(word);
  }

  return { dish, conditions };
}

/**
 * The food a marker covers, on whichever side of it the sentence put one.
 *
 * A joining word straight after the marker is the sentence saying its food
 * follows: "allergique aux noix", "allergic to peanuts", "free of dairy". With
 * no such word the food is the one the marker was written onto the end of:
 * "peanut allergy", "lactose intolerant", "gluten free". The two orders belong
 * to the two languages these sources publish in, so reading only one of them
 * leaves every question written in the other unread.
 *
 * Read the wrong way round, a marker takes a word out of the dish and leaves
 * the food being avoided in the search, which is both halves of the harm at
 * once. So a marker with a food on neither side covers none, and says so.
 *
 * A food found before the marker was already read as a word of the dish, and
 * leaves it here: the same word cannot be a thing to avoid and a thing to look
 * for.
 */
function scopeOf(
  words: string[],
  marker: number,
  dish: string[],
): { named: string | null; next: number } {
  if (CONDITION_JOINERS.has(foldWord(words[marker + 1] ?? ""))) {
    const forward = takeFood(words, marker + 1);
    return { named: forward.named === "" ? null : forward.named, next: forward.next };
  }

  const before = words[marker - 1];
  if (before !== undefined) {
    const held = dish.lastIndexOf(before);
    if (held !== -1) {
      dish.splice(held, 1);
      return { named: before, next: marker + 1 };
    }
  }

  return { named: null, next: marker + 1 };
}

/**
 * The food named from a point in a sentence onwards, and where the sentence
 * picks up again.
 *
 * A food is a short noun phrase, and it ends where nothing carries it further.
 * Taking a fixed number of words instead lets a condition run on into the dish,
 * so "sans gluten gateau au chocolat" comes back as a condition on the cake.
 */
function takeFood(words: string[], from: number): { named: string; next: number } {
  let index = from;
  // An article or a quantifier can stand between the marker and the food:
  // "pas de beurre", "without any butter".
  while (index < words.length && isFiller(words[index]!)) index += 1;

  const named: string[] = [];
  while (index < words.length && named.length < CONDITION_WORDS) {
    if (!namesFood(words[index]!)) break;
    named.push(words[index]!);
    index += 1;

    const beyond = words[index + 1];
    if (
      named.length + 2 <= CONDITION_WORDS &&
      FOOD_LINKERS.has(foldWord(words[index] ?? "")) &&
      beyond !== undefined &&
      namesFood(beyond)
    ) {
      named.push(words[index]!);
      index += 1;
      continue;
    }
    break;
  }

  return { named: named.join(" "), next: index };
}

/** A word standing between a marker and its food, naming no food itself. */
function isFiller(word: string): boolean {
  const key = foldWord(word);
  return CONDITION_JOINERS.has(key) || FRENCH_FRAME.has(key) || ENGLISH_FRAME.has(key);
}

/** Whether a word can be part of the name of something a recipe holds. */
function namesFood(word: string): boolean {
  const key = foldWord(word);
  if (key.length < 2) return false;
  if (/^\d+$/.test(key)) return false;
  if (key === "free") return false;
  if (CONDITION_ENDS.has(key)) return false;
  if (NEGATORS.has(key) || HEALTH_MARKERS.has(key)) return false;
  if (CONDITION_UNITS.has(key)) return false;
  return !(FRENCH_FRAME.has(key) || ENGLISH_FRAME.has(key));
}

/**
 * Read what the question asks the recipe to avoid or to serve.
 *
 * These are the parts of a question no recipe index answers. A page is not
 * named for what it leaves out, and the number of people at a table is not
 * printed in a title at all, so both are read here and handled as what they
 * are rather than as words to look for.
 */
export function readConditions(question: string): Conditions {
  const { conditions } = readQuestion(question);

  let servings: number | null = null;
  for (const phrase of SERVING_PHRASES) {
    const found = phrase.exec(question);
    if (found) {
      const value = Number(found[1]);
      if (Number.isFinite(value) && value > 0) {
        servings = value;
        break;
      }
    }
  }

  return { conditions, servings };
}

/* -------------------------------------------------------------------------- */
/* The ladder                                                                  */
/* -------------------------------------------------------------------------- */

export function deriveWordings(question: string): Wording[] {
  const asked = tidy(question);
  const wordings: Wording[] = [];
  const seen = new Set<string>();

  const offer = (candidate: string, derivation: string): void => {
    const clean = tidy(candidate);
    if (clean === "") return;
    // Two wordings differing only in case or spacing are one wording to these
    // indexes, and sending both spends an interval to learn nothing.
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    wordings.push({ query: clean, derivation });
  };

  offer(asked, "the words as asked, condition words included");

  const dish = dishWords(asked);
  offer(
    dish.join(" "),
    "the words naming the dish, with the words framing the question and the conditions set aside, because a page is named for what it holds",
  );

  offer(
    dish[0] ?? "",
    "the leading dish word on its own, because an index that requires every word given returns nothing for a phrase and a great deal for the word naming the dish",
  );

  // The ladder is three rungs by construction; the ceiling holds whatever a
  // future rung would add to it.
  return wordings.slice(0, MAX_WORDINGS_PER_SOURCE);
}

/**
 * Whether a row's title carries a word naming the dish that was asked for.
 *
 * This decides whether a wording answered, and nothing else: no row is dropped
 * and no row is moved for failing it. A source that ranks on the words it was
 * handed answers a sentence with a page of recipes that share its framing
 * words, and counting those as an answer would stop the search on the page that
 * proves it has not found the dish.
 *
 * Diacritics and punctuation fold away, so "crêpes" reads the same as "crepes"
 * and a namespace in front of a page name settles nothing. A question that
 * names no dish has nothing to check against, and every row passes.
 */
export function namesDish(title: string, question: string): boolean {
  const words = namingWords(question);
  if (words.length === 0) return true;
  return dishWordsMissing(title, question).length < words.length;
}

/**
 * The words naming the dish that a title does not carry.
 *
 * Sharing one word is what makes a row worth offering, and it is not what makes
 * a row the dish. "Biscuits and gravy" and a tin of Christmas biscuits share
 * the biscuit and nothing else, so a caller weighing one against the other has
 * to be told which of the words asked for went unanswered.
 *
 * Empty for a title carrying all of them, and empty for a question that names
 * no dish, since there is then nothing to go unanswered.
 */
export function dishWordsMissing(title: string, question: string): string[] {
  const haystack = ` ${fold(title)} `;
  return namingWords(question).filter((word) => !haystack.includes(` ${fold(word)}`));
}

/** The words of a question long enough to name what is cooked. */
function namingWords(question: string): string[] {
  return dishWords(question).filter((word) => word.length > 2);
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/œ/gu, "oe")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

/**
 * The words of a question that name what is cooked.
 *
 * The framing words go because they rank pages that merely share them. The
 * condition words go for a different reason, and it is worth stating: a search
 * for "sans gluten" ranks pages about gluten, and a search for "6 personnes"
 * ranks nothing at all, so carrying them into a derived wording buries the dish
 * without excluding anything. Dropping them silently would be the worse move,
 * since the recipe found may hold exactly what the person was avoiding, and
 * that is why the question as asked is sent first and every condition set aside
 * is named back to the caller.
 */
function dishWords(question: string): string[] {
  return readQuestion(question).dish;
}

/**
 * The words of a question, lowercased.
 *
 * An apostrophe separates: "l'origan" is the article and the herb, and the herb
 * is the word an index holds. A hyphen joins, because "pot-au-feu" and
 * "gluten-free" are each one word wherever they are written.
 */
function tokenise(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/['’]/gu, " ")
    .split(/[^\p{L}\p{N}-]+/u)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => word !== "");
}

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
