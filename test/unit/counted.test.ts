/**
 * What an answer counts, and what it calls an absence.
 *
 * A number attributed to a source is a number that source published, and an
 * absence is a source that answered and held nothing. A read that failed and a
 * row nobody could parse are neither, and folding them into either one hands a
 * reader a fact nobody established.
 */

import { describe, expect, it } from "vitest";
import { runCompareRecipes } from "../../src/tools/compareRecipes.js";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import {
  FakeSourceError,
  compareArgs,
  fakeClient,
  onlyFrom,
  payloadOf,
  searchArgs,
  textOf,
} from "./support.js";

describe("a source whose rows could not be read", () => {
  it("is not counted among those that answered and hold nothing", async () => {
    const text = textOf(
      await runSearchRecipes(
        fakeClient({
          ...onlyFrom("marmiton"),
          marmiton: { rows: [{ id: "", title: "", url: "", imageUrl: null }] },
        }),
        searchArgs({ query: "crepes" }),
      ),
    );

    expect(
      text,
      "a row this server could not read is not a corpus that holds nothing",
    ).not.toContain("Every source answered and none holds anything");
  });
});

describe("a comparison where every source failed", () => {
  it("says the sources failed rather than that none holds the dish", async () => {
    const boom = new FakeSourceError("network_error", "the site could not be reached");
    const text = textOf(
      await runCompareRecipes(fakeClient({ ...onlyFrom("marmiton"), marmiton: { fail: boom } }), {
        ...compareArgs({ dish: "crepes" }),
        sources: ["marmiton"],
      }),
    );

    expect(
      text,
      "no source answered, so nothing here says whether such a recipe exists",
    ).not.toMatch(/No source offered a recipe/);
  });
});

describe("a total this server worked out itself", () => {
  it("is absent where the page carried nothing to work it out from", async () => {
    const payload = payloadOf(
      await runSearchRecipes(
        fakeClient({ ...onlyFrom("marmiton"), marmiton: { rows: [] } }),
        searchArgs({ query: "crepes" }),
      ),
    ) as { per_source: Array<{ source: string; reported_total: number | null }> };

    const marmiton = payload.per_source.find((report) => report.source === "marmiton");
    expect(
      marmiton?.reported_total,
      "Marmiton reported nothing, so it did not report zero",
    ).toBeNull();
  });
});
