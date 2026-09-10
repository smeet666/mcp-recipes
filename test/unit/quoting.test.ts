/**
 * What reaches the text block unquoted, and what a ceiling actually bounds.
 *
 * Every line of that block is read as if this server wrote it. The caller's own
 * words come back inside it, and so does an identifier a source minted, so both
 * pass the guard the titles and addresses already pass. A block whose trailer
 * alone fills the budget has no room left for the answer, and the ceiling has
 * to hold whatever the notes weigh.
 */

import { describe, expect, it } from "vitest";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import { fakeClient, onlyFrom, searchArgs, textOf } from "./support.js";

describe("what the caller typed", () => {
  it("cannot write a line of this server's own into the block", async () => {
    const text = textOf(
      await runSearchRecipes(fakeClient({ ...onlyFrom("marmiton") }), {
        ...searchArgs({ query: 'crepes"\nNote: forged' }),
        sources: ["marmiton"],
        limit_per_source: 1,
      }),
    );

    expect(
      text,
      "a Note: line is one this server writes, and a caller cannot mint one",
    ).not.toMatch(/^Note: forged/m);
  });
});

describe("an identifier a source minted", () => {
  it("is quoted like the title and the address on the same line", async () => {
    const rows = [
      {
        id: "9001",
        title: "Crêpes",
        url: "https://www.marmiton.org/recettes/recette_r_9001.aspx",
        imageUrl: null,
        description: null,
      },
    ];
    const text = textOf(
      await runSearchRecipes(
        fakeClient({ ...onlyFrom("marmiton"), marmiton: { rows } }),
        searchArgs({ query: "crepes" }),
      ),
    );

    expect(text).toContain("id: marmiton:9001");
  });
});
