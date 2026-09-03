/**
 * What a comparison says when there is little or nothing to compare.
 *
 * Three ways a source is missing, and they are three statements about the
 * world. A version offered and unreadable says the dish is out there; a search
 * that never answered says nothing at all; and a source that answered with
 * nothing close enough says something about the corpus. Reading any of them as
 * another turns a bad minute into a claim.
 */

import { describe, expect, it } from "vitest";
import { runCompareRecipes } from "../../src/tools/compareRecipes.js";
import {
  FakeSourceError,
  compareArgs,
  fakeClient,
  marmitonRecipe,
  onlyFrom,
  payloadOf,
  textOf,
} from "./support.js";

const twoSources = { sources: ["marmiton", "cookbook"] as string[] };

describe("nothing to compare", () => {
  it("says no source offered the dish where none did", async () => {
    const payload = payloadOf<{ versions: unknown[] }>(
      await runCompareRecipes(
        fakeClient(onlyFrom()),
        compareArgs({ dish: "something nobody publishes" }),
      ),
    );
    const text = textOf(
      await runCompareRecipes(
        fakeClient(onlyFrom()),
        compareArgs({ dish: "something nobody publishes", ...twoSources }),
      ),
    );

    expect(payload.versions).toEqual([]);
    expect(text).toMatch(/No source offered a recipe/);
  });

  it("says the versions offered could not be read where that is what happened", async () => {
    const unreadable = new FakeSourceError("parse_failure", "no ingredient node");
    const text = textOf(
      await runCompareRecipes(
        fakeClient({
          ...onlyFrom("marmiton", "cookbook"),
          marmiton: { failRecipe: unreadable },
          cookbook: { failRecipe: unreadable },
        }),
        compareArgs({ dish: "crepes", ...twoSources }),
      ),
    );

    // The dish is out there; only the reading failed.
    expect(text).toMatch(/could not be read, so nothing was compared/);
  });
});

describe("what the versions differ on", () => {
  it("states a yield only where the versions state different ones", async () => {
    const payload = payloadOf<{ differences: string[] }>(
      await runCompareRecipes(
        fakeClient(onlyFrom("marmiton", "cookbook")),
        compareArgs({ dish: "crepes", ...twoSources }),
      ),
    );

    expect(payload.differences.some((line) => /yields/.test(line))).toBe(true);
  });

  it("names a version stating no yield at all, in words rather than as a blank", async () => {
    const yieldless = {
      ...marmitonRecipe,
      recipeYield: { count: null, unit: null, text: "" },
    };
    const payload = payloadOf<{ differences: string[] }>(
      await runCompareRecipes(
        fakeClient({ ...onlyFrom("marmiton", "cookbook"), marmiton: { recipe: yieldless } }),
        compareArgs({ dish: "crepes", ...twoSources }),
      ),
    );

    expect(payload.differences.some((line) => /no stated amount/.test(line))).toBe(true);
  });

  it("says which versions carry no time, so a reader knows there is nothing there", async () => {
    const untimed = {
      ...marmitonRecipe,
      prepMinutes: null,
      cookMinutes: null,
      totalMinutes: null,
    };
    const payload = payloadOf<{ differences: string[] }>(
      await runCompareRecipes(
        fakeClient({ ...onlyFrom("marmiton", "cookbook"), marmiton: { recipe: untimed } }),
        compareArgs({ dish: "crepes", sections: ["times"], ...twoSources }),
      ),
    );

    expect(payload.differences.some((line) => /no time for this recipe/.test(line))).toBe(true);
  });
});

describe("a source missing for a reason of its own", () => {
  it("says a search did not answer, and claims nothing about the corpus", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runCompareRecipes(
        fakeClient({
          ...onlyFrom("marmiton", "cookbook"),
          marmiton: { fail: new FakeSourceError("timeout", "took too long") },
        }),
        compareArgs({ dish: "crepes", ...twoSources }),
      ),
    );

    expect(payload.notes.some((note) => /Marmiton/.test(note) && /did not answer/.test(note))).toBe(
      true,
    );
  });

  it("says a source offered nothing close enough, which is about the corpus", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runCompareRecipes(
        fakeClient({ ...onlyFrom("cookbook"), marmiton: { rows: [] } }),
        compareArgs({ dish: "crepes", ...twoSources }),
      ),
    );

    expect(
      payload.notes.some((note) => /Marmiton/.test(note) && /nothing close enough/.test(note)),
    ).toBe(true);
  });

  it("reports a read that failed without a code as a network failure", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runCompareRecipes(
        fakeClient({
          ...onlyFrom("marmiton", "cookbook"),
          marmiton: { failRecipe: new Error("something with no code") },
        }),
        compareArgs({ dish: "crepes", ...twoSources }),
      ),
    );

    expect(
      payload.notes.some((note) => /Marmiton/.test(note) && /could not be read/.test(note)),
    ).toBe(true);
  });
});
