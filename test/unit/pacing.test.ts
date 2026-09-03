/**
 * The spacing each site is read at.
 *
 * One setting governs every source, and the sources do not ask for the same
 * patience: these sites declare floors of half a second, one second and three
 * seconds. Several of the clients take the number a configuration object hands
 * them and clamp nothing, so a setting posted once for all of them would read
 * the slowest sites six times faster than they ask.
 *
 * What is tested is the rule: configuration can only make this server more
 * patient than a source asks for.
 */

import { PtitchefClient } from "mcp-ptitchef/client";
import { PequerecetasClient } from "mcp-pequerecetas/client";
import { SupertoinetteClient } from "mcp-supertoinette/client";
import { describe, expect, it } from "vitest";
import { createLogger, loadConfig, MIN_ALLOWED_INTERVAL_MS } from "../../src/config.js";
import { RecipesClient } from "../../src/sources/client.js";
import { PACED_SOURCES, pacedConfig, pacingFor, PROFILES } from "../../src/sources/registry.js";
import { fakeReaders } from "./support.js";

/**
 * What each site asks for, in its own package.
 *
 * Repeated here because the packages publish these numbers as source constants
 * and not through their `./client` entry, so a test cannot read them off the
 * installed build. A number that drifts from its package makes this server more
 * patient or less, and only the second is a fault; the assertions below are
 * written so the second one fails.
 */
const ASKS_FOR = {
  marmiton: 500,
  cookbook: 500,
  ptitchef: 1000,
  goodfood: 1000,
  supertoinette: 3000,
  pequerecetas: 3000,
} as const;

const atTheFloor = loadConfig({ RECIPES_MIN_INTERVAL_MS: String(MIN_ALLOWED_INTERVAL_MS) });
const silent = createLogger("silent");

describe("every source the registry builds has a pace of its own", () => {
  it("covers each of them, so none is read at whatever the setting says", () => {
    const alphabetical = (a: string, b: string) => a.localeCompare(b);

    expect(PACED_SOURCES.toSorted(alphabetical)).toEqual(
      PROFILES.map((profile) => profile.id).toSorted(alphabetical),
    );
  });

  it("is at least as patient as the site asks, whatever the setting", () => {
    for (const [source, asked] of Object.entries(ASKS_FOR)) {
      expect(pacingFor(source, MIN_ALLOWED_INTERVAL_MS), source).toBeGreaterThanOrEqual(asked);
      expect(pacedConfig(atTheFloor, source).minIntervalMs, source).toBeGreaterThanOrEqual(asked);
    }
  });

  it("keeps a setting that is slower still, because that only asks for less", () => {
    const patient = loadConfig({ RECIPES_MIN_INTERVAL_MS: "9000" });

    for (const profile of PROFILES) {
      expect(pacedConfig(patient, profile.id).minIntervalMs, profile.id).toBe(9000);
    }
  });

  it("is not more patient than a site asks, which would be spending its own time", () => {
    for (const [source, asked] of Object.entries(ASKS_FOR)) {
      expect(pacingFor(source, MIN_ALLOWED_INTERVAL_MS), source).toBe(asked);
    }
  });

  it("gives a source it knows nothing about the slowest pace it holds", () => {
    // A source with no entry is one this server has not been told about, and an
    // unknown site is not one to be optimistic with.
    expect(pacingFor("a-source-nobody-registered", MIN_ALLOWED_INTERVAL_MS)).toBe(
      Math.max(...Object.values(ASKS_FOR)),
    );
  });
});

describe("what the client actually spaces its requests by", () => {
  // Building a client sends nothing. These publish the spacing in force, which
  // closes the loop between what the registry hands over and what the site is
  // read at. The three below are the clients that clamp nothing of their own.
  it("reports the pace the site asked for, not the shared setting", () => {
    expect(
      new PequerecetasClient({ config: pacedConfig(atTheFloor, "pequerecetas") }).currentIntervalMs,
    ).toBe(ASKS_FOR.pequerecetas);
    expect(
      new SupertoinetteClient({
        config: pacedConfig(atTheFloor, "supertoinette"),
        logger: silent,
      }).currentIntervalMs,
    ).toBe(ASKS_FOR.supertoinette);
    expect(
      new PtitchefClient({
        config: {
          ...pacedConfig(atTheFloor, "ptitchef"),
          maxBodyBytes: 8_000_000,
          budgetMs: 60_000,
        },
        logger: silent,
      }).currentIntervalMs,
    ).toBe(ASKS_FOR.ptitchef);
  });
});

describe("the backstop over one source", () => {
  /**
   * The backstop is a wall clock this server keeps under the deadline each
   * reader keeps for itself. Firing first abandons a read whose requests carry
   * on reaching the site, so it has to allow everything a reader can spend.
   */
  const deadlineFor = (client: RecipesClient, source: string) =>
    (client as unknown as { deadlineFor: (id: string) => number }).deadlineFor(source);

  it("allows the pace that source is read at, not the shared setting", () => {
    const client = new RecipesClient({
      config: { minIntervalMs: MIN_ALLOWED_INTERVAL_MS },
      readers: fakeReaders(),
      logger: silent,
    });

    expect(deadlineFor(client, "pequerecetas")).toBeGreaterThan(deadlineFor(client, "marmiton"));
  });

  it("allows the longest wait a site can ask for between two attempts", () => {
    const client = new RecipesClient({
      config: { minIntervalMs: MIN_ALLOWED_INTERVAL_MS, timeoutMs: 1000, maxRetries: 3 },
      readers: fakeReaders(),
      logger: silent,
    });
    const attempts = 4 * 1000;
    const spacing = pacingFor("marmiton", MIN_ALLOWED_INTERVAL_MS) * 3;

    // Whatever the figure, it is more than the attempts and the spacing alone:
    // a site answering "slow down" names a wait, and the reader honours it.
    expect(deadlineFor(client, "marmiton")).toBeGreaterThan(attempts + spacing);
  });

  it("gives every source more room than its own attempts take", () => {
    const client = new RecipesClient({ readers: fakeReaders(), logger: silent });
    const config = loadConfig({});

    for (const profile of PROFILES) {
      expect(deadlineFor(client, profile.id), profile.id).toBeGreaterThan(
        config.timeoutMs * (config.maxRetries + 1) +
          pacingFor(profile.id, config.minIntervalMs) * config.maxRetries,
      );
    }
  });
});
