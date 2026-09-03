/**
 * What an answer says about rows that do not name the dish.
 *
 * A recipe index answers the words it is handed, and one of these sites answers
 * any wording with something. A row it returned is a candidate rather than a
 * claim, so the answer has to stop short of calling it a recipe for the dish
 * that was asked for, and has to say when a source offered nothing that names
 * the dish at all. Otherwise a question asked in the wrong language comes back
 * as three confident recipes for a dish nobody published.
 */

import { describe, expect, it } from "vitest";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import { fakeClient, onlyFrom, payloadOf, searchArgs, textOf } from "./support.js";

/** Rows a source returns for anything, none of them naming what was asked. */
const offTopic = [
  {
    id: "3001",
    title: "Arroz rojo",
    url: "https://www.marmiton.org/recettes/recette_r_3001.aspx",
    imageUrl: null,
    description: null,
  },
  {
    id: "3002",
    title: "Besugo al horno",
    url: "https://www.marmiton.org/recettes/recette_r_3002.aspx",
    imageUrl: null,
    description: null,
  },
];

describe("rows that do not name the dish", () => {
  it("are not called recipes for it", async () => {
    const text = textOf(
      await runSearchRecipes(
        fakeClient({ ...onlyFrom("marmiton"), marmiton: { rows: offTopic } }),
        searchArgs({ query: "spanish omelette" }),
      ),
    );

    expect(text).not.toMatch(/recipes for "spanish omelette"/);
    expect(text).toMatch(/rows for "spanish omelette"/);
  });

  it("name the source that offered them, where another source did name the dish", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchRecipes(
        fakeClient({ ...onlyFrom("marmiton", "cookbook"), marmiton: { rows: offTopic } }),
        searchArgs({ query: "crepes" }),
      ),
    );

    expect(
      payload.notes.some(
        (note) => /Marmiton/.test(note) && /carries this dish in its title/.test(note),
      ),
    ).toBe(true);
  });

  it("are not named per source where no source named the dish", async () => {
    // The answer already says so once about the whole of it.
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchRecipes(
        fakeClient({ ...onlyFrom("marmiton"), marmiton: { rows: offTopic } }),
        searchArgs({ query: "spanish omelette" }),
      ),
    );

    expect(payload.notes.some((note) => /carries this dish in its title/.test(note))).toBe(false);
    expect(payload.notes.some((note) => /read them as candidates/.test(note))).toBe(true);
  });

  it("come after the rows that do name it, whatever the source's own order", async () => {
    const mixed = [
      ...offTopic,
      {
        id: "3003",
        title: "Tortilla de patatas",
        url: "https://www.marmiton.org/recettes/recette_r_3003.aspx",
        imageUrl: null,
        description: null,
      },
    ];
    const payload = payloadOf<{ results: Array<{ title: string }> }>(
      await runSearchRecipes(
        fakeClient({ ...onlyFrom("marmiton"), marmiton: { rows: mixed } }),
        searchArgs({ query: "tortilla de patatas" }),
      ),
    );

    expect(payload.results[0]?.title).toBe("Tortilla de patatas");
  });

  it("say the order was arranged, whichever wording brought them", async () => {
    const payload = payloadOf<{
      notes: string[];
      per_source: Array<{ preferred_by_name: boolean }>;
    }>(
      await runSearchRecipes(
        fakeClient({ ...onlyFrom("marmiton"), marmiton: { rows: offTopic } }),
        searchArgs({ query: "spanish omelette" }),
      ),
    );

    expect(payload.per_source[0]?.preferred_by_name).toBe(true);
  });
});

describe("rows that do name the dish", () => {
  it("are still called recipes for it", async () => {
    const text = textOf(
      await runSearchRecipes(fakeClient(onlyFrom("marmiton")), searchArgs({ query: "crepes" })),
    );

    expect(text).toMatch(/recipes for "crepes"/);
  });

  it("earn no note about a source offering nothing", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchRecipes(fakeClient(onlyFrom("marmiton")), searchArgs({ query: "crepes" })),
    );

    expect(payload.notes.some((note) => /names the dish/.test(note))).toBe(false);
  });
});
