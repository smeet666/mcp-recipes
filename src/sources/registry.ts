/**
 * The sources this server reads.
 *
 * One list, and everything above it is written for however long the list is.
 * Adding a corpus means writing an adapter and adding it here; no tool, no
 * merge and no error path has a branch per source.
 */

import { GoodFoodClient } from "mcp-bbc-goodfood/client";
import type { ClientOptions as GoodFoodClientOptions } from "mcp-bbc-goodfood/client";
import { MarmitonClient } from "mcp-marmiton/client";
import type { MarmitonClientOptions } from "mcp-marmiton/client";
import { PequerecetasClient } from "mcp-pequerecetas/client";
import type { ClientOptions as PequerecetasClientOptions } from "mcp-pequerecetas/client";
import { PtitchefClient } from "mcp-ptitchef/client";
import type { ClientOptions as PtitchefClientOptions } from "mcp-ptitchef/client";
import { SupertoinetteClient } from "mcp-supertoinette/client";
import type { ClientOptions as SupertoinetteClientOptions } from "mcp-supertoinette/client";
import { CookbookClient } from "mcp-wikibooks-cookbook/client";
import type { ClientOptions as CookbookClientOptions } from "mcp-wikibooks-cookbook/client";

import type { Config, Logger } from "../config.js";
import { invalidInput } from "../errors.js";
import type { SourceId } from "../types.js";
import type { SourceAdapter } from "./adapter.js";
import { COOKBOOK_PROFILE, cookbookAdapter } from "./cookbook.js";
import type { CookbookReader } from "./cookbook.js";
import { GOODFOOD_PROFILE, goodfoodAdapter } from "./goodfood.js";
import type { GoodFoodReader } from "./goodfood.js";
import { MARMITON_PROFILE, marmitonAdapter } from "./marmiton.js";
import type { MarmitonReader } from "./marmiton.js";
import { PEQUERECETAS_PROFILE, pequerecetasAdapter } from "./pequerecetas.js";
import type { PequerecetasReader } from "./pequerecetas.js";
import { PTITCHEF_PROFILE, ptitchefAdapter } from "./ptitchef.js";
import type { PtitchefReader } from "./ptitchef.js";
import { SUPERTOINETTE_PROFILE, supertoinetteAdapter } from "./supertoinette.js";
import type { SupertoinetteReader } from "./supertoinette.js";

/**
 * A reader may be supplied in place of the one that talks to a site, so a
 * program embedding this server can put its own cache in front of a corpus, and
 * a test can drive it from fixed answers.
 *
 * Each key is the id of the source it stands in for, so what a caller has
 * replaced can be read off against what the registry builds.
 */
export interface Readers {
  marmiton?: MarmitonReader;
  cookbook?: CookbookReader;
  ptitchef?: PtitchefReader;
  goodfood?: GoodFoodReader;
  supertoinette?: SupertoinetteReader;
  pequerecetas?: PequerecetasReader;
}

/**
 * Two bounds one of the readers takes that the rest do not: the largest page it
 * will read, and the time it gives a whole read including its retries.
 *
 * They are that reader's own defaults, repeated here because its options
 * require them. This server exposes no setting for either: a setting governing
 * one source out of six is one nobody can reason about, and the pacing,
 * timeout and retry settings that do govern every source are the ones a caller
 * can move.
 */
const PAGE_READ_BOUNDS = { maxBodyBytes: 8_000_000, budgetMs: 60_000 };

/**
 * The spacing a site imposes at home, which a setting here cannot go below.
 *
 * Each source publishes a floor of its own, and a client built with a
 * configuration object takes the number it is handed: nothing downstream clamps
 * it. So the floor is applied here, where the configuration meets the client,
 * and one setting governing every source can only ever make this server more
 * patient than the slowest of them asks for.
 *
 * A source absent from this table asks for no more than the shared default.
 */
const PACING_FLOOR_MS: Record<SourceId, number> = {
  supertoinette: 3000,
  pequerecetas: 3000,
};

/** The spacing one source is read at: the setting, or its own floor when that is higher. */
export function pacingFor(source: SourceId, configured: number): number {
  return Math.max(configured, PACING_FLOOR_MS[source] ?? 0);
}

/** The settings one source's client is handed, which is the shared set at that source's pace. */
export function pacedConfig(config: Config, source: SourceId) {
  return {
    userAgent: config.userAgent,
    minIntervalMs: pacingFor(source, config.minIntervalMs),
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    cacheTtlMs: config.cacheTtlMs,
    cacheMaxEntries: config.cacheMaxEntries,
    logLevel: config.logLevel,
  };
}

export function buildSources(config: Config, readers: Readers, logger: Logger): SourceAdapter[] {
  const paced = (source: SourceId) => pacedConfig(config, source);

  const marmitonOptions: MarmitonClientOptions = { config: paced(MARMITON_PROFILE.id) };
  const cookbookOptions: CookbookClientOptions = { config: paced(COOKBOOK_PROFILE.id) };
  const ptitchefOptions: PtitchefClientOptions = {
    config: { ...paced(PTITCHEF_PROFILE.id), ...PAGE_READ_BOUNDS },
    logger,
  };
  const goodfoodOptions: GoodFoodClientOptions = { config: paced(GOODFOOD_PROFILE.id), logger };
  const supertoinetteOptions: SupertoinetteClientOptions = {
    config: paced(SUPERTOINETTE_PROFILE.id),
    logger,
  };
  const pequerecetasOptions: PequerecetasClientOptions = {
    config: paced(PEQUERECETAS_PROFILE.id),
    logger,
  };

  return [
    marmitonAdapter(readers.marmiton ?? new MarmitonClient(marmitonOptions)),
    cookbookAdapter(readers.cookbook ?? new CookbookClient(cookbookOptions)),
    ptitchefAdapter(readers.ptitchef ?? new PtitchefClient(ptitchefOptions)),
    goodfoodAdapter(readers.goodfood ?? new GoodFoodClient(goodfoodOptions)),
    supertoinetteAdapter(readers.supertoinette ?? new SupertoinetteClient(supertoinetteOptions)),
    pequerecetasAdapter(readers.pequerecetas ?? new PequerecetasClient(pequerecetasOptions)),
  ];
}

/** The sources a caller asked for, in the registry's own order. */
export function selectSources(
  sources: SourceAdapter[],
  wanted: readonly SourceId[] | undefined,
): SourceAdapter[] {
  if (!wanted) {
    return sources;
  }

  const unknown = wanted.filter((id) => !sources.some((source) => source.id === id));
  if (unknown.length > 0) {
    throw invalidInput(
      `This server reads no source called ${unknown.map((id) => `"${id}"`).join(", ")}.`,
      `It reads ${sources.map((source) => source.id).join(", ")}.`,
    );
  }

  const chosen = sources.filter((source) => wanted.includes(source.id));
  if (chosen.length === 0) {
    throw invalidInput(
      "A search needs at least one source.",
      `Name one of ${sources.map((source) => source.id).join(", ")}, or leave the argument out to ask them all.`,
    );
  }
  return chosen;
}

/** The profiles the registry holds, for a caller naming the sources in prose. */
export const PROFILES = [
  MARMITON_PROFILE,
  COOKBOOK_PROFILE,
  PTITCHEF_PROFILE,
  GOODFOOD_PROFILE,
  SUPERTOINETTE_PROFILE,
  PEQUERECETAS_PROFILE,
] as const;
