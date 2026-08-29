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
import { headingFor } from "../recipe/sections.js";
import type { PagePart } from "../recipe/sections.js";
import type { RecipeDetail } from "../types.js";
import {
  ingredientSchema,
  labelNote,
  mustKeep,
  quoteForeign,
  toIngredientPayload,
  truncate,
} from "./shared.js";
import type { Note } from "./shared.js";

const SERVING_WORD = /personne|people|serving|portion|part\b/i;

/**
 * What the other half of the recipe holds, when this half is being read alone.
 *
 * A page whose ingredients were read and whose method was not is a page that
 * has one, and saying so is what stops a caller concluding the recipe is a list
 * with no procedure.
 */
function whatTheOtherPartHolds(
  part: PagePart,
  recipe: { steps: readonly unknown[]; ingredients: readonly unknown[] },
): string | null {
  if (part === "ingredients") {
    return recipe.steps.length > 0
      ? `${recipe.steps.length} step(s) of method were read from it`
      : null;
  }
  return recipe.ingredients.length > 0
    ? `${recipe.ingredients.length} ingredient line(s) were read from it`
    : null;
}

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
  rest_minutes: z
    .number()
    .int()
    .nullable()
    .describe(
      "Time the recipe stands, from a source that publishes it apart. It is in no other time here, and belongs to no other source's cooking time. Null where the source publishes none, which is not a dish that needs no rest.",
    ),
  steps_as_one_block: z
    .boolean()
    .nullable()
    .describe(
      "Whether the source publishes the method as one block of prose rather than as steps of its own. Null where the source says neither, so a single entry is not read as step one of several.",
    ),
  withheld: z
    .object({
      parts: z.array(z.string()).describe("Which parts, named as 'ingredients' or 'method'."),
      why: z.string().describe("What the source says about keeping them back."),
    })
    .nullable()
    .describe(
      "A part the source published nothing of because it keeps it for its subscribers. Null from a source that withholds nothing, which is a different statement from an empty list.",
    ),
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
  notes: Note[];
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
): { factor: number | null; notes: Note[] } {
  if (servings === null) {
    return { factor: null, notes: [] };
  }

  // A page whose ingredient list is kept for subscribers states its servings
  // perfectly well, so the sentence about a page that names none would be
  // false. What is missing is the lines, and a factor over nothing is a factor
  // nobody can use.
  const held = withheldPart(recipe, "ingredients");
  if (held !== null) {
    return {
      factor: null,
      notes: [
        mustKeep(
          `${held}, so there is nothing here to put to ${servings}. ` +
            `The page states what it serves; read the lines at ${quoteForeign(recipe.url)}.`,
        ),
      ],
    };
  }

  if (recipe.yieldCount === null || recipe.yieldCount <= 0) {
    return {
      factor: null,
      notes: [
        mustKeep(
          `${recipe.sourceName} states no number of servings for this recipe, so the quantities are ` +
            "as published. Use scale_ingredients with a factor you choose if you know what it serves.",
        ),
      ],
    };
  }

  const factor = servings / recipe.yieldCount;
  const notes: Note[] = [];

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
  if (unit && !SERVING_WORD.test(unit)) {
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

/** One part of a recipe, in the words an answer needs to talk about it. */
interface PartWords {
  part: PagePart;
  /** A single entry of it, as a sentence names one. */
  entry: string;
  /** The whole of it, as a page publishes it. */
  whole: string;
  /** The reading of an empty one that has to be shut off. */
  caution: string;
}

const INGREDIENTS_PART: PartWords = {
  part: "ingredients",
  entry: "ingredient line",
  whole: "ingredient list",
  caution: "An empty list here is never evidence that an ingredient is absent from the dish.",
};

const METHOD_PART: PartWords = {
  part: "method",
  entry: "step of method",
  whole: "method",
  caution: "An empty method here is never evidence that the dish is made without one.",
};

/**
 * What a part of a recipe that came back empty is allowed to say.
 *
 * Reading nothing off a page is a fact about this server, and stating it as a
 * fact about the page turns a failure of this reader into a claim the page
 * never made. Someone looking for a dish without butter, told that a page
 * publishes no ingredients, concludes there is no butter in it; the page can
 * open on butter.
 *
 * Two things the page itself shows settle it. A heading announcing the part
 * says the page published one. Another part of the recipe that was read says
 * the page is a recipe. Either of them makes an empty result this server's
 * failure, and the answer says so. Where the page shows neither, the answer
 * says the two cannot be told apart from here rather than picking whichever
 * reads more fluently.
 */
/**
 * What the source says about keeping this part back, when it keeps it back.
 *
 * Null covers the ordinary case, a source that withholds nothing, and the case
 * of a source that withholds a different part of the same recipe.
 */
function withheldPart(recipe: RecipeDetail, part: PagePart): string | null {
  if (recipe.withheld === null || !recipe.withheld.parts.includes(part)) {
    return null;
  }
  return recipe.withheld.why;
}

function emptyPartNote(recipe: RecipeDetail, words: PartWords): Note {
  // The source has said which of the two readings below is the right one, so
  // offering them is a question that has an answer.
  const held = withheldPart(recipe, words.part);
  if (held !== null) {
    return mustKeep(
      `${held}, so no ${words.entry} is in this answer. The page publishes one and this ` +
        "server did not fail to read it; a reader who has the subscription reads the " +
        `${words.whole} at ${quoteForeign(recipe.url)}. ${words.caution}`,
    );
  }

  const heading = headingFor(words.part, recipe.publishedSections);
  const counterpart = whatTheOtherPartHolds(words.part, recipe);

  const shown = [
    heading === null ? null : `the page heads a section "${quoteForeign(heading)}"`,
    counterpart,
  ].filter((clause): clause is string => clause !== null);

  if (shown.length > 0) {
    return mustKeep(
      `No ${words.entry} was read from this page, yet ${shown.join(" and ")}. This server failed ` +
        `to read the ${words.whole} the page carries; read it at the url. ${words.caution}`,
    );
  }

  // Naming the headings as evidence requires having seen them, and a source
  // that reports none has shown nothing either way.
  const looked = recipe.publishedSections === null ? "" : ", which heads no section announcing one";
  return mustKeep(
    `No ${words.entry} was read from this page${looked}. A page publishing no ${words.whole} and ` +
      "one written in a layout this server cannot follow look the same from here, so read the url " +
      `before settling which this is. ${words.caution}`,
  );
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

/**
 * What has to be said about the parts of the recipe themselves.
 *
 * An empty list returned in silence reads as a recipe that needs no ingredients,
 * and an empty method as a dish that needs no cooking. A method published as one
 * paragraph reads as the first step of several unless the answer says otherwise,
 * and only the source knows which it is.
 */
function partNotes(recipe: RecipeDetail, wants: (section: Section) => boolean): Note[] {
  const notes: Note[] = [];

  if (wants("ingredients") && recipe.ingredients.length === 0) {
    notes.push(emptyPartNote(recipe, INGREDIENTS_PART));
  }
  if (wants("steps") && recipe.steps.length === 0) {
    notes.push(emptyPartNote(recipe, METHOD_PART));
  }
  if (wants("steps") && recipe.stepsAsOneBlock === true && recipe.steps.length > 0) {
    notes.push(
      mustKeep(
        `${recipe.sourceName} publishes this method as one block of prose rather than as steps ` +
          "of its own, so what is here is that block and not the first step of several.",
      ),
    );
  }

  return notes;
}

export function buildRecipeView(recipe: RecipeDetail, options: BuildOptions): RecipeView {
  const { factor, notes: yieldNotes } = resolveFactor(recipe, options.servings);
  const wants = (section: Section) => options.sections.includes(section);

  const ingredients =
    factor === null || factor === 1
      ? passthroughIngredients(recipe.ingredients, recipe.language)
      : scaleIngredients(recipe.ingredients, { factor, language: recipe.language });

  const notes: Note[] = [...yieldNotes, ...partNotes(recipe, wants)];

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
      mustKeep(
        `Published under ${quoteForeign(recipe.license.title)}: ${quoteForeign(recipe.license.url)}`,
      ),
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
    rest_minutes: wants("times") ? recipe.restMinutes : null,
    steps_as_one_block: recipe.stepsAsOneBlock,
    withheld: recipe.withheld,
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
    return { payload, notes: notes.map((line) => labelNote(label, line)), ingredients };
  }
  return { payload, notes, ingredients };
}

/** The yield as a reader would say it, with what was asked for beside it. */
export function renderYield(payload: RecipePayload): string {
  const published = payload.yield.original_text ?? "an amount the page does not state";
  if (payload.yield.factor === null) {
    return `Yields ${quoteForeign(published)} (as published).`;
  }
  return `Yields ${quoteForeign(published)} as published, scaled by ${payload.yield.factor} for ${payload.yield.requested}.`;
}
