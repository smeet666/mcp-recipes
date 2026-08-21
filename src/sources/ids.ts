/**
 * Identifiers that name the source they came from.
 *
 * Every source hands back an opaque string, and a caller holding a merged list
 * has no way to tell one source's string from another's. Every identifier this
 * server returns therefore carries a prefix, and `get_recipe` routes on it
 * rather than trying each source in turn.
 */

import { invalidInput } from "../errors.js";
import type { SourceId } from "../types.js";
import type { SourceAdapter } from "./adapter.js";

export { namespacedId } from "./adapter.js";

const SEPARATOR = ":";

export interface ResolvedId {
  source: SourceAdapter;
  /** The string that source's own reader takes. */
  reference: string;
  /** Set when the shape was read rather than stated, so the answer can say so. */
  inferred: string | null;
}

/**
 * Work out which source an identifier belongs to.
 *
 * A prefixed identifier is routed on what it says. A raw one is offered to each
 * source in turn, and a source claims only the shapes it mints: digits for one,
 * a namespaced page key for another. Exactly one claim routes the read and the
 * answer says which reading it used.
 *
 * More than one claim is refused rather than resolved, because picking a winner
 * would send the read somewhere a caller did not intend and answer with a
 * confident recipe for the wrong dish. No claim at all is refused too: a bare
 * dish name is a search, not an identifier, and guessing a page name from it
 * returns whatever that guess happens to hit.
 */
export function resolveId(rawId: string, sources: readonly SourceAdapter[]): ResolvedId {
  const trimmed = rawId.trim();
  if (trimmed === "") {
    throw invalidInput(
      "A recipe identifier is required.",
      `Use one of the ids search_recipes returned, such as ${example(sources)}.`,
    );
  }

  for (const source of sources) {
    const prefix = `${source.id}${SEPARATOR}`;
    if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
      continue;
    }
    const reference = trimmed.slice(prefix.length).trim();
    if (reference === "") {
      throw invalidInput(
        `"${trimmed}" names a source and no recipe.`,
        "Put the source's own identifier after the colon.",
      );
    }
    return { source, reference, inferred: null };
  }

  const claimed = sources
    .map((source) => ({ source, claim: source.claims(trimmed) }))
    .filter((entry): entry is { source: SourceAdapter; claim: NonNullable<typeof entry.claim> } =>
      Boolean(entry.claim),
    );

  if (claimed.length > 1) {
    throw invalidInput(
      `"${trimmed}" could be an identifier on ${names(claimed.map((entry) => entry.source))}, so it names no one recipe.`,
      `Spell it with its source, as in ${claimed.map((entry) => `${entry.source.id}:${trimmed}`).join(" or ")}.`,
    );
  }

  const only = claimed[0];
  if (!only) {
    throw invalidInput(
      `"${trimmed}" is not an identifier any of the sources this server reads would mint.`,
      `Call search_recipes with "${trimmed}" as the query and pass an id from a row, ` +
        `which reads like ${example(sources)}.`,
    );
  }

  return {
    source: only.source,
    reference: only.claim.reference,
    inferred: only.claim.guess
      ? `${only.claim.why}, which is a guess: check the recipe that comes back is the one you meant`
      : only.claim.why,
  };
}

/** Sources named the way a sentence names them. */
function names(sources: readonly { name: string }[]): string {
  const all = sources.map((source) => source.name);
  if (all.length <= 1) {
    return all.join("");
  }
  return `${all.slice(0, -1).join(", ")} and ${all.at(-1)}`;
}

/** An identifier of the shape this server hands out, for a hint. */
function example(sources: readonly SourceAdapter[]): string {
  const first = sources[0];
  return first ? `${first.id}${SEPARATOR}<the source's own id>` : "<source>:<id>";
}

/** Which source an identifier names, without resolving what it points at. */
export function sourceOf(rawId: string, sources: readonly SourceAdapter[]): SourceId | null {
  const prefix = rawId.split(SEPARATOR)[0]?.toLowerCase();
  return sources.find((source) => source.id.toLowerCase() === prefix)?.id ?? null;
}
