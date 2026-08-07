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
import { invalidInput, timeout as timedOut, toRecipesError } from "../errors.js";
import type { MergedSearch, RecipeDetail, RecipeRow, SourceId, SourceReport } from "../types.js";
import type { SourceAdapter } from "./adapter.js";
import { resolveId } from "./ids.js";
import type { ResolvedId } from "./ids.js";
import { buildSources, selectSources } from "./registry.js";
import type { Readers } from "./registry.js";

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
} from "../types.js";
export { SOURCE_IDS } from "./registry.js";
export { namespacedId, resolveId } from "./ids.js";

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
          timedOut(
            `${source.name} did not answer within ${ms}ms and was left out of this answer.`,
          ),
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
  cached: boolean;
  reportedTotal: number | null;
  reportedTotalMeans: string | null;
  skipped: number;
  error: { code: string; message: string; hint?: string } | null;
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
  ): Promise<MergedSearch> {
    const trimmed = query.trim();
    if (trimmed === "") {
      throw invalidInput("A search needs something to look for.", "Name a dish or an ingredient.");
    }

    const chosen = selectSources(this.sources, wanted);
    const limit = Math.max(1, Math.min(MAX_LIMIT_PER_SOURCE, Math.trunc(limitPerSource)));

    const attempts = await Promise.all(
      chosen.map((source) => this.searchOne(source, trimmed, limit)),
    );

    const groups = attempts.map((attempt) => attempt.rows.slice(0, limit));
    return {
      rows: interleave(groups),
      reports: attempts.map((attempt, index) => reportOf(attempt, groups[index]!.length)),
    };
  }

  private async searchOne(
    source: SourceAdapter,
    query: string,
    limit: number,
  ): Promise<Attempt> {
    try {
      const read = await withDeadline(source.search(query, limit), this.deadlineMs, source);
      if (read.skipped > 0) {
        this.logger.warn(
          `${source.name} sent ${read.skipped} row(s) this server could not read; they were left out.`,
        );
      }
      return {
        source,
        rows: read.rows,
        cached: read.cached,
        reportedTotal: read.reportedTotal,
        reportedTotalMeans: read.reportedTotalMeans,
        skipped: read.skipped,
        error: null,
      };
    } catch (error) {
      const known = toRecipesError(error);
      this.logger.warn(`${source.name} did not answer: [${known.code}] ${known.message}`);
      return {
        source,
        rows: [],
        cached: false,
        reportedTotal: null,
        reportedTotalMeans: null,
        skipped: 0,
        error: {
          code: known.code,
          message: known.message,
          ...(known.details.hint ? { hint: known.details.hint } : {}),
        },
      };
    }
  }

  /**
   * Read one recipe, from whichever source the identifier names.
   *
   * Only that source is called. Trying another after a miss would turn "this
   * source has no page by this name" into somebody else's recipe with a
   * different title, which is a worse answer than the absence it replaced.
   */
  async getRecipe(id: string): Promise<{ recipe: RecipeDetail; cached: boolean; read: ResolvedId }> {
    const read = resolveId(id, this.sources);
    try {
      const outcome = await withDeadline(
        read.source.getRecipe(read.reference),
        this.deadlineMs,
        read.source,
      );
      return { recipe: outcome.recipe, cached: outcome.cached, read };
    } catch (error) {
      throw toRecipesError(error);
    }
  }
}
