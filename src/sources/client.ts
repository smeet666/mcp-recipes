/**
 * The one place that talks to the sources.
 *
 * It asks them all at once and merges what comes back, so a question is
 * answered by whichever of them holds something. It imports nothing from the
 * MCP layer and is published on its own, so the same code serves a plain
 * script.
 *
 * A source that fails is reported as a source that failed. It is never folded
 * into the answer as an absence: "Marmiton was unreachable" and "Marmiton holds
 * no such recipe" are different statements about the world, and a caller that
 * cannot tell them apart will say the second when only the first is true.
 */

import type { Config, Logger } from "../config.js";
import {
  MAX_ALLOWED_INTERVAL_MS,
  MIN_ALLOWED_INTERVAL_MS,
  createLogger,
  loadConfig,
} from "../config.js";
import { fromSource, invalidInput, timeout as timedOut } from "../errors.js";
import type {
  MergedSearch,
  RecipeDetail,
  RecipeRow,
  SourceId,
  SourceReport,
  WordingAttempt,
} from "../types.js";
import type { SourceAdapter } from "./adapter.js";
import { resolveId } from "./ids.js";
import type { ResolvedId } from "./ids.js";
import { buildSources, selectSources } from "./registry.js";
import type { Readers } from "./registry.js";
import { MAX_WORDINGS_PER_SOURCE, deriveWordings, namesDish } from "./wordings.js";
import type { Wording } from "./wordings.js";

export type { SourceAdapter, ReadRecipe, ReadRows } from "./adapter.js";
export type { CookbookReader } from "./cookbook.js";
export type { MarmitonReader } from "./marmiton.js";
export type { Readers } from "./registry.js";
export type {
  MergedSearch,
  RecipeDetail,
  RecipeRow,
  SourceId,
  SourceProfile,
  SourceReport,
  WordingAttempt,
} from "../types.js";
export { SOURCE_IDS } from "./registry.js";
export { namespacedId, resolveId } from "./ids.js";
export { MAX_WORDINGS_PER_SOURCE, deriveWordings, namesDish, readConditions } from "./wordings.js";
export type { Conditions, Wording } from "./wordings.js";

export interface RecipesClientOptions {
  config?: Partial<Config>;
  logger?: Logger;
  /** Stands in for one or more of the site readers. */
  readers?: Readers;
  /** Replaces the registry outright, for a program bringing its own corpora. */
  sources?: SourceAdapter[];
}

/** The largest number of rows any one source is asked for in a single call. */
export const MAX_LIMIT_PER_SOURCE = 25;

export interface SearchOptions {
  /**
   * Whether a question may be sent in wordings derived from it as well as in
   * the words it was written in.
   *
   * On unless a caller turns it off. A recipe index answers the words it is
   * handed, so a question written as a sentence comes back empty from a corpus
   * holding several of the dish, and an empty answer is read as a corpus that
   * holds nothing. Off, a caller gets exactly the wording they typed and the
   * answer names the wordings that were not sent.
   */
  fanOut?: boolean;
}

/**
 * The pacing this server owes each source, applied to whatever it is handed.
 *
 * A configuration object assembled by a caller has not been through
 * `loadConfig`, so it can carry a missing value, a value of the wrong shape, or
 * a User-Agent that names somebody else. Every setting is held to the same range
 * the environment parser enforces: `timeoutMs: 0` is the usual way of writing
 * "no deadline", and a retry count of a hundred thousand aimed at a site paced
 * in milliseconds is hours of traffic from a single call.
 */
function withGuarantees(config: Config): Config {
  const defaults = loadConfig({});

  const bounded = (value: unknown, fallback: number, min: number, max: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  const claimed = typeof config.userAgent === "string" ? config.userAgent.trim() : "";
  const identifier = defaults.userAgent;

  return {
    ...config,
    userAgent:
      claimed === "" || claimed.includes(identifier) ? identifier : `${claimed} ${identifier}`,
    minIntervalMs: bounded(
      config.minIntervalMs,
      defaults.minIntervalMs,
      MIN_ALLOWED_INTERVAL_MS,
      MAX_ALLOWED_INTERVAL_MS,
    ),
    timeoutMs: bounded(config.timeoutMs, defaults.timeoutMs, 1000, 120_000),
    maxRetries: bounded(config.maxRetries, defaults.maxRetries, 0, 8),
    cacheTtlMs: bounded(config.cacheTtlMs, defaults.cacheTtlMs, 0, 86_400_000),
    cacheMaxEntries: bounded(config.cacheMaxEntries, defaults.cacheMaxEntries, 1, 5000),
    logLevel: config.logLevel ?? defaults.logLevel,
  };
}

/**
 * A wall clock over one source, as a backstop under the deadline that source's
 * own reader keeps.
 *
 * That reader times out its own requests, so this only matters when it cannot:
 * a socket that stalls without erroring, a stand-in reader, a bug in a
 * dependency free to change under a caret range. Without it, one source that
 * never answers holds the whole call open and the rows the others had ready in
 * milliseconds are never returned.
 *
 * The allowance covers every attempt a reader is entitled to make, plus the
 * pacing between them, so this never fires before the reader's own deadline has.
 */
function withDeadline<T>(work: Promise<T>, ms: number, source: SourceAdapter): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const alarm = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          timedOut(`${source.name} did not answer within ${ms}ms and was left out of this answer.`),
        ),
      ms,
    );
    // A pending timer must not hold the process open once the answer is out.
    timer.unref?.();
  });
  return Promise.race([work, alarm]).finally(() => clearTimeout(timer));
}

/** What one source produced for one question, whether or not it produced anything. */
interface Attempt {
  source: SourceAdapter;
  rows: RecipeRow[];
  /** Whether rows naming the dish were put in front of rows that do not. */
  preferredByName: boolean;
  cached: boolean;
  reportedTotal: number | null;
  reportedTotalMeans: string | null;
  skipped: number;
  error: { code: string; message: string; hint?: string } | null;
  wordings: WordingAttempt[];
}

function reportOf(attempt: Attempt, count: number): SourceReport {
  return {
    source: attempt.source.id,
    name: attempt.source.name,
    status: attempt.error ? "failed" : "answered",
    count,
    reportedTotal: attempt.reportedTotal,
    reportedTotalMeans: attempt.reportedTotalMeans,
    skipped: attempt.skipped,
    mixesReferencePages: attempt.source.mixesReferencePages,
    cached: attempt.cached,
    error: attempt.error,
    wordings: attempt.wordings,
    preferredByName: attempt.preferredByName,
  };
}

/** A wording that was never sent, and the reason it was not. */
function heldBack(wording: Wording, because: string): WordingAttempt {
  return {
    query: wording.query,
    derivation: wording.derivation,
    ran: false,
    count: null,
    added: null,
    notRunBecause: because,
    error: null,
  };
}

/**
 * Interleave rows so no source opens the list twice before another has opened
 * it once.
 *
 * Ranking them against each other would need a score every source carries, and
 * there is none: one has reader ratings, another has no author and no rating by
 * nature, and a single ordering would rank on a field most rows cannot have.
 * Taking one from each in turn is an order a caller can describe exactly, which
 * is what the answer does.
 */
export function interleave(groups: RecipeRow[][]): RecipeRow[] {
  const merged: RecipeRow[] = [];
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      const row = group[index];
      if (row) merged.push(row);
    }
  }
  return merged;
}

export class RecipesClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly sources: SourceAdapter[];

  constructor(options: RecipesClientOptions = {}) {
    this.config = withGuarantees({ ...loadConfig(), ...options.config });
    this.logger = options.logger ?? createLogger(this.config.logLevel);
    this.sources = options.sources ?? buildSources(this.config, options.readers ?? {});
  }

  /** What every source sees this client call itself. */
  get userAgent(): string {
    return this.config.userAgent;
  }

  get intervalMs(): number {
    return this.config.minIntervalMs;
  }

  get timeoutMs(): number {
    return this.config.timeoutMs;
  }

  get maxRetries(): number {
    return this.config.maxRetries;
  }

  /** The sources this server reads, in the order an answer takes them. */
  get profiles(): Array<{ id: SourceId; name: string; language: string; homeUrl: string }> {
    return this.sources.map((source) => ({
      id: source.id,
      name: source.name,
      language: source.language,
      homeUrl: source.homeUrl,
    }));
  }

  /**
   * The backstop deadline over one source, covering every attempt it is
   * entitled to make and the pacing between them.
   */
  private get deadlineMs(): number {
    const attempts = this.config.maxRetries + 1;
    return this.config.timeoutMs * attempts + this.config.minIntervalMs * this.config.maxRetries;
  }

  /**
   * Ask every source the same question and merge the rows.
   *
   * The calls go out together, so the answer takes as long as the slowest
   * source rather than as long as all of them. Whichever of them fail, the rest
   * still come back, and the report says which was which.
   */
  async searchRecipes(
    query: string,
    limitPerSource: number,
    wanted?: readonly SourceId[],
    options: SearchOptions = {},
  ): Promise<MergedSearch> {
    const trimmed = query.trim();
    if (trimmed === "") {
      throw invalidInput("A search needs something to look for.", "Name a dish or an ingredient.");
    }
    // A recipe index handed nothing it can match on answers with the page it
    // shows by default, and those rows would come back as this question's
    // recipes. One character is a word in the scripts that write one that way,
    // so what is asked for is a letter or a digit rather than a length.
    if (!/[\p{L}\p{N}]/u.test(trimmed)) {
      throw invalidInput(
        `"${trimmed}" carries no letter and no digit, so there is no word to search for.`,
        "Name a dish or an ingredient.",
      );
    }

    const chosen = selectSources(this.sources, wanted);
    const limit = Math.max(1, Math.min(MAX_LIMIT_PER_SOURCE, Math.trunc(limitPerSource)));
    const fanOut = options.fanOut ?? true;

    const attempts = await Promise.all(
      chosen.map((source) => this.searchOne(source, trimmed, limit, fanOut)),
    );

    const groups = attempts.map((attempt) => attempt.rows.slice(0, limit));
    return {
      rows: interleave(groups),
      reports: attempts.map((attempt, index) => reportOf(attempt, groups[index]!.length)),
    };
  }

  /**
   * Ask one source the question in several wordings, and union what comes back.
   *
   * The wordings go out one after another rather than together, because each
   * source is paced and a burst would spend the whole ladder's politeness at
   * once. They stop early: a wording is only sent when the ones before it left
   * the source short of what was asked for, so the ordinary case where the
   * question names a dish costs one request.
   *
   * Each wording is a different search rather than a further page of the same
   * one. One of these sites serves a single page of results and disallows
   * paging past it, so a second page is never asked for, here or anywhere else.
   */
  private async searchOne(
    source: SourceAdapter,
    question: string,
    limit: number,
    fanOut: boolean,
  ): Promise<Attempt> {
    const derived = deriveWordings(question);
    const wordings: WordingAttempt[] = [];
    const rows: RecipeRow[] = [];
    const seen = new Set<string>();

    let cached = false;
    let skipped = 0;
    let reportedTotal: number | null = null;
    let reportedTotalMeans: string | null = null;
    let answered = false;
    let failure: { code: string; message: string; hint?: string } | null = null;
    /**
     * Rows whose title carries a word naming the dish.
     *
     * This is what "enough" counts, rather than rows. A source that ranks on
     * the words it was handed fills a page with recipes sharing a question's
     * framing words, and stopping on the size of that page would stop on the
     * evidence that the dish has not been found. Every row is kept either way.
     */
    let onTopic = 0;

    for (const [index, wording] of derived.entries()) {
      if (index > 0 && !fanOut) {
        wordings.push(
          heldBack(wording, "fan_out was turned off, so only the words as asked were sent"),
        );
        continue;
      }
      if (index >= MAX_WORDINGS_PER_SOURCE) {
        wordings.push(
          heldBack(
            wording,
            `the ceiling of ${MAX_WORDINGS_PER_SOURCE} searches of one source was reached`,
          ),
        );
        continue;
      }
      if (failure !== null) {
        wordings.push(
          heldBack(wording, `${source.name} did not answer the wording before this one`),
        );
        continue;
      }
      if (onTopic >= limit) {
        wordings.push(
          heldBack(
            wording,
            "the wordings already sent returned as many rows naming the dish as were asked for",
          ),
        );
        continue;
      }

      try {
        const read = await withDeadline(
          source.search(wording.query, limit),
          this.deadlineMs,
          source,
        );
        answered = true;
        cached = cached || read.cached;
        skipped += read.skipped;
        if (reportedTotal === null && reportedTotalMeans === null) {
          reportedTotal = read.reportedTotal;
          reportedTotalMeans = read.reportedTotalMeans;
        }
        if (read.skipped > 0) {
          this.logger.warn(
            `${source.name} sent ${read.skipped} row(s) this server could not read; they were left out.`,
          );
        }

        let added = 0;
        for (const row of read.rows) {
          // The identifier names its source, so two sources minting the same
          // reference stay two rows while one recipe reached twice stays one.
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          rows.push(row);
          added += 1;
          if (namesDish(row.title, question)) onTopic += 1;
        }

        wordings.push({
          query: wording.query,
          derivation: wording.derivation,
          ran: true,
          count: read.rows.length,
          added,
          notRunBecause: null,
          error: null,
        });
      } catch (error) {
        const known = fromSource(error, source.name);
        this.logger.warn(
          `${source.name} did not answer "${wording.query}": [${known.code}] ${known.message}`,
        );
        const reason = {
          code: known.code,
          message: known.message,
          ...(known.details.hint ? { hint: known.details.hint } : {}),
        };
        wordings.push({
          query: wording.query,
          derivation: wording.derivation,
          ran: true,
          count: null,
          added: null,
          notRunBecause: null,
          error: reason,
        });
        failure = reason;
      }
    }

    // Where several wordings contributed, the rows naming the dish are put in
    // front of the rows that do not, each group keeping the order it arrived
    // in. Without this, a first wording answering with a page of near-misses
    // fills the limit and cuts away the rows a later wording found. A single
    // wording is left in the order its source returned it, since there is
    // nothing to rescue it from.
    const contributing = wordings.filter((attempt) => (attempt.added ?? 0) > 0).length;
    const ordered =
      contributing > 1
        ? [
            ...rows.filter((row) => namesDish(row.title, question)),
            ...rows.filter((row) => !namesDish(row.title, question)),
          ]
        : rows;

    // A source that answered one wording answered. Reporting it as failed
    // because a later wording timed out would hide the rows it did return
    // behind a claim that it said nothing.
    return {
      source,
      rows: ordered,
      preferredByName: contributing > 1,
      cached,
      reportedTotal,
      reportedTotalMeans,
      skipped,
      error: answered ? null : failure,
      wordings,
    };
  }

  /**
   * Read one recipe, from whichever source the identifier names.
   *
   * Only that source is called. Trying another after a miss would turn "this
   * source has no page by this name" into somebody else's recipe with a
   * different title, which is a worse answer than the absence it replaced.
   */
  async getRecipe(
    id: string,
  ): Promise<{ recipe: RecipeDetail; cached: boolean; read: ResolvedId }> {
    const read = resolveId(id, this.sources);
    try {
      const outcome = await withDeadline(
        read.source.getRecipe(read.reference),
        this.deadlineMs,
        read.source,
      );
      return { recipe: outcome.recipe, cached: outcome.cached, read };
    } catch (error) {
      throw fromSource(error, read.source.name);
    }
  }
}
