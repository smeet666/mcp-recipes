/**
 * get_recipe: read one recipe, from the source its identifier names.
 *
 * Only that source is called. Trying another after a miss would answer a
 * question about one corpus with somebody else's recipe of a different name,
 * which is a worse answer than the absence it replaced.
 */

import { z } from "zod";
import type { RecipesClient } from "../sources/client.js";
import { buildRecipeView, recipeSchema, renderYield, SECTIONS } from "./recipeView.js";
import type { Section } from "./recipeView.js";
import { strictInput } from "./arguments.js";
import { creditLine, ok, quoteForeign, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const getRecipeDescription = [
  "Read one recipe in full: its ingredients, its steps, what it yields, and whatever times, rating and nutrition its source publishes.",
  "'id' must come from search_recipes. It names the source, so this reads the right one without guessing; an identifier no source would have minted is refused, because sending it anywhere would answer about the wrong dish.",
  "Pass 'servings' to rescale. Quantities land where a kitchen can follow them: an egg stays whole, anything that pours or cuts can halve, a small measurement moves to a smaller unit before it is rounded, and anything unmultipliable is flagged rather than scaled.",
  "A page that states no number of servings comes back as published and says so, because dividing by a yield nobody wrote would answer for a number of people the page never claimed.",
  "'sections' decides what comes back, and 'sections_omitted' names what was left out: a field belonging to an omitted section is empty because nobody asked for it, never because the page states nothing.",
  "A field a source does not publish is null, never zero. Credit the source and link the url when you repeat any of it.",
].join(" ");

export const getRecipeInput = strictInput({
  id: z
    .string()
    .min(1)
    .max(500)
    .describe("From search_recipes, such as 'marmiton:44078' or 'cookbook:Cookbook:Carbonara'."),
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

export const getRecipeOutput = z.object({
  recipe: recipeSchema,
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
    const view = buildRecipeView(recipe, {
      servings: args.servings ?? null,
      sections: args.sections as readonly Section[],
      maxSteps: args.max_steps,
      maxStepChars: args.max_step_chars,
    });

    const notes = [...view.notes];
    if (read.inferred) {
      notes.unshift(
        `"${quoteForeign(args.id)}" was read as ${read.source.name}'s, because ${read.inferred}. ` +
          "Spell an id with its source to leave nothing to infer.",
      );
    }
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");

    const payload = view.payload;
    const lines = [
      `${quoteForeign(payload.title)} · ${quoteForeign(payload.source_name)}`,
      quoteForeign(payload.url),
      renderYield(payload),
    ];
    if (payload.ingredients.length > 0) {
      lines.push(
        "",
        "Ingredients:",
        ...payload.ingredients.map((entry) =>
          entry.scaling === "unscaled"
            ? `- ${quoteForeign(entry.text)} (no quantity)`
            : `- ${quoteForeign(entry.text)}`,
        ),
      );
    }
    if (payload.steps.length > 0) {
      lines.push(
        "",
        "Steps:",
        ...payload.steps.map((step, index) => `${index + 1}. ${quoteForeign(step)}`),
      );
    }

    return ok({ recipe: payload, id_read_as: read.inferred, notes }, lines.join("\n"), {
      notes,
      credit: creditLine([{ attribution: payload.attribution, url: payload.url }]),
    });
  } catch (error) {
    return toToolError(error);
  }
}
