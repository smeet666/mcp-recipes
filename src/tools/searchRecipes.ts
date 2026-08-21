/**
 * search_recipes: one question, every source, one list.
 *
 * The calls go out together, so asking them all costs about what asking one
 * costs. What each source said about its own results is reported beside the
 * rows, because those numbers count different things and adding them would
 * invent a figure no source published.
 */

import { z } from "zod";
import type { RecipesClient } from "../sources/client.js";
import { namesDish, readConditions } from "../sources/wordings.js";
import type { ConditionKind } from "../sources/wordings.js";
import type { SourceId } from "../types.js";
import {
  creditLine,
  mustKeep,
  noteTexts,
  ok,
  quoteForeign,
  renderRows,
  reportNotes,
  reportSchema,
  rowSchema,
  toReportPayload,
  toRowPayload,
  toToolError,
} from "./shared.js";
import { strictInput } from "./arguments.js";
import type { ToolResult } from "./shared.js";

export const searchRecipesDescription = [
  "Search every recipe source this server reads, at the same time, for a dish or an ingredient, and get one merged list.",
  "Each row carries the id get_recipe takes, and that id names the source it came from, so nothing has to be guessed afterwards.",
  "The sources are written in different languages and count their own results differently, so 'per_source' says what each one answered, what its own number means, and names any that failed. A short list is never evidence of what exists.",
  "Some sources keep recipes and reference pages together, so a row can be a page about an ingredient rather than a recipe using it. Only get_recipe can tell them apart, and it says what it read off the page.",
  "The query goes to each source's own search as free text. There is no filtering: a word naming a diet, a time or a calorie count matches only where that source's index happens to carry it.",
  "Ask in a whole sentence if that is the question. These indexes answer the words they are handed, so a sentence is also sent as the words naming the dish and as the dish word alone, and the rows are the union; 'per_source' lists every wording and what it returned.",
  "What the question says the recipe must not hold is set aside from those shorter wordings rather than searched for, and named back in the notes: a negation, an allergy stated as one, a diet named in one word, and the number of people at the table. No source filters on any of it, so open a row with get_recipe and read the ingredient list before calling it suitable.",
  "A condition is read with the food on whichever side of it the sentence put one, so 'allergique aux noix' and 'peanut allergy' both name the nut. Where a sentence puts a food on neither side, the notes say a condition was stated and that its food was not read, because naming the wrong word would hide a dish and search for the food being avoided at once.",
  "Rows are interleaved one source at a time rather than ranked, because the sources share no score that could order them against each other.",
].join(" ");

export const searchRecipesInput = strictInput({
  query: z
    .string()
    .min(1)
    .max(200)
    .describe("A dish or an ingredient, in any of the languages the sources publish in."),
  limit_per_source: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(5)
    .describe("Rows to take from each source, so one source cannot fill the whole list."),
  sources: z
    .array(z.string())
    .optional()
    .describe(
      "Sources to ask, by id. Left out, they are all asked, which is the point of this tool. The ids are the ones 'per_source' reports.",
    ),
  fan_out: z
    .boolean()
    .default(true)
    .describe(
      "Whether a question may also be sent in shorter wordings derived from it. On, because these indexes answer the words they are handed: a question written as a sentence comes back empty from a corpus holding several of the dish. Turn it off to send exactly the words typed; 'per_source' then names the wordings that were withheld.",
    ),
});

export const searchRecipesOutput = z.object({
  query: z.string(),
  results: z.array(rowSchema),
  result_count: z.number().int().describe("Rows in this answer, across every source."),
  per_source: z.array(reportSchema),
  order: z.string().describe("How the list was built, in words."),
  notes: z.array(z.string()),
});

export type SearchRecipesArgs = z.infer<typeof searchRecipesInput>;

/**
 * Beyond this many words a question is asking for conditions rather than naming
 * a dish, so the answer says that none of them were applied as conditions.
 */
const WORDS_BEFORE_SAYING_SO = 4;

export async function runSearchRecipes(
  client: RecipesClient,
  args: SearchRecipesArgs,
): Promise<ToolResult> {
  try {
    const merged = await client.searchRecipes(
      args.query,
      args.limit_per_source,
      args.sources as readonly SourceId[] | undefined,
      { fanOut: args.fan_out },
    );

    const results = merged.rows.map(toRowPayload);
    const notes = reportNotes(merged.reports);

    const answered = merged.reports.filter((report) => report.status === "answered");
    const contributed = merged.reports.filter((report) => report.count > 0);

    // How the order was built depends on how many sources are in it. Describing
    // a merge that did not happen tells a caller the list means something it
    // does not.
    const order =
      contributed.length > 1
        ? "One row from each source in turn, in the order each source returned them. No score orders them against each other."
        : contributed.length === 1
          ? `Every row came from ${contributed[0]?.name}, in the order it returned them.`
          : "No source contributed a row.";

    // What a question asks the dish to avoid is the part of it no source can
    // answer, and the part a reader is most harmed by getting wrong. A recipe
    // returned here may hold exactly the ingredient the person was avoiding, so
    // the conditions are named back rather than left to be assumed met.
    const conditions = readConditions(args.query);
    const named = (kind: ConditionKind): string =>
      conditions.conditions
        .filter((condition) => condition.kind === kind && condition.named !== null)
        .map((condition) => `"${quoteForeign(condition.named as string)}"`)
        .join(" and ");
    // A condition whose food could not be read is still a condition the person
    // set, and the one thing an answer must not do with it is stay quiet.
    const unread = (kind: ConditionKind): boolean =>
      conditions.conditions.some(
        (condition) => condition.kind === kind && condition.named === null,
      );

    // An allergy is named as one. It is the same fact as an exclusion and not
    // the same stake: a row that turns out to carry the ingredient is a dish
    // somebody cannot eat.
    const allergies = named("allergy");
    if (allergies !== "") {
      notes.push(
        mustKeep(
          `This question states an allergy to ${allergies}. No source filtered on it, and none can: ` +
            "these are searches over what a page holds rather than over what it leaves out, so a row " +
            "here may be a recipe built on that ingredient. Open every row with get_recipe and read " +
            "the whole ingredient list before cooking from it.",
        ),
      );
    }
    if (unread("allergy")) {
      notes.push(
        mustKeep(
          "This question states an allergy, and the words around it do not say plainly which food " +
            "it names, so no food was read from it and none is named here. Nothing was set aside " +
            "and no source filters on an allergy in any case: open every row with get_recipe and " +
            "read the whole ingredient list before cooking from it.",
        ),
      );
    }

    const excluded = named("excluded");
    if (excluded !== "") {
      notes.push(
        mustKeep(
          `This question asks for a recipe free of ${excluded}. No source filtered on that, and none ` +
            "can: these are searches over what a page holds rather than over what it leaves out. " +
            "Open a row with get_recipe and check the ingredient list before calling it suitable.",
        ),
      );
    }
    if (unread("excluded")) {
      notes.push(
        mustKeep(
          "This question says the recipe must leave something out, and the words around it do not " +
            "say plainly which food it names, so nothing was read from it and nothing is named " +
            "here. Open a row with get_recipe and read the ingredient list before calling it " +
            "suitable.",
        ),
      );
    }

    const diets = named("diet");
    if (diets !== "") {
      notes.push(
        mustKeep(
          `This question names a diet: ${diets}. A diet is a rule about what a recipe leaves out, and ` +
            "no source filters on one, so the word was sent as text and matches only where a source's " +
            "index happens to carry it. Open a row with get_recipe and read the ingredient list " +
            "before calling it suitable.",
        ),
      );
    }
    if (conditions.servings !== null) {
      notes.push(
        mustKeep(
          `This question asks for ${conditions.servings} servings. That is not something a search ` +
            "matches, so it was not looked for. Pass 'servings' to get_recipe or compare_recipes to " +
            "rescale a recipe once one is chosen.",
        ),
      );
    }

    // A long question reads like a request for filtering, and none is applied:
    // the words go to each source's own search as they were typed. A caller
    // told nothing would report "desserts under 300 calories" as a filtered
    // answer, when the number was matched as text or matched nothing at all.
    // This is said even where a condition was read by name, because the ones
    // read by name are the ones this server can recognise and a question can
    // carry others.
    if (args.query.trim().split(/\s+/).length > WORDS_BEFORE_SAYING_SO) {
      notes.push(
        mustKeep(
          "This query went to each source as free text and no filter was applied to it. Anything the " +
            "question said the recipe must not contain went out as words like the rest of it, so read " +
            "the rows rather than assuming they meet it.",
        ),
      );
    }

    // A source ranking a title on the letters it opens with answers "chameau"
    // with a chapeau and three châteaux. The rows are what the sources offered,
    // and a reader shown them without a word about it takes them for the dish.
    if (results.length > 0 && !results.some((row) => namesDish(row.title, args.query))) {
      notes.push(
        `No title here carries a word of "${args.query}". These rows are what the sources ranked ` +
          "for that spelling, so read them as candidates to check rather than as recipes for the dish.",
      );
    }

    if (results.length === 0 && answered.length === merged.reports.length) {
      notes.push(
        "Every source answered and none holds anything under this wording. Try the dish's name in another language, or name a main ingredient instead.",
      );
    }

    // A reader who can see what was actually sent can redo the search by hand,
    // and can tell a wording that found nothing from a corpus that holds
    // nothing. The words as asked are left out of this line: they are already
    // at the head of the answer.
    const derived = [
      ...new Set(
        merged.reports.flatMap((report) =>
          report.wordings
            .filter((attempt) => attempt.ran && attempt.query !== args.query.trim())
            .map((attempt) => attempt.query),
        ),
      ),
    ];
    const alsoSent =
      derived.length > 0
        ? `\nAlso searched for: ${derived.map((wording) => `"${quoteForeign(wording)}"`).join(", ")}.`
        : "";

    const body =
      results.length > 0
        ? `${results.length} recipes for "${args.query}":\n${renderRows(results)}${alsoSent}`
        : answered.length === 0
          ? `No source answered for "${args.query}", so nothing here says whether such a recipe exists.`
          : `Nothing came back for "${args.query}".${alsoSent}`;

    return ok(
      {
        query: args.query,
        results,
        result_count: results.length,
        per_source: merged.reports.map(toReportPayload),
        order,
        notes: noteTexts(notes),
      },
      body,
      {
        notes,
        credit: creditLine(
          contributed.map((report) => ({ attribution: `Source: ${report.name}` })),
        ),
      },
    );
  } catch (error) {
    return toToolError(error);
  }
}
