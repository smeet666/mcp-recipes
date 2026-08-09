/**
 * Wiring: one client over the registered sources, four tools, and the guidance
 * a model reads before using any of them.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config, Logger } from "./config.js";
import { createLogger, loadConfig } from "./config.js";
import { RecipesClient } from "./sources/client.js";
import {
  compareRecipesDescription,
  compareRecipesInput,
  compareRecipesOutput,
  runCompareRecipes,
} from "./tools/compareRecipes.js";
import type { CompareRecipesArgs } from "./tools/compareRecipes.js";
import {
  getRecipeDescription,
  getRecipeInput,
  getRecipeOutput,
  runGetRecipe,
} from "./tools/getRecipe.js";
import type { GetRecipeArgs } from "./tools/getRecipe.js";
import {
  runScaleIngredients,
  scaleIngredientsDescription,
  scaleIngredientsInput,
  scaleIngredientsOutput,
} from "./tools/scaleIngredients.js";
import type { ScaleIngredientsArgs } from "./tools/scaleIngredients.js";
import {
  runSearchRecipes,
  searchRecipesDescription,
  searchRecipesInput,
  searchRecipesOutput,
} from "./tools/searchRecipes.js";
import type { SearchRecipesArgs } from "./tools/searchRecipes.js";
import { PKG_VERSION } from "./version.js";

export interface CreateServerOptions {
  config?: Config;
  logger?: Logger;
  client?: RecipesClient;
}

/** Nothing here writes, uploads or deletes; every tool only reads. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/**
 * The guidance a model reads before choosing a tool.
 *
 * The sources are named from the registry rather than written into the prose,
 * so the sentence stays true when the registry grows. What it says about them
 * holds for any corpus this server reads.
 */
export function buildInstructions(sources: Array<{ name: string; language: string }>): string {
  const named = sources.map((source) => `${source.name} (${source.language})`).join(", ");

  return [
    `Tools for recipes, reading ${sources.length} sources: ${named}. No API key and no account are needed.`,
    "search_recipes asks every source at once and returns one list; every id it hands back names the source it came from, and get_recipe routes on that.",
    "Use compare_recipes when the question is how a dish differs between traditions: it reads each source's closest version and can rescale them all to the same number of servings so the lists stand comparison.",
    "Do not rescale quantities yourself. get_recipe and scale_ingredients keep an egg whole, halve what pours or cuts, move a small measurement to a smaller unit before rounding it, and flag what cannot be scaled, which is what stops answers like '2.4 eggs'.",
    "scale_ingredients works offline on a list from anywhere and reads French and English lines in one call, each in its own language.",
    "A source that fails is named as a source that failed. An answer holding rows from some sources is never evidence about what the others hold, and 'per_source' says which was which.",
    "The sources share no scale. Their result counts count different things and are never added; some carry reader ratings and some have no author and no rating by nature, so rows are interleaved rather than ranked.",
    "Nothing is converted between measuring systems, and a yield is repeated in the source's own words, because '4 à 6 personnes' and '4 personnes' are different claims. A page stating no yield cannot be rescaled and says so.",
    "Every result carries a url. Credit the source you took a recipe from and link it; some publish under a licence that requires it, and one that states no terms at all has not granted permission.",
  ].join(" ");
}

/** The guidance as it reads for the sources this build registers. */
export const INSTRUCTIONS = buildInstructions([
  { name: "Marmiton", language: "fr" },
  { name: "Wikibooks Cookbook", language: "en" },
]);

export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const client = options.client ?? new RecipesClient({ config, logger });

  const server = new McpServer(
    { name: "mcp-recipes", version: PKG_VERSION },
    { instructions: buildInstructions(client.profiles) },
  );

  server.registerTool(
    "search_recipes",
    {
      title: "Search every recipe source at once",
      description: searchRecipesDescription,
      inputSchema: searchRecipesInput,
      outputSchema: searchRecipesOutput,
      annotations: READ_ONLY,
    },
    async (args) => runSearchRecipes(client, args as SearchRecipesArgs),
  );

  server.registerTool(
    "get_recipe",
    {
      title: "Read one recipe, optionally rescaled",
      description: getRecipeDescription,
      inputSchema: getRecipeInput,
      outputSchema: getRecipeOutput,
      annotations: READ_ONLY,
    },
    async (args) => runGetRecipe(client, args as GetRecipeArgs),
  );

  server.registerTool(
    "scale_ingredients",
    {
      title: "Scale an ingredient list, in either language",
      description: scaleIngredientsDescription,
      inputSchema: scaleIngredientsInput,
      outputSchema: scaleIngredientsOutput,
      annotations: {
        ...READ_ONLY,
        // Nothing is fetched, so this tool reaches nothing outside itself.
        openWorldHint: false,
      },
    },
    async (args) => runScaleIngredients(args as ScaleIngredientsArgs),
  );

  server.registerTool(
    "compare_recipes",
    {
      title: "One dish, as each source writes it",
      description: compareRecipesDescription,
      inputSchema: compareRecipesInput,
      outputSchema: compareRecipesOutput,
      annotations: READ_ONLY,
    },
    async (args) => runCompareRecipes(client, args as CompareRecipesArgs),
  );

  logger.info(
    `ready: ${client.profiles.length} sources (${client.profiles.map((source) => source.id).join(", ")}), user-agent="${client.userAgent}", ${client.intervalMs}ms between requests to one source`,
  );

  return server;
}
