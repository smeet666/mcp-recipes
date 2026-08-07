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
import type { SourceId } from "../types.js";
import {
  creditLine,
  ok,
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
  "Some sources keep recipes and reference pages together, so a row can be a page about an ingredient rather than a recipe using it. Only get_recipe can tell them apart, and it says when a page carries no ingredient list.",
  "The query goes to each source's own search as free text. There is no filtering: a word naming a diet, a time or a calorie count matches only where that source's index happens to carry it.",
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

/**
 * Whether a row's title carries a word of the query.
 *
 * Accents and punctuation are folded away, so "crêpes" reads the same as
 * "crepes" and a namespace in front of a page name settles nothing. Words of
 * two letters are ignored, since an article says nothing about the subject.
 */
function titleCarries(title: string, query: string): boolean {
  const fold = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/œ/g, "oe")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ");

  const haystack = ` ${fold(title)} `;
  const words = fold(query)
    .split(" ")
    .filter((word) => word.length > 2);
  if (words.length === 0) return true;
  return words.some((word) => haystack.includes(` ${word}`));
}

export async function runSearchRecipes(
  client: RecipesClient,
  args: SearchRecipesArgs,
): Promise<ToolResult> {
  try {
    const merged = await client.searchRecipes(
      args.query,
      args.limit_per_source,
      args.sources as readonly SourceId[] | undefined,
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
          ? `Every row came from ${contributed[0]!.name}, in the order it returned them.`
          : "No source contributed a row.";

    // A long question reads like a request for filtering, and none is applied:
    // the words go to each source's own search as they were typed. A caller
    // told nothing would report "desserts under 300 calories" as a filtered
    // answer, when the number was matched as text or matched nothing at all.
    if (args.query.trim().split(/\s+/).length > WORDS_BEFORE_SAYING_SO) {
      notes.push(
        "This query went to each source as free text and no filter was applied to it. Words like " +
          "'vegan' or 'under 300 calories' help only where a source's own index happens to match " +
          "them, so read the rows rather than assuming they meet every condition.",
      );
    }

    // A source ranking a title on the letters it opens with answers "chameau"
    // with a chapeau and three châteaux. The rows are what the sources offered,
    // and a reader shown them without a word about it takes them for the dish.
    if (results.length > 0 && !results.some((row) => titleCarries(row.title, args.query))) {
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

    const body =
      results.length > 0
        ? `${results.length} recipes for "${args.query}":\n${renderRows(results)}`
        : answered.length === 0
          ? `No source answered for "${args.query}", so nothing here says whether such a recipe exists.`
          : `Nothing came back for "${args.query}".`;

    return ok(
      {
        query: args.query,
        results,
        result_count: results.length,
        per_source: merged.reports.map(toReportPayload),
        order,
        notes,
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
