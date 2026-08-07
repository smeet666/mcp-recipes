/**
 * scale_ingredients: multiply a list a caller already holds.
 *
 * Nothing here touches the network. The list can come from any of the sources,
 * from a cookbook on a shelf or from a photograph of a card, and it can mix
 * French and English lines: each line is read in the language it is written in
 * and comes back written the same way.
 */

import { z } from "zod";
import { invalidInput } from "../errors.js";
import { scaleIngredients } from "../recipe/scale.js";
import type { LanguageChoice } from "../recipe/scale.js";
import { strictInput } from "./arguments.js";
import { ingredientSchema, ok, quoteForeign, toIngredientPayload, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const scaleIngredientsDescription = [
  "Multiply a list of ingredient lines, in French, in English, or in a list holding both.",
  "Give either 'factor', or 'from_servings' and 'to_servings' and the factor is worked out from them.",
  "Quantities land where a kitchen can follow them: an egg stays whole because half of one is not something a cook takes out of the shell, while anything that pours, weighs or cuts can halve, a spoonful shrinks into the smaller spoon before it is rounded, and a pinch keeps whatever size a hand gives it while its count is multiplied.",
  "Every line comes back with 'scaling': 'scaled' when the arithmetic landed on the exact product, 'rounded' when something had to move for the line to stay usable, 'unscaled' when the line carries nothing to multiply. A rounded line says what it was rounded from and in which direction.",
  "No quantity is converted between measuring systems: grams stay grams and cups stay cups, because a conversion changes what the recipe said.",
].join(" ");

export const scaleIngredientsInput = strictInput({
  ingredients: z
    .array(z.string().max(500))
    .min(1)
    .max(200)
    .describe(
      "The lines as written, one ingredient each, such as '200 g de farine' or '3 eggs'. One line, not a whole recipe.",
    ),
  factor: z
    .number()
    .gt(0)
    .max(1000)
    .optional()
    .describe(
      "What to multiply by. Give exactly one of: 'factor', or both 'from_servings' and 'to_servings'.",
    ),
  from_servings: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("What the list serves now. Give it with 'to_servings', and without 'factor'."),
  to_servings: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("What it should serve. Give it with 'from_servings', and without 'factor'."),
  language: z
    .enum(["auto", "fr", "en"])
    .default("auto")
    .describe(
      "'auto' reads each line on its own, which is what a list holding both languages needs. Name a language to read every line that way.",
    ),
});

export const scaleIngredientsOutput = z.object({
  factor: z.number().describe("What every quantity was multiplied by."),
  language: z.string().describe("How the lines were read."),
  ingredients: z.array(ingredientSchema),
  scaled_count: z.number().int().describe("Lines whose arithmetic came out exact."),
  rounded_count: z.number().int().describe("Lines whose value moved to stay usable."),
  unscaled_count: z.number().int().describe("Lines carrying nothing that can be multiplied."),
  notes: z.array(z.string()),
});

export type ScaleIngredientsArgs = z.infer<typeof scaleIngredientsInput>;

/**
 * Read the factor off whichever pair of arguments the caller gave.
 *
 * The two ways of saying it are kept apart rather than merged, because a caller
 * who gives both and means different things by them has made a mistake worth
 * hearing about.
 */
export function resolveFactor(args: ScaleIngredientsArgs): number {
  const hasPair = args.from_servings !== undefined && args.to_servings !== undefined;

  if (args.factor !== undefined && hasPair) {
    throw invalidInput(
      "Give either 'factor' or the pair of serving counts, not both.",
      `factor=${args.factor} and ${args.from_servings}→${args.to_servings} would be two different multipliers.`,
    );
  }

  if (args.factor !== undefined) return args.factor;
  if (hasPair) return args.to_servings! / args.from_servings!;

  if (args.from_servings !== undefined || args.to_servings !== undefined) {
    throw invalidInput(
      "Serving counts come in pairs: give both 'from_servings' and 'to_servings'.",
      "Or give 'factor' on its own.",
    );
  }

  throw invalidInput(
    "Nothing said how much to multiply by.",
    "Give 'factor', or both 'from_servings' and 'to_servings'.",
  );
}

export function runScaleIngredients(args: ScaleIngredientsArgs): ToolResult {
  try {
    const factor = resolveFactor(args);
    const scaled = scaleIngredients(args.ingredients, {
      factor,
      language: args.language as LanguageChoice,
    });

    const counts = {
      scaled_count: scaled.filter((entry) => entry.scaling === "scaled").length,
      rounded_count: scaled.filter((entry) => entry.scaling === "rounded").length,
      unscaled_count: scaled.filter((entry) => entry.scaling === "unscaled").length,
    };

    const notes: string[] = [];
    if (counts.rounded_count > 0) {
      notes.push(
        `${counts.rounded_count} line(s) did not land on the exact product; each says in its own ` +
          "note what happened to it.",
      );
    }
    if (counts.unscaled_count > 0) {
      notes.push(
        `${counts.unscaled_count} line(s) carry no quantity to multiply and are repeated as given.`,
      );
    }
    if (args.language === "auto") {
      const languages = new Set(scaled.map((entry) => entry.language));
      if (languages.size > 1) {
        notes.push(
          "This list holds lines in both languages, and each was read and rewritten in its own.",
        );
      }
    }
    if (scaled.some((entry) => entry.note?.includes("approximate measure"))) {
      notes.push(
        "A pinch, a handful and their kind were multiplied by their count. The size of one stays " +
          "whatever the cook's hand gives it, and none of them was turned into grams or spoons.",
      );
    }

    const body = scaled
      .map((entry, index) => `${index + 1}. ${quoteForeign(entry.text)}`)
      .join("\n");

    return ok(
      {
        factor: Math.round(factor * 1000) / 1000,
        language: args.language,
        ingredients: scaled.map(toIngredientPayload),
        ...counts,
        notes,
      },
      `Scaled by ${Math.round(factor * 1000) / 1000}:\n${body}`,
      { notes, credit: "Source: the list you supplied. Scaled offline; nothing was fetched." },
    );
  } catch (error) {
    return toToolError(error);
  }
}
