/**
 * The six codes, and the one place a source's failure becomes one of them.
 *
 * A caller branches on the code that opens a message, so the distinction that
 * matters most is between "the site holds no such thing" and "the question
 * could not be asked". Collapsing those two lets an answer report an absence
 * nobody established.
 */

import { describe, expect, it } from "vitest";
import {
  RecipesError,
  fromSource,
  invalidInput,
  networkError,
  notFound,
  parseFailure,
  rateLimited,
  timeout,
  toRecipesError,
} from "../../src/errors.js";

class FakeSourceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

describe("each code has a way of being raised", () => {
  const raised: [string, RecipesError][] = [
    ["not_found", notFound("gone")],
    ["invalid_input", invalidInput("bad")],
    ["rate_limited", rateLimited("slow down")],
    ["parse_failure", parseFailure("unreadable")],
    ["network_error", networkError("unreachable")],
    ["timeout", timeout("too slow")],
  ];

  for (const [code, error] of raised) {
    it(`raises ${code}`, () => {
      expect(error.code).toBe(code);
      expect(error).toBeInstanceOf(RecipesError);
    });
  }

  it("carries a hint where there is something to do about it", () => {
    expect(invalidInput("bad", "try this").details.hint).toBe("try this");
    expect(invalidInput("bad").details.hint).toBeUndefined();
  });

  it("carries the address and the status a failure came with", () => {
    const error = notFound("gone", { url: "https://example.test/x", status: 404 });

    expect(error.details.url).toBe("https://example.test/x");
    expect(error.details.status).toBe(404);
  });
});

describe("reading something that was thrown", () => {
  it("keeps an error already in this vocabulary", () => {
    const raised = notFound("gone");

    expect(toRecipesError(raised)).toBe(raised);
  });

  it("reads a code a source layer raised", () => {
    expect(toRecipesError(new FakeSourceError("rate_limited", "slow down")).code).toBe(
      "rate_limited",
    );
  });

  it("reads anything else as a network failure, which claims least", () => {
    expect(toRecipesError(new Error("socket hang up")).code).toBe("network_error");
    expect(toRecipesError("something").code).toBe("network_error");
    expect(toRecipesError(null).code).toBe("network_error");
  });

  it("reads a code that is not one of the six as a network failure", () => {
    expect(toRecipesError(new FakeSourceError("boom", "x")).code).toBe("network_error");
  });
});

describe("a source's failure, named with the source", () => {
  it("says a source holds nothing under this name", () => {
    const error = fromSource(new FakeSourceError("not_found", ""), "Marmiton");

    expect(error.code).toBe("not_found");
    expect(error.message).toMatch(/Marmiton holds nothing under this name/);
  });

  it("repeats what the source reported, where it reported something", () => {
    const error = fromSource(new FakeSourceError("parse_failure", "no title node"), "Ptitchef");

    expect(error.message).toMatch(/Ptitchef could not be read/);
    expect(error.message).toMatch(/no title node/);
  });

  it("keeps each of the six codes as the code it was", () => {
    for (const code of [
      "not_found",
      "invalid_input",
      "rate_limited",
      "parse_failure",
      "network_error",
      "timeout",
    ]) {
      expect(fromSource(new FakeSourceError(code, "x"), "A site").code).toBe(code);
    }
  });

  it("carries the address and status through, where a source gave them", () => {
    const error = fromSource(
      new FakeSourceError("rate_limited", "slow", { url: "https://x.test", status: 429 }),
      "A site",
    );

    expect(error.details.url).toBe("https://x.test");
    expect(error.details.status).toBe(429);
  });

  it("says a source could not be read where the code means nothing here", () => {
    expect(fromSource(new FakeSourceError("boom", "x"), "A site").code).toBe("network_error");
  });
});
