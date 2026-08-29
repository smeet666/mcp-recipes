/**
 * The registry, and the line that keeps the unit suite off the network.
 *
 * A reader may be supplied for each source, and one supplied for none is built
 * as the reader that talks to its site. So a source registered without a
 * stand-in here would not fail a test: it would quietly fetch a page. The first
 * test below is what turns that into a failure, for whatever is registered next.
 */

import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { PROFILES, buildSources, selectSources } from "../../src/sources/registry.js";
import { fakeReaders, silentLogger } from "./support.js";

const registered = buildSources(loadConfig({}), fakeReaders(), silentLogger);
const ids = registered.map((source) => source.id);

describe("every source has a stand-in", () => {
  it("builds no source this suite cannot answer for", () => {
    const alphabetical = (a: string, b: string) => a.localeCompare(b);
    expect(ids.toSorted(alphabetical)).toEqual(Object.keys(fakeReaders()).toSorted(alphabetical));
  });

  it("names each stand-in after the source it stands in for", () => {
    for (const id of Object.keys(fakeReaders())) {
      expect(ids).toContain(id);
    }
  });
});

describe("what the registry holds", () => {
  it("reads the five sources, in its own order", () => {
    expect(ids).toEqual(["marmiton", "cookbook", "ptitchef", "goodfood", "supertoinette"]);
  });

  it("publishes a profile for each, in that same order", () => {
    expect(PROFILES.map((profile) => profile.id)).toEqual(ids);
  });

  it("gives each source a name, a home and a language of its own", () => {
    for (const source of registered) {
      expect(source.name).not.toBe("");
      expect(source.homeUrl).toMatch(/^https:\/\//);
      expect(["fr", "en"]).toContain(source.language);
      expect(source.attribution).toContain(source.name);
    }
  });

  it("mints an identifier no other source claims for itself", () => {
    for (const source of registered) {
      expect(source.claims(`${source.id}`)).toBeNull();
    }
  });
});

describe("choosing sources", () => {
  it("asks them all when none is named", () => {
    expect(selectSources(registered, undefined)).toHaveLength(5);
  });

  it("accepts each id the registry publishes", () => {
    for (const id of ids) {
      expect(selectSources(registered, [id]).map((source) => source.id)).toEqual([id]);
    }
  });

  it("keeps the registry's order rather than the caller's", () => {
    const chosen = selectSources(registered, ["supertoinette", "marmiton"]);

    expect(chosen.map((source) => source.id)).toEqual(["marmiton", "supertoinette"]);
  });

  it("refuses a name it does not read, and says what it does read", () => {
    expect(() => selectSources(registered, ["ptit-chef"])).toThrow(/ptit-chef/);

    try {
      selectSources(registered, ["ptit-chef"]);
    } catch (error) {
      const hint = (error as { details?: { hint?: string } }).details?.hint ?? "";
      for (const id of ids) {
        expect(hint).toContain(id);
      }
    }
  });

  it("refuses an empty choice rather than answering from nothing", () => {
    expect(() => selectSources(registered, [])).toThrow(/at least one source/);
  });
});
