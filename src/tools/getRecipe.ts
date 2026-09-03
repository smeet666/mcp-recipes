/**
 * get_recipe: read one recipe, from the source its identifier names.
 *
 * Only that source is called. Trying another after a miss would answer a
 * question about one corpus with somebody else's recipe of a different name,
 * which is a worse answer than the absence it replaced.
 */

import { z } from "zod";
import type { RecipesClient } from "../sources/client.js";
import {
  buildCollectionView,
  buildRecipeView,
  collectionSchema,
  recipeSchema,
  renderYield,
  SECTIONS,
} from "./recipeView.js";
import type { Section } from "./recipeView.js";
import { strictInput } from "./arguments.js";
import type { RecipeDetail } from "../types.js";
import {
  creditLine,
  fitLines,
  mustKeep,
  noteTexts,
  ok,
  omittedLinesLine,
  quoteForeign,
  roomForBody,
  toToolError,
} from "./shared.js";
import type { Note, ToolResult } from "./shared.js";

export const getRecipeDescription = [
  "Read one recipe in full: its ingredients, its steps, what it yields, and whatever times, rating and nutrition its source publishes.",
  "'id' must come from search_recipes. It names the source, so this reads the right one without guessing; an identifier no source would have minted is refused, because sending it anywhere would answer about the wrong dish.",
  "Pass 'servings' to rescale. Quantities land where a kitchen can follow them: an egg stays whole, anything that pours or cuts can halve, a small measurement moves to a smaller unit before it is rounded, and anything unmultipliable is flagged rather than scaled.",
  "A page that states no number of servings comes back as published and says so, because dividing by a yield nobody wrote would answer for a number of people the page never claimed.",
  "Read 'kind' first. Some sources publish articles gathering other recipes at the same kind of address as a recipe, and such an answer carries 'collection' with the recipes it points at and no 'recipe' at all: there is nothing to cook from that page, and the recipes it lists are read with get_recipe.",
  "A part this answer holds nothing for says which of two things happened: the page showed no sign of it, or this server failed to read what the page carries. An empty ingredient list is never evidence that an ingredient is absent from the dish.",
  "'sections' decides what comes back, and 'sections_omitted' names what was left out: a field belonging to an omitted section is empty because nobody asked for it, never because the page states nothing.",
  "A field a source does not publish is null, never zero. Credit the source and link the url when you repeat any of it.",
].join(" ");

/**
 * How much of an article's text block the listing may take.
 *
 * Two thirds: the addresses are what a reader follows next, and the headings
 * only say what the article is built from.
 */
const LISTING_SHARE = 2 / 3;

export const getRecipeInput = strictInput({
  id: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "From search_recipes, such as 'marmiton:44078', 'pequerecetas:paella-de-marisco' or 'cookbook:Cookbook:Carbonara'. Two sources address a recipe by a bare number, so spell an id with its source.",
    ),
  servings: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Rescale to this many. Left out, the quantities come back as published."),
  sections: z
    .array(z.enum(SECTIONS))
    .default(["ingredients", "steps"])
    .describe("Which parts to return. A full recipe is a lot of text, so this defaults to two."),
  max_steps: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Steps to return. The answer says how many more there are."),
  max_step_chars: z
    .number()
    .int()
    .min(80)
    .max(4000)
    .default(600)
    .describe("Characters kept per step. Raise it only if a step was cut mid-sentence."),
});

/**
 * What came back, in two shapes.
 *
 * One source publishes articles that gather recipes at the same kind of address
 * as a recipe, and describes both with the same structured type, so the address
 * alone does not say which this is. `kind` says which, and only the field
 * belonging to that answer is present: an article has no ingredients and no
 * method, and a recipe gathers nothing.
 */
export const getRecipeOutput = z.object({
  kind: z
    .enum(["recipe", "collection"])
    .describe(
      "What the address held. 'recipe' comes with 'recipe' and no 'collection'; 'collection' " +
        "comes with 'collection' and no 'recipe', and is an article gathering other recipes, " +
        "with no ingredients and no method of its own.",
    ),
  recipe: recipeSchema.optional().describe("Present when 'kind' is 'recipe'."),
  collection: collectionSchema.optional().describe("Present when 'kind' is 'collection'."),
  id_read_as: z
    .string()
    .nullable()
    .describe("How a raw identifier was routed, when it was not spelled with its source."),
  notes: z.array(z.string()),
});

export type GetRecipeArgs = z.infer<typeof getRecipeInput>;

export async function runGetRecipe(
  client: RecipesClient,
  args: GetRecipeArgs,
): Promise<ToolResult> {
  try {
    const { recipe, cached, read } = await client.getRecipe(args.id);
    const routed = read.inferred
      ? [
          `"${quoteForeign(args.id)}" was read as ${read.source.name}'s, because ${read.inferred}. ` +
            "Spell an id with its source to leave nothing to infer.",
        ]
      : [];
    const served = cached ? ["Served from this server's short-lived in-memory cache."] : [];

    if (recipe.gathers) {
      return gatheredAnswer(recipe, read.inferred, [...routed, ...served]);
    }

    const view = buildRecipeView(recipe, {
      servings: args.servings ?? null,
      sections: args.sections as readonly Section[],
      maxSteps: args.max_steps,
      maxStepChars: args.max_step_chars,
    });

    const notes: Note[] = [...routed, ...view.notes, ...served];

    const payload = view.payload;
    const credit = creditLine([{ attribution: payload.attribution, url: payload.url }]);
    const head = [
      `${quoteForeign(payload.title)} · ${quoteForeign(payload.source_name)}`,
      quoteForeign(payload.url),
      renderYield(payload),
    ];

    // A tool line is left as published for a reason of its own, and it can carry
    // a figure the server read and declined to multiply, so it is never marked
    // as a line with no quantity on it.
    const ingredientLines = payload.ingredients.map((entry) => {
      if (entry.is_equipment) {
        return `- ${quoteForeign(entry.text)} (a tool)`;
      }
      return entry.scaling === "unscaled"
        ? `- ${quoteForeign(entry.text)} (no quantity)`
        : `- ${quoteForeign(entry.text)}`;
    });
    const stepLines = payload.steps.map((step, index) => `${index + 1}. ${quoteForeign(step)}`);

    // A long method and a long ingredient list share what the notes leave, so
    // neither of them fills the block and cuts the other away.
    const room = roomForBody({ notes, credit }) - head.join("\n").length;
    const parts = [ingredientLines, stepLines].filter((part) => part.length > 0);
    const share = parts.length === 0 ? 0 : room / parts.length;

    const lines = [...head];
    const ingredients = fitLines(ingredientLines, share);
    if (ingredientLines.length > 0) {
      lines.push("", "Ingredients:", ...ingredients.lines);
      if (ingredients.hidden > 0) {
        lines.push(
          omittedLinesLine(ingredients.lines.length, ingredientLines.length, "ingredient lines"),
        );
      }
    }
    const steps = fitLines(stepLines, share);
    if (stepLines.length > 0) {
      lines.push("", "Steps:", ...steps.lines);
      if (steps.hidden > 0) {
        lines.push(omittedLinesLine(steps.lines.length, stepLines.length, "steps"));
      }
    }

    return ok(
      { kind: "recipe", recipe: payload, id_read_as: read.inferred, notes: noteTexts(notes) },
      lines.join("\n"),
      { notes, credit },
    );
  } catch (error) {
    return toToolError(error);
  }
}

/**
 * The answer for an address that held an article gathering recipes.
 *
 * It carries no ingredients and no method because the page has none, which is a
 * different statement from a recipe this server failed to read. The listing it
 * carries is worth following.
 */
function gatheredAnswer(
  recipe: RecipeDetail,
  inferred: string | null,
  earlier: Note[],
): ToolResult {
  const payload = buildCollectionView(recipe);
  const notes: Note[] = [
    ...earlier,
    mustKeep(
      "This address gathers other recipes, so there are no " +
        `ingredients and no method to read. ${payload.source_name} publishes both at this kind ` +
        "of address. Call get_recipe on one of the recipes listed here.",
    ),
  ];
  const credit = creditLine([{ attribution: payload.attribution, url: payload.url }]);

  const head = [
    `${quoteForeign(payload.title)} · ${quoteForeign(payload.source_name)}`,
    quoteForeign(payload.url),
    `An article that gathers ${payload.recipes.length} recipe(s).`,
  ];
  const rows = payload.recipes.map(
    (row) => `- ${quoteForeign(row.title)} (${quoteForeign(row.id)})`,
  );
  const headings = payload.headings.map(quoteForeign);

  // The two lists share what the notes leave, so neither fills the block and
  // cuts the other away. The listing is served first, because the addresses are
  // what a reader follows out of this answer and the headings only say what the
  // article is built from.
  const room = roomForBody({ notes, credit }) - head.join("\n").length;
  const fitted = fitLines(rows, room * LISTING_SHARE);
  const shownHeadings = fitLines(headings, room - fitted.lines.join("\n").length);

  const lines = [...head];
  if (rows.length > 0) {
    lines.push("", "Recipes it points at:", ...fitted.lines);
    if (fitted.hidden > 0) {
      lines.push(omittedLinesLine(fitted.lines.length, rows.length, "recipes"));
    }
  }
  if (headings.length > 0 && shownHeadings.lines.length > 0) {
    lines.push("", `Built from: ${shownHeadings.lines.join(", ")}`);
    if (shownHeadings.hidden > 0) {
      lines.push(omittedLinesLine(shownHeadings.lines.length, headings.length, "headings"));
    }
  }

  return ok(
    { kind: "collection", collection: payload, id_read_as: inferred, notes: noteTexts(notes) },
    lines.join("\n"),
    { notes, credit },
  );
}
