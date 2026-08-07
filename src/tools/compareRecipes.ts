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
import type { RecipeDetail, SourceId, SourceReport } from "../types.js";
import { buildRecipeView, recipeSchema, SECTIONS } from "./recipeView.js";
import type { RecipePayload, Section } from "./recipeView.js";
import {
  creditLine,
  ok,
  quoteForeign,
  roomForBody,
  reportNotes,
  reportSchema,
  toReportPayload,
  toToolError,
} from "./shared.js";
import { strictInput } from "./arguments.js";
import type { ToolResult } from "./shared.js";

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
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Say what the versions do differently, and say nothing where they agree.
 *
 * A field one source has and another does not is the most useful thing a
 * comparison can report, and the least tempting to turn into a ranking: a wiki
 * has no author because everyone edited the page, which says nothing about the
 * recipe. Where every version says the same thing there is no difference to
 * report, and reporting one anyway costs a reader's trust in the rest.
 */
function describeDifferences(recipes: RecipeDetail[], payloads: RecipePayload[]): string[] {
  if (recipes.length < 2) return [];
  const differences: string[] = [];
  const nameOf = (recipe: RecipeDetail) => recipe.sourceName;

  const yields = payloads.map((payload) => payload.yield.original_text ?? "no stated amount");
  if (new Set(yields).size > 1) {
    differences.push(
      `${payloads
        .map((payload, index) => `${payload.source_name} yields ${quoteForeign(yields[index]!)}`)
        .join("; ")}.`,
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

  const licensed = recipes.filter((recipe) => recipe.license !== null);
  for (const recipe of licensed) {
    differences.push(
      `${nameOf(recipe)} publishes under ${quoteForeign(recipe.license!.title)}, which asks for attribution.`,
    );
  }
  const silent = recipes.filter((recipe) => recipe.license === null);
  if (silent.length > 0 && licensed.length > 0) {
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
      if (!best.has(row.source)) best.set(row.source, row.id);
    }

    const offered = [...best.entries()];
    const reads = await Promise.allSettled(offered.map(([, id]) => client.getRecipe(id)));

    const recipes: RecipeDetail[] = [];
    /** Sources whose row was found and whose page then could not be read. */
    const unread = new Map<SourceId, string>();

    reads.forEach((read, index) => {
      const source = offered[index]![0];
      if (read.status === "fulfilled") {
        recipes.push(read.value.recipe);
        return;
      }
      const reason = read.reason as { code?: string; message?: string } | undefined;
      unread.set(source, `${reason?.code ?? "network_error"}: ${reason?.message ?? "unknown"}`);
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

    const notes = reportNotes(merged.reports);
    for (const view of views) notes.push(...view.notes);

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
      if (recipes.some((recipe) => recipe.source === report.source)) continue;
      const failedRead = unread.get(report.source);
      if (report.status === "failed") {
        notes.push(
          `${report.name} is missing from this comparison because its search did not answer, not because it holds nothing.`,
        );
      } else if (failedRead) {
        notes.push(
          `${report.name} offered a recipe and it could not be read (${quoteForeign(failedRead)}), so its version is missing rather than absent.`,
        );
      } else {
        notes.push(
          `${report.name} answered and offered nothing close enough to "${quoteForeign(args.dish)}" to compare.`,
        );
      }
    }

    if (payloads.length === 1) {
      notes.push(
        "This is one version rather than a comparison. Read it as what that one source publishes.",
      );
    }

    const differences = describeDifferences(recipes, payloads);
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
        `  yields ${quoteForeign(payload.yield.original_text ?? "an unstated amount")}${
          payload.yield.factor === null ? "" : `, scaled by ${payload.yield.factor}`
        }`,
      ];
      const lines = [...head];
      let used = head.join("\n").length;

      let shown = 0;
      for (const entry of payload.ingredients.slice(0, TEXT_INGREDIENT_LINES)) {
        const line = `  - ${quoteForeign(entry.text)}`;
        if (used + line.length > share) break;
        lines.push(line);
        used += line.length + 1;
        shown += 1;
      }

      const hidden = payload.ingredients.length - shown;
      if (hidden > 0) lines.push(`  … and ${hidden} more, in full in the structured output`);
      return lines.join("\n");
    });

    const body =
      payloads.length === 0
        ? unread.size > 0
          ? `Every version of "${quoteForeign(args.dish)}" that was offered could not be read, so nothing was compared.`
          : `No source offered a recipe for "${quoteForeign(args.dish)}".`
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
        per_source: merged.reports.map(toReportPayload),
        notes,
      },
      summary,
      { notes, credit },
    );
  } catch (error) {
    return toToolError(error);
  }
}

export type { SourceReport };
