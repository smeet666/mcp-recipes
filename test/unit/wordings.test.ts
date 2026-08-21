/**
 * One question, several wordings.
 *
 * A question typed the way a person speaks carries the dish, the words framing
 * the question, and the conditions the dish has to meet. The indexes behind
 * these sources do not read any of that: one of them requires every word given
 * to appear on the same page, so a phrase returns nothing where a corpus holds
 * several of the dish; the other ranks on the words it was handed, so the
 * framing words pull up recipes that merely share them and push the dish out of
 * the list. Both failures reach a reader as a statement about a corpus when
 * they are statements about a wording.
 *
 * These cases hold the server to deriving the shorter wordings, asking for the
 * union, keeping the requests bounded and paced, saying exactly what was sent,
 * and never letting a condition the person set be silently dropped.
 */

import { describe, expect, it } from "vitest";
import { RecipesClient } from "../../src/sources/client.js";
import { cookbookAdapter } from "../../src/sources/cookbook.js";
import type { CookbookReader, CookbookSummary } from "../../src/sources/cookbook.js";
import { marmitonAdapter } from "../../src/sources/marmiton.js";
import type { MarmitonReader, MarmitonSummary } from "../../src/sources/marmiton.js";
import {
  MAX_WORDINGS_PER_SOURCE,
  deriveWordings,
  readConditions,
} from "../../src/sources/wordings.js";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import { FakeSourceError, payloadOf, searchArgs, silentLogger, textOf } from "./support.js";

/* -------------------------------------------------------------------------- */
/* Questions a person types                                                    */
/* -------------------------------------------------------------------------- */

const FRENCH_QUESTION = "comment faire un ceviche de truite à l'origan";
const FRENCH_DISH_WORDS = "ceviche truite origan";
const FRENCH_HEAD = "ceviche";

const CONDITIONED_QUESTION =
  "une recette de tarte aux pommes sans beurre et sans gluten pour 6 personnes";
const CONDITIONED_DISH_WORDS = "tarte pommes";

const ENGLISH_QUESTION = "how do I make a gluten free apple pie for 6 people";
const ENGLISH_DISH_WORDS = "apple pie";

/** A question stating a health condition, in the words a person types it in. */
const ALLERGY_QUESTION =
  "bonjour je cherche des lasagnes sans gluten pour 6 personnes merci (je suis allergique aux noix)";

/* -------------------------------------------------------------------------- */
/* Sources that answer one wording and not another                             */
/* -------------------------------------------------------------------------- */

function marmitonRow(reference: string): MarmitonSummary {
  return {
    id: reference,
    title: `Recette ${reference}`,
    url: `https://www.marmiton.org/recettes/recette_r_${reference}.aspx`,
    imageUrl: null,
  };
}

function cookbookRow(key: string): CookbookSummary {
  return {
    key: `Cookbook:${key}`,
    title: `Cookbook:${key}`,
    description: null,
    excerpt: null,
    imageUrl: null,
    sourceUrl: `https://en.wikibooks.org/wiki/Cookbook:${key}`,
  };
}

interface Script {
  /** References this source returns for a given wording. Absent is nothing. */
  answers?: Record<string, string[]>;
  /** Wordings this source refuses, and how. */
  fails?: Record<string, Error>;
}

function scriptedMarmiton(script: Script, log: string[]): MarmitonReader {
  return {
    async search(query: string) {
      log.push(`marmiton:${query}`);
      const failure = script.fails?.[query];
      if (failure) {
        throw failure;
      }
      return { data: (script.answers?.[query] ?? []).map(marmitonRow), cached: false };
    },
    async getRecipe() {
      throw new FakeSourceError("not_found", "No recipe under that number.");
    },
  };
}

function scriptedCookbook(script: Script, log: string[]): CookbookReader {
  return {
    async search(query: string) {
      log.push(`cookbook:${query}`);
      const failure = script.fails?.[query];
      if (failure) {
        throw failure;
      }
      return {
        data: { results: (script.answers?.[query] ?? []).map(cookbookRow) },
        cached: false,
      };
    },
    async getRecipe() {
      throw new FakeSourceError("not_found", "No page under that name.");
    },
  };
}

function scriptedClient(marmiton: Script, cookbook: Script, log: string[]): RecipesClient {
  return new RecipesClient({
    logger: silentLogger,
    sources: [
      marmitonAdapter(scriptedMarmiton(marmiton, log)),
      cookbookAdapter(scriptedCookbook(cookbook, log)),
    ],
  });
}

/** What one source was asked, in the order it was asked. */
function asked(log: string[], source: string): string[] {
  return log
    .filter((entry) => entry.startsWith(`${source}:`))
    .map((entry) => entry.slice(source.length + 1));
}

interface WordingTrace {
  query: string;
  derivation: string;
  ran: boolean;
  count: number | null;
  added: number | null;
  not_run_because: string | null;
  error: { code: string } | null;
}

interface SearchPayload {
  results: Array<{ id: string; source: string }>;
  result_count: number;
  order: string;
  notes: string[];
  per_source: Array<{
    source: string;
    name: string;
    status: string;
    count: number;
    wordings: WordingTrace[];
  }>;
}

function reportFor(payload: SearchPayload, source: string) {
  const report = payload.per_source.find((entry) => entry.source === source);
  if (!report) {
    throw new Error(`no report for ${source}`);
  }
  return report;
}

/** Every word of a wording, as the derivation split them. */
function wordsOf(value: string): string[] {
  return value.toLowerCase().split(/\s+/).filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Deriving the wordings                                                       */
/* -------------------------------------------------------------------------- */

describe("the wordings derived from one question", () => {
  it("puts the question as asked first, so nothing displaces what was written", () => {
    expect(deriveWordings(FRENCH_QUESTION)[0]?.query).toBe(FRENCH_QUESTION);
    expect(deriveWordings(CONDITIONED_QUESTION)[0]?.query).toBe(CONDITIONED_QUESTION);
  });

  it("derives the dish words alone, with the words framing the question gone", () => {
    const derived = deriveWordings(FRENCH_QUESTION).map((wording) => wording.query);
    expect(derived).toContain(FRENCH_DISH_WORDS);
  });

  it("reduces to the leading dish word, which is the one naming the dish", () => {
    const derived = deriveWordings(FRENCH_QUESTION).map((wording) => wording.query);
    expect(derived).toContain(FRENCH_HEAD);
    expect(derived.indexOf(FRENCH_DISH_WORDS)).toBeLessThan(derived.indexOf(FRENCH_HEAD));
  });

  it("frames an English question in English, and a French one in French", () => {
    const english = deriveWordings(ENGLISH_QUESTION).map((wording) => wording.query);
    expect(english).toContain(ENGLISH_DISH_WORDS);
  });

  it("puts no word into a wording that the question did not carry", () => {
    for (const question of [FRENCH_QUESTION, CONDITIONED_QUESTION, ENGLISH_QUESTION]) {
      const carried = ` ${question.toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, " ")} `;
      for (const wording of deriveWordings(question).slice(1)) {
        for (const word of wordsOf(wording.query)) {
          expect(carried, `${wording.query} from ${question}`).toContain(` ${word} `);
        }
      }
    }
  });

  it("states how each wording was derived, so a reader can retype it knowingly", () => {
    for (const wording of deriveWordings(CONDITIONED_QUESTION)) {
      expect(wording.derivation.length, wording.query).toBeGreaterThan(10);
    }
  });

  it("derives no wording twice", () => {
    const derived = deriveWordings(CONDITIONED_QUESTION).map((wording) =>
      wording.query.toLowerCase(),
    );
    expect(new Set(derived).size).toBe(derived.length);
  });

  it("derives one wording from a question that is already just the dish", () => {
    expect(deriveWordings("ceviche")).toHaveLength(1);
  });

  it("derives the same list every time it is asked", () => {
    expect(deriveWordings(CONDITIONED_QUESTION)).toEqual(deriveWordings(CONDITIONED_QUESTION));
  });

  it("never derives more wordings than one source may be sent", () => {
    for (const question of [FRENCH_QUESTION, CONDITIONED_QUESTION, ENGLISH_QUESTION]) {
      expect(deriveWordings(question).length).toBeLessThanOrEqual(MAX_WORDINGS_PER_SOURCE);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* A condition is not a keyword                                                */
/* -------------------------------------------------------------------------- */

describe("what a question asks the recipe to avoid or to serve", () => {
  it("reads what the dish has to be free of", () => {
    const conditions = readConditions(CONDITIONED_QUESTION);
    expect(conditions.conditions).toEqual([
      { named: "beurre", kind: "excluded" },
      { named: "gluten", kind: "excluded" },
    ]);
  });

  it("reads a diet written the English way", () => {
    expect(readConditions(ENGLISH_QUESTION).conditions).toEqual([
      { named: "gluten", kind: "excluded" },
    ]);
    expect(readConditions("apple pie without butter").conditions).toEqual([
      { named: "butter", kind: "excluded" },
    ]);
  });

  it("reads how many the dish has to serve, in either language", () => {
    expect(readConditions(CONDITIONED_QUESTION).servings).toBe(6);
    expect(readConditions(ENGLISH_QUESTION).servings).toBe(6);
    expect(readConditions("boeuf bourguignon").servings).toBeNull();
  });

  it("keeps the whole question, conditions included, in the wording sent first", () => {
    const first = deriveWordings(CONDITIONED_QUESTION)[0]!.query;
    expect(first).toContain("sans gluten");
    expect(first).toContain("6 personnes");
  });

  it("searches for no word of a condition in a derived wording", () => {
    // A page named for what it leaves out is a page about that thing, and a
    // number of eaters is not printed in a title at all. Ranking on either
    // buries the dish.
    for (const wording of deriveWordings(CONDITIONED_QUESTION).slice(1)) {
      for (const word of ["sans", "beurre", "gluten", "personnes", "6"]) {
        expect(wordsOf(wording.query), wording.query).not.toContain(word);
      }
    }
    expect(deriveWordings(CONDITIONED_QUESTION).map((w) => w.query)).toContain(
      CONDITIONED_DISH_WORDS,
    );
  });

  it("derives nothing beyond the question when the question names only conditions", () => {
    expect(deriveWordings("sans gluten et sans lactose")).toHaveLength(1);
  });

  it("says which conditions it set aside and that no source filtered on them", async () => {
    const log: string[] = [];
    const client = scriptedClient({ answers: { [CONDITIONED_DISH_WORDS]: ["7001"] } }, {}, log);

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: CONDITIONED_QUESTION })),
    );
    const said = payload.notes.join(" ");

    expect(said).toContain("beurre");
    expect(said).toContain("gluten");
    expect(said).toMatch(/no source filtered|not applied as a condition|check the ingredient/i);
  });

  it("reads an allergy as something to leave out rather than as a word to look for", () => {
    const read = readConditions(ALLERGY_QUESTION);
    expect(read.conditions).toContainEqual({ named: "noix", kind: "allergy" });
  });

  it("keeps an allergen out of every wording it derives", () => {
    for (const wording of deriveWordings(ALLERGY_QUESTION).slice(1)) {
      expect(wordsOf(wording.query), wording.query).not.toContain("noix");
      expect(wordsOf(wording.query), wording.query).not.toContain("allergique");
    }
  });

  it("reads an exclusion whatever word the question negates with", () => {
    expect(readConditions("apple pie no butter").conditions).toContainEqual({
      named: "butter",
      kind: "excluded",
    });
    expect(readConditions("tarte aux pommes pas de beurre").conditions).toContainEqual({
      named: "beurre",
      kind: "excluded",
    });
  });

  it("reads a diet named in one word as a condition of its own", () => {
    expect(readConditions("recette vegane au foie gras").conditions).toContainEqual({
      named: "vegane",
      kind: "diet",
    });
    expect(readConditions("gateau végétarien").conditions).toContainEqual({
      named: "végétarien",
      kind: "diet",
    });
  });

  it("names an allergy back as an allergy, which is what a reader is harmed by", async () => {
    const log: string[] = [];
    const client = scriptedClient({ answers: { lasagnes: ["7002"] } }, {}, log);

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: ALLERGY_QUESTION })),
    );
    const said = payload.notes.join(" ");

    expect(said).toMatch(/states an allergy to "noix"/i);
  });

  it("says a named diet was not filtered on", async () => {
    const log: string[] = [];
    const client = scriptedClient({ answers: { "foie gras": ["7003"] } }, {}, log);

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: "recette vegane au foie gras" })),
    );
    const said = payload.notes.join(" ");

    expect(said).toContain("vegane");
    expect(said).toMatch(/no source filter|not applied|read the ingredient/i);
  });

  it("says a condition it did not recognise was sent as words rather than applied", async () => {
    const log: string[] = [];
    const client = scriptedClient({ answers: { tarte: ["7004"] } }, {}, log);

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(
        client,
        searchArgs({ query: "une tarte que ma fille pourra manger en toute securite" }),
      ),
    );

    expect(payload.notes.join(" ")).toMatch(/must not contain|has to leave out/i);
  });

  it("points a number of eaters at the argument that rescales, rather than searching for it", async () => {
    const log: string[] = [];
    const client = scriptedClient({ answers: { [CONDITIONED_DISH_WORDS]: ["7001"] } }, {}, log);

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: CONDITIONED_QUESTION })),
    );

    expect(payload.notes.join(" ")).toMatch(/servings/);
  });
});

/* -------------------------------------------------------------------------- */
/* Where a condition begins and where it ends                                  */
/* -------------------------------------------------------------------------- */

describe("the words a condition covers", () => {
  const wordingsOf = (question: string): string[] =>
    deriveWordings(question).map((wording) => wording.query);

  it("reads an allergen the sentence writes before the marker", () => {
    expect(readConditions("cookies peanut allergy").conditions).toEqual([
      { named: "peanut", kind: "allergy" },
    ]);
    expect(readConditions("pancakes, I am lactose intolerant").conditions).toEqual([
      { named: "lactose", kind: "allergy" },
    ]);
  });

  it("keeps an allergen written before the marker out of every derived wording", () => {
    for (const wording of deriveWordings("cookies peanut allergy").slice(1)) {
      expect(wordsOf(wording.query), wording.query).not.toContain("peanut");
    }
    expect(wordingsOf("cookies peanut allergy")).toContain("cookies");
    expect(wordingsOf("pancakes, I am lactose intolerant")).toContain("pancakes");
  });

  it("names an allergy stated in English back to the caller", async () => {
    const log: string[] = [];
    const client = scriptedClient({ answers: { cookies: ["7010"] } }, {}, log);

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: "cookies peanut allergy" })),
    );

    expect(payload.notes.join(" ")).toMatch(/states an allergy to "peanut"/i);
  });

  it("reads the food a marker introduces, leaving the dish before it alone", () => {
    expect(readConditions("a dessert free of dairy").conditions).toEqual([
      { named: "dairy", kind: "excluded" },
    ]);
    expect(wordingsOf("a dessert free of dairy")).toContain("dessert");
  });

  it("reads the food a marker follows, when nothing introduces one", () => {
    expect(readConditions("gluten free apple pie").conditions).toEqual([
      { named: "gluten", kind: "excluded" },
    ]);
    expect(wordingsOf("gluten free apple pie")).toContain("apple pie");
  });

  it("ends a condition at the food it names, leaving the dish to the question", () => {
    expect(readConditions("sans gluten gateau au chocolat").conditions).toEqual([
      { named: "gluten", kind: "excluded" },
    ]);
    expect(wordingsOf("sans gluten gateau au chocolat")).toContain("gateau chocolat");
  });

  it("carries a food whose name runs on through a joining word", () => {
    expect(readConditions("gateau sans farine de blé").conditions).toEqual([
      { named: "farine de blé", kind: "excluded" },
    ]);
    expect(wordingsOf("gateau sans farine de blé")).toContain("gateau");
  });

  it("reports a condition whose food it cannot read rather than naming a word at random", () => {
    expect(readConditions("des cookies et j'ai des allergies").conditions).toEqual([
      { named: null, kind: "allergy" },
    ]);
    expect(wordingsOf("des cookies et j'ai des allergies")).toContain("cookies");
  });

  it("says an unread condition was seen and that no food was set aside for it", async () => {
    const log: string[] = [];
    const client = scriptedClient({ answers: { cookies: ["7011"] } }, {}, log);

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: "des cookies et j'ai des allergies" })),
    );
    const said = payload.notes.join(" ");

    expect(said).toMatch(/states an allergy/i);
    expect(said).toMatch(/which food/i);
  });

  it("reads a question carrying no condition as a dish and nothing else", () => {
    expect(readConditions("gateau au chocolat").conditions).toEqual([]);
    expect(wordingsOf("gateau au chocolat")).toContain("gateau chocolat");
  });
});

/* -------------------------------------------------------------------------- */
/* What the block a client renders keeps                                       */
/* -------------------------------------------------------------------------- */

describe("the notes a text block keeps", () => {
  it("renders the diet note, which is the only warning such an answer carries", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      { answers: { "foie gras": ["7003"] } },
      { answers: { "foie gras": ["Foie_Gras"] } },
      log,
    );

    const text = textOf(
      await runSearchRecipes(client, searchArgs({ query: "recette vegane au foie gras" })),
    );

    expect(text).toContain("vegane");
    expect(text).toMatch(/read the ingredient list/i);
  });
});

/* -------------------------------------------------------------------------- */
/* What actually goes out                                                      */
/* -------------------------------------------------------------------------- */

describe("a question no source answers as asked", () => {
  it("reaches the dish through a derived wording instead of returning an absence", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      { answers: { [FRENCH_DISH_WORDS]: ["13102"] } },
      { answers: { [FRENCH_HEAD]: ["Ceviche"] } },
      log,
    );

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION })),
    );

    expect(payload.results.map((row) => row.id)).toEqual(
      expect.arrayContaining(["marmiton:13102", "cookbook:Cookbook:Ceviche"]),
    );
    expect(asked(log, "marmiton")).toContain(FRENCH_DISH_WORDS);
    expect(asked(log, "cookbook")).toContain(FRENCH_HEAD);
  });

  it("names every wording it sent and what each one returned", async () => {
    const log: string[] = [];
    const client = scriptedClient({ answers: { [FRENCH_DISH_WORDS]: ["13102"] } }, {}, log);

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION })),
    );
    const trace = reportFor(payload, "marmiton").wordings;
    const ran = trace.filter((entry) => entry.ran);

    expect(ran.map((entry) => entry.query)).toEqual(asked(log, "marmiton"));
    // A wording that returned nothing is a statement about that wording.
    expect(ran.find((entry) => entry.query === FRENCH_QUESTION)?.count).toBe(0);
    expect(ran.find((entry) => entry.query === FRENCH_DISH_WORDS)?.count).toBe(1);
    expect(ran.find((entry) => entry.query === FRENCH_DISH_WORDS)?.added).toBe(1);
  });

  it("puts a wording it derived into the text block, so the search can be redone by hand", async () => {
    const log: string[] = [];
    const client = scriptedClient({ answers: { [FRENCH_DISH_WORDS]: ["13102"] } }, {}, log);

    const text = textOf(await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION })));
    expect(text).toContain(FRENCH_DISH_WORDS);
  });
});

describe("the number of requests", () => {
  it("sends one wording to each source when the first one fills the limit", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      { answers: { [FRENCH_QUESTION]: ["ceviche-1", "ceviche-2"] } },
      { answers: { [FRENCH_QUESTION]: ["Ceviche_A", "Ceviche_B"] } },
      log,
    );

    await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION, limit_per_source: 2 }));
    expect(log).toHaveLength(2);
  });

  it("counts rows naming the dish, not rows, when deciding it has enough", async () => {
    // One of these sites answers almost anything rather than nothing, and a
    // question written as a sentence fills a page with recipes that share its
    // framing words. Stopping on the number of rows would take that page for an
    // answer and never send the wording that reaches the dish.
    const log: string[] = [];
    const client = scriptedClient(
      {
        answers: {
          // A page of recipes that merely share the question's framing words.
          [FRENCH_QUESTION]: ["10811", "95101", "14107", "52263", "48053"],
          [FRENCH_DISH_WORDS]: ["ceviche-13102"],
        },
      },
      {},
      log,
    );

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION, limit_per_source: 5 })),
    );

    expect(asked(log, "marmiton")).toContain(FRENCH_DISH_WORDS);
    // The row naming the dish came from the second wording, and it must not be
    // cut away by the first wording's page to fit the limit.
    expect(payload.results.map((row) => row.id)).toContain("marmiton:ceviche-13102");
    expect(payload.results[0]?.id).toBe("marmiton:ceviche-13102");
    expect(payload.notes.join(" ")).toMatch(/naming the dish/i);
  });

  it("stops at the first wording when its rows do name the dish", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      { answers: { [FRENCH_QUESTION]: ["ceviche-1", "ceviche-2"] } },
      {},
      log,
    );

    await runSearchRecipes(
      client,
      searchArgs({ query: FRENCH_QUESTION, limit_per_source: 2, sources: ["marmiton"] }),
    );
    expect(asked(log, "marmiton")).toEqual([FRENCH_QUESTION]);
  });

  it("never sends more than the ceiling to one source", async () => {
    const log: string[] = [];
    const client = scriptedClient({}, {}, log);

    await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION, limit_per_source: 5 }));
    expect(asked(log, "marmiton").length).toBeLessThanOrEqual(MAX_WORDINGS_PER_SOURCE);
    expect(asked(log, "cookbook").length).toBeLessThanOrEqual(MAX_WORDINGS_PER_SOURCE);
  });

  it("asks one source for a second wording rather than for a second page of the first", async () => {
    // Marmiton serves one page of results and disallows paging past it, so more
    // results are only ever reached by asking a different wording. Sending the
    // same wording twice would spend an interval to receive the same page.
    const log: string[] = [];
    const client = scriptedClient({}, {}, log);

    await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION, limit_per_source: 25 }));
    const sent = asked(log, "marmiton");
    expect(new Set(sent).size).toBe(sent.length);
  });

  it("sends the words as asked and nothing else when the fan-out is turned off", async () => {
    const log: string[] = [];
    const client = scriptedClient({}, {}, log);

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION, fan_out: false })),
    );

    expect(asked(log, "marmiton")).toEqual([FRENCH_QUESTION]);
    expect(asked(log, "cookbook")).toEqual([FRENCH_QUESTION]);
    // The wordings it could have sent are still named, so a caller can see what
    // turning the argument back on would buy.
    const withheld = reportFor(payload, "marmiton").wordings.filter((entry) => !entry.ran);
    expect(withheld.length).toBeGreaterThan(0);
    for (const entry of withheld) {
      expect(entry.not_run_because).toMatch(/fan_out/);
    }
  });

  it("stops asking a source that did not answer the wording before", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      { fails: { [FRENCH_QUESTION]: new FakeSourceError("network_error", "connection reset") } },
      {},
      log,
    );

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION })),
    );

    expect(asked(log, "marmiton")).toEqual([FRENCH_QUESTION]);
    expect(reportFor(payload, "marmiton").status).toBe("failed");
  });

  it("keeps a source that answered as asked out of the failures when a derived wording fails", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      {
        answers: { [FRENCH_QUESTION]: ["1"] },
        fails: { [FRENCH_DISH_WORDS]: new FakeSourceError("timeout", "the request ran out") },
      },
      {},
      log,
    );

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION, limit_per_source: 5 })),
    );
    const report = reportFor(payload, "marmiton");

    expect(report.status).toBe("answered");
    expect(report.wordings.find((entry) => entry.error)?.error?.code).toBe("timeout");
  });

  it("reads a results page the site answers with a 404 as an absence and carries on", async () => {
    // Marmiton answers its own search page with a 404 when nothing matches. That
    // is the site stating an absence, so the next wording still goes out.
    const log: string[] = [];
    const client = scriptedClient(
      {
        answers: { [FRENCH_DISH_WORDS]: ["13102"] },
        fails: { [FRENCH_QUESTION]: new FakeSourceError("not_found", "no results page") },
      },
      {},
      log,
    );

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION })),
    );
    const report = reportFor(payload, "marmiton");

    expect(report.status).toBe("answered");
    expect(report.wordings.find((entry) => entry.query === FRENCH_QUESTION)?.count).toBe(0);
    expect(report.count).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* The union of what came back                                                 */
/* -------------------------------------------------------------------------- */

describe("the union of what came back", () => {
  it("keeps one row where two wordings returned the same recipe", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      {
        answers: {
          [FRENCH_QUESTION]: ["13102"],
          [FRENCH_DISH_WORDS]: ["13102"],
          [FRENCH_HEAD]: ["13102", "88500"],
        },
      },
      {},
      log,
    );

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION, limit_per_source: 5 })),
    );
    const ids = payload.results.map((row) => row.id);

    expect(ids.filter((id) => id === "marmiton:13102")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps two rows where two sources minted the same reference", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      { answers: { ceviche: ["Ceviche"] } },
      { answers: { ceviche: ["Ceviche"] } },
      log,
    );

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: "ceviche", limit_per_source: 5 })),
    );

    expect(payload.results.map((row) => row.id).sort()).toEqual([
      "cookbook:Cookbook:Ceviche",
      "marmiton:Ceviche",
    ]);
  });

  it("calls the order its own rather than any source's judgement of relevance", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      { answers: { [FRENCH_DISH_WORDS]: ["13102", "88500"] } },
      { answers: { [FRENCH_HEAD]: ["Ceviche"] } },
      log,
    );

    const payload = payloadOf<SearchPayload>(
      await runSearchRecipes(client, searchArgs({ query: FRENCH_QUESTION, limit_per_source: 5 })),
    );

    expect(payload.order).toMatch(/no score|not ranked|rather than ranked/i);
    expect(payload.notes.join(" ")).toMatch(/wording/i);
  });
});
