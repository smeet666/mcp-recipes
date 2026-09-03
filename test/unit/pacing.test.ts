/**
 * The spacing each site is read at.
 *
 * One setting governs every source, and the sources do not ask for the same
 * patience: two of these sites declare three seconds between two requests where
 * the shared default is one. A client built with a configuration object takes
 * the number it is handed and clamps nothing, so a setting posted once for all
 * of them would read those two sites four times faster than they ask.
 *
 * What is tested is the rule rather than the numbers: configuration can only
 * ever make this server more patient than a source asks for.
 */

import { describe, expect, it } from "vitest";
import { PequerecetasClient } from "mcp-pequerecetas/client";
import { SupertoinetteClient } from "mcp-supertoinette/client";
import { createLogger, loadConfig, MIN_ALLOWED_INTERVAL_MS } from "../../src/config.js";
import { pacedConfig, pacingFor, PROFILES } from "../../src/sources/registry.js";

/** The sites that ask for more than the shared default, and what they ask for. */
const ASKS_FOR_MORE = { supertoinette: 3000, pequerecetas: 3000 } as const;

const atTheFloor = loadConfig({ RECIPES_MIN_INTERVAL_MS: String(MIN_ALLOWED_INTERVAL_MS) });

describe("a setting cannot read a source faster than it asks to be read", () => {
  it("gives a source that asks for more the pace it asked for", () => {
    for (const [source, asked] of Object.entries(ASKS_FOR_MORE)) {
      expect(pacingFor(source, MIN_ALLOWED_INTERVAL_MS), source).toBe(asked);
    }
  });

  it("passes that pace to the client the registry builds", () => {
    for (const [source, asked] of Object.entries(ASKS_FOR_MORE)) {
      expect(pacedConfig(atTheFloor, source).minIntervalMs, source).toBe(asked);
    }
  });

  it("keeps a setting that is slower still, because that only asks for less", () => {
    const patient = loadConfig({ RECIPES_MIN_INTERVAL_MS: "9000" });

    for (const profile of PROFILES) {
      expect(pacedConfig(patient, profile.id).minIntervalMs, profile.id).toBe(9000);
    }
  });

  it("leaves every source at the setting where none asks for more", () => {
    for (const profile of PROFILES) {
      const floor = (ASKS_FOR_MORE as Record<string, number | undefined>)[profile.id];
      expect(pacedConfig(atTheFloor, profile.id).minIntervalMs, profile.id).toBe(
        floor ?? MIN_ALLOWED_INTERVAL_MS,
      );
    }
  });
});

describe("what the client actually ends up spacing its requests by", () => {
  // Building a client sends nothing. These two publish the spacing in force,
  // which closes the loop between what the registry hands over and what the
  // site is read at.
  it("reports the pace the site asked for rather than the shared setting", () => {
    expect(
      new PequerecetasClient({ config: pacedConfig(atTheFloor, "pequerecetas") }).currentIntervalMs,
    ).toBe(ASKS_FOR_MORE.pequerecetas);
    expect(
      new SupertoinetteClient({
        config: pacedConfig(atTheFloor, "supertoinette"),
        logger: createLogger("silent"),
      }).currentIntervalMs,
    ).toBe(ASKS_FOR_MORE.supertoinette);
  });
});
