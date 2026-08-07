/**
 * Turning one recipe into the payload a tool returns.
 *
 * Both `get_recipe` and `compare_recipes` need the same thing: a yield stated
 * as published and as asked for, an ingredient list scaled to match, and the
 * sentences that qualify both. Sharing it means the two tools cannot drift into
 * describing the same recipe differently.
 */

import { z } from "zod";
import { passthroughIngredients, scaleIngredients } from "../recipe/scale.js";
import type { ScaledIngredient } from "../recipe/scale.js";
import type { RecipeDetail } from "../types.js";
import { ingredientSchema, quoteForeign, toIngredientPayload, truncate } from "./shared.js";

export const yieldSchema = z.object({
  original_count: z
    .number()
    .nullable()
    .describe("Servings the page states as a number. Null when it states none."),
  original_max: z
    .number()
    .nullable()
    .describe("The upper end when the page states a span, as in '4 à 6 personnes'."),
  original_text: z
    .string()
    .nullable()
    .describe(
      "The yield in the page's own words. '4 à 6 personnes' and '4 personnes' are different claims, so the wording is kept.",
    ),
  requested: z.number().int().nullable().describe("Servings asked for, when any were."),
  unit: z
    .string()
    .nullable()
    .describe("What the yield counts when it counts something other than people, such as 'balls'."),
  factor: z
    .number()
    .nullable()
    .describe("What the quantities were multiplied by. Null when nothing was rescaled."),
});

export const ratingSchema = z.object({
  value: z.number(),
  count: z.number().int().nullable().describe("How many readers rated it, when the source says."),
  max: z
    .number()
    .nullable()
    .describe("The top of the scale. A rating read without its scale means nothing."),
});

export const recipeSchema = z.object({
  id: z.string(),
  source: z.string(),
  source_name: z.string(),
  language: z.enum(["fr", "en"]).describe("The language this recipe is written in."),
  title: z.string(),
  url: z.string(),
  image_url: z.string().nullable(),
  yield: yieldSchema,
  ingredients: z.array(ingredientSchema),
  steps: z.array(z.string()),
  prep_minutes: z.number().int().nullable(),
  cook_minutes: z.number().int().nullable(),
  total_minutes: z.number().int().nullable(),
  category: z.string().nullable(),
  author: z
    .string()
    .nullable()
    .describe("Null on a source written by everyone who edited the page."),
  rating: ratingSchema.nullable().describe("Null on a source that carries no reader rating."),
  nutrition: z
    .record(z.string(), z.string())
    .nullable()
    .describe("The panel as published, key by key. Figures the page omits are absent, never zero."),
  equipment: z.array(z.string()),
  tips: z.array(z.string()),
  license: z
    .object({ title: z.string(), url: z.string() })
    .nullable()
    .describe("Terms the page is published under, when the source states them."),
  attribution: z.string().describe("Show this, with the url, when repeating anything from here."),
  sections_returned: z
    .array(z.string())
    .describe("The sections this answer carries. Anything outside this list was not looked at."),
  sections_omitted: z
    .array(z.string())
    .describe(
      "Sections nobody asked for. A field belonging to one of these is empty because it was not requested, never because the page states nothing.",
    ),
  scaling_summary: z.object({
    scaled_count: z.number().int(),
    rounded_count: z.number().int(),
    unscaled_count: z.number().int(),
  }),
});

export type RecipePayload = z.infer<typeof recipeSchema>;

/** The sections a caller can ask for, since a full recipe is a lot of text. */
export const SECTIONS = [
  "ingredients",
  "steps",
  "times",
  "nutrition",
  "tips",
  "equipment",
] as const;
export type Section = (typeof SECTIONS)[number];

export interface RecipeView {
  payload: RecipePayload;
  notes: string[];
  ingredients: ScaledIngredient[];
}

/**
 * Work out what to multiply by, and say when nothing can be.
 *
 * A page that states no number of servings cannot be rescaled: dividing by a
 * yield nobody wrote would answer with quantities for a number of people the
 * page never claimed. Such a recipe comes back as published, and the answer
 * says why.
 */
function resolveFactor(
  recipe: RecipeDetail,
  servings: number | null,
): { factor: number | null; notes: string[] } {
  if (servings === null) return { factor: null, notes: [] };

  if (recipe.yieldCount === null || recipe.yieldCount <= 0) {
    return {
      factor: null,
      notes: [
        `${recipe.sourceName} states no number of servings for this recipe, so the quantities are ` +
          "as published. Use scale_ingredients with a factor you choose if you know what it serves.",
      ],
    };
  }

  const factor = servings / recipe.yieldCount;
  const notes: string[] = [];

  if (factor === 1) {
    return {
      factor: 1,
      notes: [`The page already yields ${recipe.yieldCount}, so nothing was multiplied.`],
    };
  }

  // A page that says "4 à 6 personnes" has named a span, and there is no one
  // factor that serves both ends of it. Scaling from the lower end is the
  // choice that leaves nobody short, and saying so is what stops the number
  // being read as the page's own arithmetic.
  if (recipe.yieldMax !== null && recipe.yieldMax > recipe.yieldCount) {
    notes.push(
      `The page states a span rather than a number: ${quoteForeign(recipe.yieldText ?? "")}. ` +
        `The factor was taken from the lower end, so ${servings} is what this makes at that end. ` +
        `Taken from ${recipe.yieldMax} it would be ${round(servings / recipe.yieldMax)} instead.`,
    );
  }

  const unit = recipe.yieldUnit;
  if (unit && !/personne|people|serving|portion|part\b/i.test(unit)) {
    notes.push(
      `This page states its yield in ${quoteForeign(unit)} rather than in servings, so asking for ` +
        `${servings} multiplied the quantities by ${round(factor)} to give ${servings} ${quoteForeign(unit)}.`,
    );
  }

  return { factor, notes };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface BuildOptions {
  servings: number | null;
  sections: readonly Section[];
  /** Steps to return, since a long method is the bulk of a recipe. */
  maxSteps?: number;
  /** Characters kept per step. */
  maxStepChars?: number;
  /**
   * Names this recipe at the front of each of its notes. An answer carrying
   * several recipes needs to say which one a note is about; an answer carrying
   * one does not, and the name would only repeat what the answer already says.
   */
  label?: string;
  /**
   * Whether the choice of sections is said here. An answer built from several
   * recipes says it once for the call rather than once per recipe.
   */
  announceSections?: boolean;
}

export function buildRecipeView(recipe: RecipeDetail, options: BuildOptions): RecipeView {
  const { factor, notes: yieldNotes } = resolveFactor(recipe, options.servings);
  const wants = (section: Section) => options.sections.includes(section);

  const ingredients =
    factor === null || factor === 1
      ? passthroughIngredients(recipe.ingredients, recipe.language)
      : scaleIngredients(recipe.ingredients, { factor, language: recipe.language });

  const notes: string[] = [...yieldNotes];

  // A page can carry no ingredient list at all, and only reading it tells that
  // apart from a recipe. Returning an empty list in silence reads as a recipe
  // that needs no ingredients.
  if (recipe.ingredients.length === 0) {
    notes.push(
      `${recipe.sourceName} publishes no ingredient list on this page. It is likely a page about ` +
        "the dish rather than a recipe for it, so there is nothing here to scale. Search again " +
        "and pick another row.",
    );
  }

  const rounded = ingredients.filter((entry) => entry.scaling === "rounded");
  const unscaled = ingredients.filter((entry) => entry.scaling === "unscaled");

  if (rounded.length > 0) {
    notes.push(
      `${rounded.length} line(s) did not land on the exact product; each says in its own note ` +
        "what happened to it.",
    );
  }
  if (unscaled.length > 0 && factor !== null && factor !== 1) {
    notes.push(
      `${unscaled.length} line(s) carry no quantity to multiply and are repeated as published.`,
    );
  }
  if (recipe.license) {
    notes.push(
      `Published under ${quoteForeign(recipe.license.title)}: ${quoteForeign(recipe.license.url)}`,
    );
  }

  const omitted = SECTIONS.filter((section) => !wants(section));
  if (options.announceSections !== false && omitted.length > 0) {
    notes.push(
      `Not requested, so not returned: ${omitted.join(", ")}. Name them in 'sections' to see them.`,
    );
  }

  const steps = wants("steps") ? recipe.steps : [];
  const shownSteps = steps
    .slice(0, options.maxSteps ?? steps.length)
    .map((step) => truncate(step, options.maxStepChars ?? step.length));
  if (steps.length > shownSteps.length) {
    notes.push(
      `The method runs to ${steps.length} steps and ${shownSteps.length} are here. Raise ` +
        "'max_steps' for the rest.",
    );
  }

  const payload: RecipePayload = {
    id: recipe.id,
    source: recipe.source,
    source_name: recipe.sourceName,
    language: recipe.language,
    title: recipe.title,
    url: recipe.url,
    image_url: recipe.imageUrl,
    yield: {
      original_count: recipe.yieldCount,
      original_max: recipe.yieldMax,
      original_text: recipe.yieldText,
      requested: options.servings,
      unit: recipe.yieldUnit,
      factor: factor === null ? null : round(factor),
    },
    ingredients: wants("ingredients") ? ingredients.map(toIngredientPayload) : [],
    steps: shownSteps,
    prep_minutes: wants("times") ? recipe.prepMinutes : null,
    cook_minutes: wants("times") ? recipe.cookMinutes : null,
    total_minutes: wants("times") ? recipe.totalMinutes : null,
    category: recipe.category,
    author: recipe.author,
    rating: recipe.rating,
    nutrition: wants("nutrition") ? recipe.nutrition : null,
    equipment: wants("equipment") ? recipe.equipment : [],
    tips: wants("tips") ? recipe.tips : [],
    license: recipe.license,
    attribution: recipe.attribution,
    sections_returned: [...options.sections],
    sections_omitted: omitted,
    scaling_summary: {
      scaled_count: ingredients.filter((entry) => entry.scaling === "scaled").length,
      rounded_count: rounded.length,
      unscaled_count: unscaled.length,
    },
  };

  if (options.label) {
    const label = quoteForeign(options.label);
    return { payload, notes: notes.map((line) => `${label}: ${line}`), ingredients };
  }
  return { payload, notes, ingredients };
}

/** The yield as a reader would say it, with what was asked for beside it. */
export function renderYield(payload: RecipePayload): string {
  const published = payload.yield.original_text ?? "an amount the page does not state";
  if (payload.yield.factor === null) return `Yields ${quoteForeign(published)} (as published).`;
  return `Yields ${quoteForeign(published)} as published, scaled by ${payload.yield.factor} for ${payload.yield.requested}.`;
}
