/**
 * One error type, carrying a code the caller can branch on.
 *
 * The distinction that matters most is between "no site holds this" and "the
 * question could not be asked". Collapsing the two lets a model report an
 * absence it never established, which is a false statement about the world
 * rather than a missing feature.
 */

import { ISSUES_URL } from "./version.js";

export type ErrorCode =
  /** A site answered, and holds no such recipe. */
  | "not_found"
  /** The arguments cannot produce a request. */
  | "invalid_input"
  /** A site asked this client to slow down. */
  | "rate_limited"
  /** A response arrived in a shape this server cannot read. */
  | "parse_failure"
  /** The request could not be completed. */
  | "network_error"
  /** The request was abandoned before an answer arrived. */
  | "timeout";

export const ERROR_CODES: readonly ErrorCode[] = [
  "not_found",
  "invalid_input",
  "rate_limited",
  "parse_failure",
  "network_error",
  "timeout",
];

export interface ErrorDetails {
  /** What the caller can do about it, when there is something. */
  hint?: string;
  /** The address that produced the failure, for a bug report. */
  url?: string;
  status?: number;
}

export class RecipesError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;

  constructor(code: ErrorCode, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = "RecipesError";
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message: string, details?: ErrorDetails) =>
  new RecipesError("not_found", message, details ?? {});

export const invalidInput = (message: string, hint?: string) =>
  new RecipesError("invalid_input", message, hint ? { hint } : {});

export const rateLimited = (message: string, details?: ErrorDetails) =>
  new RecipesError("rate_limited", message, {
    hint: "Wait a moment and ask again. This says nothing about whether the recipe exists.",
    ...details,
  });

export const parseFailure = (message: string, details?: ErrorDetails) =>
  new RecipesError("parse_failure", message, {
    hint: `A site may have changed how it answers. Please report this at ${ISSUES_URL} with the arguments you used.`,
    ...details,
  });

export const networkError = (message: string, details?: ErrorDetails) =>
  new RecipesError("network_error", message, details ?? {});

export const timeout = (message: string, details?: ErrorDetails) =>
  new RecipesError("timeout", message, details ?? {});

/**
 * Read the code off a failure raised by the library that reads a source.
 *
 * Those libraries throw their own error classes carrying the six codes above,
 * and the classes are not part of the interface this server imports. Reading
 * the field keeps the taxonomy intact without depending on a class identity a
 * library is free to change, and anything unrecognisable is reported as a
 * network failure, which is the reading that claims least.
 */
export function toRecipesError(error: unknown): RecipesError {
  if (error instanceof RecipesError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const raw = error as { code?: unknown; details?: unknown } | null;
  const code = typeof raw?.code === "string" ? raw.code : "";
  const known = ERROR_CODES.find((candidate) => candidate === code);

  const details =
    raw && typeof raw.details === "object" && raw.details !== null
      ? (raw.details as ErrorDetails)
      : {};

  return new RecipesError(known ?? "network_error", message, details);
}

/**
 * Adopt a failure raised while reading a source, in this server's own words.
 *
 * The code is kept, since that is the taxonomy every layer branches on. The
 * sentence is not: what arrives with such a failure is written by whoever the
 * reader was talking to, in their vocabulary and about their internals, and
 * serving it as this answer's own sentence states as this server's finding
 * something it never established. It is quoted and credited to the source
 * instead, on one line, so the diagnostic survives without borrowing a voice
 * or a shape it has no claim to. The advice that came with it goes, because
 * advice addressed to somebody else's reader sends a caller somewhere this
 * server cannot answer for.
 */
export function fromSource(error: unknown, sourceName: string): RecipesError {
  if (error instanceof RecipesError) return error;

  const known = toRecipesError(error);
  const reported = known.message.replace(/\s+/g, " ").trim();
  const opening =
    known.code === "not_found"
      ? `${sourceName} holds nothing under this name.`
      : `${sourceName} could not be read.`;
  const message = reported === "" ? opening : `${opening} It reports: "${reported}"`;
  const details: ErrorDetails = {};
  if (known.details.url !== undefined) details.url = known.details.url;
  if (known.details.status !== undefined) details.status = known.details.status;

  switch (known.code) {
    case "not_found":
      return notFound(message, details);
    case "invalid_input":
      return invalidInput(message);
    case "rate_limited":
      return rateLimited(message, details);
    case "parse_failure":
      return parseFailure(message, details);
    case "timeout":
      return timeout(message, details);
    default:
      return networkError(message, details);
  }
}
