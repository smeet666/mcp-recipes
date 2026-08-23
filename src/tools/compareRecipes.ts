/**
 * compare_recipes: the same dish, as each source writes it.
 *
 * This is the one tool that exists because there is more than one source. A
 * French kitchen and an English one write the same dish differently, and the
 * difference is the answer: what each asks for, what each measures in, how many
 * it serves, and what each source publishes about a recipe at all.
 *
 * Nothing is ranked. The sources share no score, and declaring a winner would
 * mean inventing one.
 */

import { z } from "zod";
import type { RecipesClient } from "../sources/client.js";
import { dishWordsMissing } from "../sources/wordings.js";
import type { RecipeDetail, SourceId, SourceReport } from "../types.js";
import { buildRecipeView, recipeSchema, renderYield, SECTIONS } from "./recipeView.js";
import type { RecipePayload, Section } from "./recipeView.js";
import type { RecipeView } from "./recipeView.js";
import {
  creditLine,
  fitLines,
  mustKeep,
  omittedLinesLine,
  noteTexts,
  ok,
  quoteForeign,
  roomForBody,
  reportNotes,
  reportSchema,
  toReportPayload,
  toToolError,
  withRead,
} from "./shared.js";
import type { Note } from "./shared.js";
import { strictInput } from "./arguments.js";
import type { ToolResult } from "./shared.js";

/**
 * Why nothing was compared.
 *
 * A version that was offered and could not be read is a different statement
 * from no source offering one at all: the first says the dish is out there.
 */
function nothingWasCompared(someWereUnread: boolean, dish: string): string {
  if (someWereUnread) {
    return `Every version of "${quoteForeign(dish)}" that was offered could not be read, so nothing was compared.`;
  }
  return `No source offered a recipe for "${quoteForeign(dish)}".`;
}

export const compareRecipesDescription = [
  "Take a dish and show how each source writes it, side by side.",
  "Each source's closest match is read in full, and all of them can be rescaled to the same number of servings so the ingredient lists stand comparison.",
  "The answer states what differs and leaves it there: the quantities each asks for, what each measures in, what each yields, and which fields each source publishes at all.",
  "No version is ranked above another. Some sources carry reader ratings and some have no author and no rating by nature, so there is no score they share.",
  "When only one source answers, the answer says so and shows that one rather than presenting part of a comparison as the whole of it.",
].join(" ");

export const compareRecipesInput = strictInput({
  dish: z
    .string()
    .min(1)
    .max(200)
    .describe("The dish to compare, in any of the languages the sources publish in."),
  servings: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Rescale every version to this many, which is what makes the lists comparable."),
  sections: z
    .array(z.enum(SECTIONS))
    .default(["ingredients"])
    .describe("Which parts of each version to return. Several full recipes is a lot of text."),
  max_steps: z.number().int().min(1).max(100).default(10).describe("Steps to return per version."),
  max_step_chars: z
    .number()
    .int()
    .min(80)
    .max(4000)
    .default(600)
    .describe("Characters kept per step. Raise it only if a step was cut mid-sentence."),
});

export const compareRecipesOutput = z.object({
  dish: z.string(),
  versions: z.array(recipeSchema),
  differences: z
    .array(z.string())
    .describe("What differs between the versions, stated as fact. No version is ranked."),
  per_source: z.array(reportSchema),
  notes: z.array(z.string()),
});

export type CompareRecipesArgs = z.infer<typeof compareRecipesInput>;

/** Ingredient lines each version shows in the text block. */
const TEXT_INGREDIENT_LINES = 8;

/** Differences the text block states before pointing at the rest. */
const TEXT_DIFFERENCE_LINES = 4;

/** Sources named the way a sentence names them. */
function listNames(names: string[]): string {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * Which versions actually answer to the dish that was asked for.
 *
 * A title sharing one word with the question is not the dish: "biscuits and
 * gravy" and a tin of Christmas biscuits share the biscuit, and setting them
 * side by side would present a search that missed as a difference between two
 * traditions.
 */
function weighTitlesAgainstTheDish(
  payloads: readonly RecipeView["payload"][],
  dish: string,
  notes: RecipeView["notes"][number][],
): Array<{ payload: RecipeView["payload"]; missing: readonly string[] }> {
  const weighed = payloads.map((payload) => ({
    payload,
    missing: dishWordsMissing(payload.title, dish),
  }));
  const carriesDish = weighed.some((one) => one.missing.length === 0);

  weighed.forEach(({ payload, missing }) => {
    if (missing.length === 0) {
      return;
    }
    notes.push(
      mustKeep(
        `${payload.source_name}'s closest row is ${quoteForeign(payload.title)}, whose title ` +
          `carries no ${missing.map((word) => `"${quoteForeign(word)}"`).join(" and no ")}. ` +
          "Read it as a candidate to check rather than as that dish.",
      ),
    );
  });

  if (payloads.length > 0 && !carriesDish) {
    notes.push(
      `No version here carries the whole of "${quoteForeign(dish)}" in its title. These are ` +
        "the closest rows each source returned for that spelling, so read them as candidates to " +
        "check rather than as that dish.",
    );
  }

  if (payloads.length === 1 && carriesDish) {
    notes.push(
      mustKeep(
        "This is one version rather than a comparison. Read it as what that one source publishes.",
      ),
    );
  }

  // A difference is a statement about one dish written two ways. Setting a
  // row that answers to another name beside it turns a search that missed
  // into a claim about two traditions.

  return weighed;
}

/**
 * Say what the versions do differently, and say nothing where they agree.
 *
 * A field one source has and another does not is the most useful thing a
 * comparison can report, and the least tempting to turn into a ranking: a wiki
 * has no author because everyone edited the page, which says nothing about the
 * recipe. Where every version says the same thing there is no difference to
 * report, and reporting one anyway costs a reader's trust in the rest.
 *
 * A difference is only stated about a part of the recipe the answer carries.
 * The sections a call leaves out come back empty, and the answer says so, so a
 * sentence comparing one of them describes something the reader was told is not
 * there and cannot check.
 */
function describeDifferences(
  recipes: RecipeDetail[],
  payloads: RecipePayload[],
  sections: readonly Section[],
): string[] {
  if (recipes.length < 2) {
    return [];
  }
  const differences: string[] = [];
  const nameOf = (recipe: RecipeDetail) => recipe.sourceName;

  const stated = payloads.map((payload) => ({
    name: payload.source_name,
    text: payload.yield.original_text ?? "no stated amount",
  }));
  if (new Set(stated.map((one) => one.text)).size > 1) {
    differences.push(
      `${stated.map((one) => `${one.name} yields ${quoteForeign(one.text)}`).join("; ")}.`,
    );
  }

  const counts = payloads.map((payload) => payload.ingredients.length);
  if (new Set(counts).size > 1 && counts.every((value) => value > 0)) {
    differences.push(
      `${payloads
        .map(
          (payload) =>
            `${payload.source_name} lists ${payload.ingredients.length} ingredient lines`,
        )
        .join("; ")}.`,
    );
  }

  if (sections.includes("times")) {
    const timed = recipes.filter((recipe) => recipe.totalMinutes !== null);
    const untimed = recipes.filter((recipe) => recipe.totalMinutes === null);
    if (timed.length > 0 && new Set(timed.map((recipe) => recipe.totalMinutes)).size > 1) {
      differences.push(
        `${timed.map((recipe) => `${nameOf(recipe)} states ${recipe.totalMinutes} minutes`).join("; ")}.`,
      );
    }
    if (timed.length > 0 && untimed.length > 0) {
      differences.push(
        `${listNames(untimed.map(nameOf))} states no time for this recipe, so there is nothing there to compare against.`,
      );
    }
  }

  const rated = recipes.filter((recipe) => recipe.rating !== null);
  if (rated.length > 0 && rated.length < recipes.length) {
    differences.push(
      `Only ${listNames(rated.map(nameOf))} carries a reader rating, so the versions cannot be compared on one.`,
    );
  }

  const credited = recipes.filter((recipe) => recipe.author !== null);
  if (credited.length > 0 && credited.length < recipes.length) {
    differences.push(
      `Only ${listNames(credited.map(nameOf))} credits an author; the rest are written by whoever edited the page.`,
    );
  }

  for (const recipe of recipes) {
    const license = recipe.license;
    if (license === null) {
      continue;
    }
    differences.push(
      `${nameOf(recipe)} publishes under ${quoteForeign(license.title)}, which asks for attribution.`,
    );
  }
  const silent = recipes.filter((recipe) => recipe.license === null);
  if (silent.length > 0 && silent.length < recipes.length) {
    differences.push(
      `${listNames(silent.map(nameOf))} states no terms of use. Silence is not permission.`,
    );
  }

  return differences;
}

export async function runCompareRecipes(
  client: RecipesClient,
  args: CompareRecipesArgs,
): Promise<ToolResult> {
  try {
    // A few rows from each source is enough: the point is the traditions side
    // by side rather than a long list from any of them.
    const merged = await client.searchRecipes(args.dish, 3);

    const best = new Map<SourceId, string>();
    for (const row of merged.rows) {
      if (!best.has(row.source)) {
        best.set(row.source, row.id);
      }
    }

    const offered = [...best.entries()];
    const reads = await Promise.allSettled(offered.map(([, id]) => client.getRecipe(id)));

    const recipes: RecipeDetail[] = [];
    /** Sources whose row was found and whose page then could not be read. */
    const unread = new Map<SourceId, { code: string; message: string }>();
    /** Sources whose row was opened, whichever way that went. */
    const opened = new Set<SourceId>();

    reads.forEach((read, index) => {
      const source = offered[index]?.[0];
      if (source === undefined) {
        return;
      }
      opened.add(source);
      if (read.status === "fulfilled") {
        recipes.push(read.value.recipe);
        return;
      }
      const reason = read.reason as { code?: string; message?: string } | undefined;
      unread.set(source, {
        code: reason?.code ?? "network_error",
        message: reason?.message ?? "unknown",
      });
    });

    const views = recipes.map((recipe) =>
      buildRecipeView(recipe, {
        servings: args.servings ?? null,
        sections: args.sections as readonly Section[],
        maxSteps: args.max_steps,
        maxStepChars: args.max_step_chars,
        label: recipe.sourceName,
        // The choice of sections belongs to the call rather than to a version,
        // so it is said once below instead of once per recipe.
        announceSections: false,
      }),
    );
    const payloads = views.map((view) => view.payload);

    const notes: Note[] = reportNotes(merged.reports);
    for (const view of views) {
      notes.push(...view.notes);
    }

    const omitted = SECTIONS.filter((section) => !args.sections.includes(section));
    if (omitted.length > 0) {
      notes.push(
        `Not requested, so not returned on any version: ${omitted.join(", ")}. Name them in 'sections' to see them.`,
      );
    }

    // Three reasons a source can be missing from a comparison, and they are
    // three different statements about the world. Reading a fetch failure as
    // "that source offered nothing" is the one that turns a bad minute into a
    // claim about what a corpus holds.
    for (const report of merged.reports) {
      if (recipes.some((recipe) => recipe.source === report.source)) {
        continue;
      }
      const failedRead = unread.get(report.source);
      if (report.status === "failed") {
        notes.push(
          mustKeep(
            `${report.name} is missing from this comparison because its search did not answer (${quoteForeign(
              `${report.error?.code ?? "unknown"}: ${report.error?.message ?? "unknown"}`,
            )}). Nothing here is evidence about what it holds.`,
          ),
        );
      } else if (failedRead) {
        notes.push(
          mustKeep(
            `${report.name}'s search answered and offered a version, and that version could not be read (${quoteForeign(
              `${failedRead.code}: ${failedRead.message}`,
            )}). The failure is in the reading, so nothing here says whether ${report.name} holds this dish.`,
          ),
        );
      } else {
        notes.push(
          mustKeep(
            `${report.name} answered and offered nothing close enough to "${quoteForeign(args.dish)}" to compare.`,
          ),
        );
      }
    }

    // One of these indexes answers almost any spelling with its closest row, so
    // a dish nobody publishes still comes back as a recipe. Presenting that row
    // as a source's version of the dish states as fact the one thing the search
    // did not establish, and sharing one word of a name is not carrying it:
    // "biscuits and gravy" and a tin of Christmas biscuits share the biscuit.
    const weighed = weighTitlesAgainstTheDish(payloads, args.dish, notes);
    const comparable = recipes.filter((recipe) =>
      weighed.some(
        ({ payload, missing }) =>
          missing.length === 0 && payload.id === recipe.id && payload.source === recipe.source,
      ),
    );
    const differences =
      comparable.length === payloads.length
        ? describeDifferences(recipes, payloads, args.sections as readonly Section[])
        : [];
    if (payloads.length > 1 && differences.length === 0 && comparable.length < payloads.length) {
      notes.push(
        mustKeep(
          "Nothing is set side by side here: not every version's title carries the dish that was " +
            "asked for, so what separates them may be that they are different dishes.",
        ),
      );
    }
    if (payloads.length > 1) {
      notes.push(
        "Quantities are shown in the units each source published. Nothing was converted between " +
          "measuring systems, so a gram in one version and a cup in another are two ways of " +
          "writing a recipe rather than one quantity restated.",
      );
    }

    const credit = creditLine(
      payloads.map((payload) => ({ attribution: payload.attribution, url: payload.url })),
    );
    // The differences a reader most needs are the ones about the recipes
    // themselves, and they come first. The rest stay in the structured output
    // rather than taking the room the versions need.
    const shownDifferences = differences.slice(0, TEXT_DIFFERENCE_LINES);
    const moreDifferences = differences.length - shownDifferences.length;
    const differencesBlock =
      differences.length > 0
        ? `What differs:\n${shownDifferences.map((line) => `- ${line}`).join("\n")}${
            moreDifferences > 0
              ? `\n- … and ${moreDifferences} more, in full in the structured output`
              : ""
          }\n\n`
        : "";

    // Every version has to fit, so the room left after the differences and the
    // trailer is shared out equally: each version shows an opening rather than
    // the first one filling the block and the rest being cut away.
    const share =
      payloads.length === 0
        ? 0
        : (roomForBody({ notes, credit }) - differencesBlock.length) / payloads.length;

    const versionBlocks = payloads.map((payload) => {
      const head = [
        `${quoteForeign(payload.source_name)}: ${quoteForeign(payload.title)}`,
        `  ${quoteForeign(payload.url)}`,
        // The yield is the page's, and the list under it is the one the factor
        // produced. Stating the first alone above the second reads as a list
        // for that many people.
        `  ${renderYield(payload)}`,
      ];
      const offered = payload.ingredients
        .slice(0, TEXT_INGREDIENT_LINES)
        .map((entry) => `  - ${quoteForeign(entry.text)}`);
      const fitted = fitLines(offered, share - head.join("\n").length);

      const lines = [...head, ...fitted.lines];
      const hidden = payload.ingredients.length - fitted.lines.length;
      if (hidden > 0) {
        lines.push(
          `  ${omittedLinesLine(fitted.lines.length, payload.ingredients.length, "ingredient lines")}`,
        );
      }
      return lines.join("\n");
    });

    const body =
      payloads.length === 0
        ? nothingWasCompared(unread.size > 0, args.dish)
        : versionBlocks.join("\n\n");

    // What differs comes first. It is the answer to the question that was
    // asked, and it is short, so it survives a text block cut to fit while
    // several full ingredient lists never could.
    const summary = `${differencesBlock}${body}`;

    return ok(
      {
        dish: args.dish,
        versions: payloads,
        differences,
        // Two moments per source, told apart: whether the search answered, and
        // what became of the row it offered.
        per_source: merged.reports.map((report) => {
          const payload = toReportPayload(report);
          if (!opened.has(report.source)) {
            return payload;
          }
          const failedRead = unread.get(report.source);
          return withRead(
            payload,
            failedRead
              ? { status: "failed", error: { code: failedRead.code, message: failedRead.message } }
              : { status: "read", error: null },
          );
        }),
        notes: noteTexts(notes),
      },
      summary,
      { notes, credit },
    );
  } catch (error) {
    return toToolError(error);
  }
}

export type { SourceReport };
