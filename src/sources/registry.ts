/**
 * The sources this server reads.
 *
 * One list, and everything above it is written for however long the list is.
 * Adding a corpus means writing an adapter and adding it here; no tool, no
 * merge and no error path has a branch per source.
 */

import { MarmitonClient } from "mcp-marmiton/client";
import type { MarmitonClientOptions } from "mcp-marmiton/client";
import { CookbookClient } from "mcp-wikibooks-cookbook/client";
import type { ClientOptions as CookbookClientOptions } from "mcp-wikibooks-cookbook/client";

import type { Config } from "../config.js";
import { invalidInput } from "../errors.js";
import type { SourceId } from "../types.js";
import type { SourceAdapter } from "./adapter.js";
import { COOKBOOK_PROFILE, cookbookAdapter } from "./cookbook.js";
import type { CookbookReader } from "./cookbook.js";
import { MARMITON_PROFILE, marmitonAdapter } from "./marmiton.js";
import type { MarmitonReader } from "./marmiton.js";

/**
 * A reader may be supplied in place of the one that talks to a site, so a
 * program embedding this server can put its own cache in front of a corpus, and
 * a test can drive it from fixed answers.
 */
export interface Readers {
  marmiton?: MarmitonReader;
  cookbook?: CookbookReader;
}

/** The sources a caller can name, in the order an answer takes them. */
export const SOURCE_IDS: readonly SourceId[] = [MARMITON_PROFILE.id, COOKBOOK_PROFILE.id];

export function buildSources(config: Config, readers: Readers = {}): SourceAdapter[] {
  const shared = {
    userAgent: config.userAgent,
    minIntervalMs: config.minIntervalMs,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    cacheTtlMs: config.cacheTtlMs,
    cacheMaxEntries: config.cacheMaxEntries,
    logLevel: config.logLevel,
  };

  const marmitonOptions: MarmitonClientOptions = { config: shared };
  const cookbookOptions: CookbookClientOptions = { config: shared };

  return [
    marmitonAdapter(readers.marmiton ?? new MarmitonClient(marmitonOptions)),
    cookbookAdapter(readers.cookbook ?? new CookbookClient(cookbookOptions)),
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
