/**
 * Settings, read from the environment.
 *
 * A value that cannot be read warns and falls back rather than stopping the
 * server: a typo in one variable should not take away every tool. Warnings go
 * to stderr, because stdout carries the protocol and anything written there
 * corrupts the session.
 *
 * One setting governs every source. Each is read through its own client, and
 * each of those keeps a pacing floor of its own that nothing here can lower, so
 * a value set here can only make this server more patient than it already is.
 */

import { PKG_VERSION, REPO_URL } from "./version.js";

export const LOG_LEVELS = ["silent", "error", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Spacing between two requests to the same site.
 *
 * No source publishes a ceiling for a client like this one, so the number is
 * self-imposed politeness: a second between requests is far below what a person
 * browsing one of these sites generates, and the answers are cached, so a
 * conversation that circles back to a recipe costs no traffic at all.
 */
export const DEFAULT_INTERVAL_MS = 1000;
/**
 * Configuration can slow the server down. It cannot take the spacing below this
 * floor, whether the setting arrives through the environment or through a
 * configuration object handed to the published client entry point.
 */
export const MIN_ALLOWED_INTERVAL_MS = 500;
/** Beyond this a request would look hung rather than paced. */
export const MAX_ALLOWED_INTERVAL_MS = 60_000;

export interface Config {
  userAgent: string;
  minIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  logLevel: LogLevel;
}

export const DEFAULT_USER_AGENT = `mcp-recipes/${PKG_VERSION} (+${REPO_URL})`;

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(level: LogLevel): Logger {
  const rank = LOG_LEVELS.indexOf(level);
  const write = (at: LogLevel, message: string) => {
    if (rank === 0 || LOG_LEVELS.indexOf(at) > rank) {
      return;
    }
    process.stderr.write(`[mcp-recipes] ${at}: ${message}\n`);
  };
  return {
    debug: (m) => write("debug", m),
    info: (m) => write("info", m),
    // A warning goes out at the error level so it survives the default
    // setting: a caller has to know that a site was left out of an answer.
    warn: (m) => write("error", m),
    error: (m) => write("error", m),
  };
}

function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    process.stderr.write(
      `[mcp-recipes] error: ${name}="${raw}" is not a whole number; using ${fallback}.\n`,
    );
    return fallback;
  }
  if (value < min || value > max) {
    // Clamping silently would let a caller believe a setting took effect when
    // the opposite is true, so the refusal is stated and the default stands.
    process.stderr.write(
      `[mcp-recipes] error: ${name}=${value} is outside ${min}..${max}; using ${fallback}.\n`,
    );
    return fallback;
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const level = env.RECIPES_LOG_LEVEL as LogLevel | undefined;
  const logLevel = level && LOG_LEVELS.includes(level) ? level : "error";
  if (level && !LOG_LEVELS.includes(level)) {
    process.stderr.write(
      `[mcp-recipes] error: RECIPES_LOG_LEVEL="${level}" is not one of ${LOG_LEVELS.join(", ")}; using error.\n`,
    );
  }

  const custom = env.RECIPES_USER_AGENT?.trim();

  return {
    // A caller who wants to be recognised may say who they are, and the
    // contact address stays attached: a site has to be able to reach a human
    // about traffic it did not expect.
    userAgent: custom ? `${custom} ${DEFAULT_USER_AGENT}` : DEFAULT_USER_AGENT,
    minIntervalMs: readInteger(
      env,
      "RECIPES_MIN_INTERVAL_MS",
      DEFAULT_INTERVAL_MS,
      MIN_ALLOWED_INTERVAL_MS,
      MAX_ALLOWED_INTERVAL_MS,
    ),
    timeoutMs: readInteger(env, "RECIPES_TIMEOUT_MS", 20_000, 1000, 120_000),
    maxRetries: readInteger(env, "RECIPES_MAX_RETRIES", 3, 0, 8),
    cacheTtlMs: readInteger(env, "RECIPES_CACHE_TTL_MS", 900_000, 0, 86_400_000),
    cacheMaxEntries: readInteger(env, "RECIPES_CACHE_MAX_ENTRIES", 200, 1, 5000),
    logLevel,
  };
}
