/**
 * Settings read from the environment.
 *
 * The rule under test is that a bad value never takes a tool away: it is
 * reported on stderr and the default stands, because a server that refuses to
 * start over a typo is very hard to diagnose from inside a host application.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_USER_AGENT,
  MAX_ALLOWED_INTERVAL_MS,
  MIN_ALLOWED_INTERVAL_MS,
  createLogger,
  loadConfig,
} from "../../src/config.js";
import { REPO_URL } from "../../src/version.js";
import { RecipesClient } from "../../src/sources/client.js";
import { fakeCookbook, fakeMarmiton } from "./support.js";

let written: string[] = [];

beforeEach(() => {
  written = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("defaults", () => {
  it("names the project and a way to reach a human", () => {
    expect(loadConfig({}).userAgent).toBe(DEFAULT_USER_AGENT);
    expect(DEFAULT_USER_AGENT).toContain(REPO_URL);
  });

  it("paces requests without being asked to", () => {
    expect(loadConfig({}).minIntervalMs).toBe(DEFAULT_INTERVAL_MS);
  });

  it("keeps quiet unless asked to speak", () => {
    expect(loadConfig({}).logLevel).toBe("error");
  });
});

describe("a value the environment sets", () => {
  it("is taken when it is readable and in range", () => {
    expect(loadConfig({ RECIPES_MIN_INTERVAL_MS: "4000" }).minIntervalMs).toBe(4000);
    expect(loadConfig({ RECIPES_LOG_LEVEL: "debug" }).logLevel).toBe("debug");
  });

  it("appends the project's identity to a User-Agent a caller sets", () => {
    const config = loadConfig({ RECIPES_USER_AGENT: "my-app/1.0" });
    expect(config.userAgent.startsWith("my-app/1.0")).toBe(true);
    expect(config.userAgent).toContain(REPO_URL);
  });

  it("falls back and says so when it cannot be read", () => {
    expect(loadConfig({ RECIPES_MIN_INTERVAL_MS: "soon" }).minIntervalMs).toBe(DEFAULT_INTERVAL_MS);
    expect(written.join("")).toMatch(/is not a whole number/);
  });

  it("refuses a value outside its range rather than clamping it silently", () => {
    expect(loadConfig({ RECIPES_MIN_INTERVAL_MS: "1" }).minIntervalMs).toBe(DEFAULT_INTERVAL_MS);
    expect(written.join("")).toMatch(/outside/);
  });

  it("refuses a log level it does not know", () => {
    expect(loadConfig({ RECIPES_LOG_LEVEL: "verbose" }).logLevel).toBe("error");
    expect(written.join("")).toMatch(/is not one of/);
  });
});

describe("the pacing floor holds however a setting arrives", () => {
  it("cannot be lowered through the environment", () => {
    expect(loadConfig({ RECIPES_MIN_INTERVAL_MS: "10" }).minIntervalMs).toBeGreaterThanOrEqual(
      MIN_ALLOWED_INTERVAL_MS,
    );
  });

  it("cannot be lowered through a configuration object handed to the client", () => {
    const client = new RecipesClient({
      config: { minIntervalMs: 1 },
      readers: { marmiton: fakeMarmiton(), cookbook: fakeCookbook() },
    });
    expect(client.intervalMs).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
  });

  it("survives a configuration object carrying a value of the wrong shape", () => {
    const client = new RecipesClient({
      config: { minIntervalMs: Number.NaN },
      readers: { marmiton: fakeMarmiton(), cookbook: fakeCookbook() },
    });
    expect(client.intervalMs).toBe(DEFAULT_INTERVAL_MS);
  });

  it("keeps the project's identity when a caller names themselves instead", () => {
    const client = new RecipesClient({
      config: { userAgent: "Mozilla/5.0" },
      readers: { marmiton: fakeMarmiton(), cookbook: fakeCookbook() },
    });
    expect(client.userAgent).toContain(REPO_URL);
  });

  it("does not repeat the identity when it is already there", () => {
    const client = new RecipesClient({
      config: { userAgent: DEFAULT_USER_AGENT },
      readers: { marmiton: fakeMarmiton(), cookbook: fakeCookbook() },
    });
    expect(client.userAgent).toBe(DEFAULT_USER_AGENT);
  });

  it("stays below the ceiling that would make a request look hung", () => {
    expect(
      loadConfig({ RECIPES_MIN_INTERVAL_MS: String(MAX_ALLOWED_INTERVAL_MS + 1) }).minIntervalMs,
    ).toBe(DEFAULT_INTERVAL_MS);
  });
});

describe("logging", () => {
  it("writes to stderr, never to stdout", () => {
    createLogger("debug").info("hello");
    expect(written.join("")).toContain("hello");
  });

  it("says nothing at all when told to be silent", () => {
    createLogger("silent").error("boom");
    expect(written.join("")).toBe("");
  });

  it("lets a warning through at the default level, because it qualifies an answer", () => {
    createLogger("error").warn("a site was left out");
    expect(written.join("")).toContain("a site was left out");
  });
});
