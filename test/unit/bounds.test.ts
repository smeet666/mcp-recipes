/**
 * The bound every source is read under.
 *
 * A page that arrives quickly and large is never abandoned by a deadline, and
 * it lands in memory in one piece before anything looks at it. Each reader
 * takes the size it will hold, and a source left out of that is a source this
 * server reads without one.
 */

import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { PROFILES, buildSources, pacedConfig } from "../../src/sources/registry.js";
import { silentLogger } from "./support.js";

describe("the size a page is read under", () => {
  it("is handed to every source, and not to some of them", () => {
    const config = loadConfig({});
    const held = PROFILES.map((profile) => ({
      source: profile.id,
      bound: (pacedConfig(config, profile.id) as { maxBodyBytes?: number }).maxBodyBytes,
    }));

    for (const one of held) {
      expect(one.bound, `${one.source} is read with no bound on the page it holds`).toBeGreaterThan(
        0,
      );
    }
  });

  it("is one number, so a caller reasons about one", () => {
    const config = loadConfig({});
    const bounds = new Set(
      PROFILES.map(
        (profile) => (pacedConfig(config, profile.id) as { maxBodyBytes?: number }).maxBodyBytes,
      ),
    );

    expect(bounds.size, "six sources read under six different bounds is six answers").toBe(1);
  });

  it("leaves every source buildable", () => {
    const sources = buildSources(loadConfig({}), {}, silentLogger);

    expect(sources).toHaveLength(PROFILES.length);
  });
});
