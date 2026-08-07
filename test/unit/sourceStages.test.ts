/**
 * Which moment of a source's answer went wrong, and what a row is worth.
 *
 * A comparison reads each source in two moments: it searches, then it reads the
 * row it chose. A search that never answered and a search that answered before
 * the read failed are two different statements about the world, and a report
 * naming only one of them tells a reader something that did not happen.
 *
 * The second half is about rows a search does return. A site matching on the
 * opening letters answers "chameau farci" with a chapeau and three châteaux,
 * and an answer showing them without a word about it hands a reader a cake for
 * a camel.
 */

import { describe, expect, it } from "vitest";
import { runCompareRecipes } from "../../src/tools/compareRecipes.js";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import { FakeSourceError, compareArgs, fakeClient, marmitonRows, payloadOf } from "./support.js";

interface Report {
  source: string;
  status: string;
  read: { status: string; error: { code: string; message: string } | null } | null;
}

interface ComparePayload {
  per_source: Report[];
  notes: string[];
}

const reportFor = (payload: ComparePayload, source: string) =>
  payload.per_source.find((report) => report.source === source)!;

describe("a search that never answered", () => {
  it("names the search as the moment that failed, and reads no row", async () => {
    const payload = payloadOf<ComparePayload>(
      await runCompareRecipes(
        fakeClient({ marmiton: { fail: new FakeSourceError("network_error", "No route.") } }),
        compareArgs({ dish: "crêpes" }),
      ),
    );
    const marmiton = reportFor(payload, "marmiton");

    expect(marmiton.status).toBe("failed");
    expect(marmiton.read, "no row was offered, so none was read").toBeNull();
    expect(payload.notes.join(" ")).toMatch(/search did not answer/i);
  });
});

describe("a search that answered before the read failed", () => {
  it("reports the search as answered and the read as failed", async () => {
    const payload = payloadOf<ComparePayload>(
      await runCompareRecipes(
        fakeClient({
          marmiton: { failRecipe: new FakeSourceError("not_found", "No recipe at that address.") },
        }),
        compareArgs({ dish: "crêpes" }),
      ),
    );
    const marmiton = reportFor(payload, "marmiton");

    expect(marmiton.status).toBe("answered");
    expect(marmiton.read?.status).toBe("failed");
    expect(marmiton.read?.error?.code).toBe("not_found");
  });

  it("never says the search did not answer when it did", async () => {
    const payload = payloadOf<ComparePayload>(
      await runCompareRecipes(
        fakeClient({
          marmiton: { failRecipe: new FakeSourceError("not_found", "No recipe at that address.") },
        }),
        compareArgs({ dish: "crêpes" }),
      ),
    );

    expect(payload.notes.join(" ")).not.toMatch(/search did not answer/i);
    expect(payload.notes.join(" ")).toMatch(/could not be read/i);
  });
});

describe("a source whose row was read", () => {
  it("says the read succeeded", async () => {
    const payload = payloadOf<ComparePayload>(
      await runCompareRecipes(fakeClient(), compareArgs({ dish: "crêpes" })),
    );

    expect(reportFor(payload, "marmiton").read?.status).toBe("read");
    expect(reportFor(payload, "marmiton").read?.error).toBeNull();
  });
});

describe("rows sharing no word with the query", () => {
  it("says when no title carries a word of the query", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchRecipes(
        fakeClient({
          marmiton: {
            rows: marmitonRows.map((row, index) => ({
              ...row,
              title: ["Le chapeau de Sorcière", "Gâteau château de princesse"][index]!,
            })),
          },
          cookbook: { rows: [] },
        }),
        { query: "chameau farci", limit_per_source: 5 },
      ),
    );

    expect(payload.notes.join(" ")).toMatch(/No title here carries a word/i);
  });

  it("stays silent when a title carries a word of the query", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchRecipes(fakeClient(), { query: "crêpes", limit_per_source: 5 }),
    );

    expect(payload.notes.join(" ")).not.toMatch(/No title here carries a word/i);
  });
});

describe("a search Marmiton answers with nothing", () => {
  it("counts as an answer with no rows, rather than a source that failed", async () => {
    const payload = payloadOf<{ per_source: Report[]; notes: string[] }>(
      await runSearchRecipes(
        fakeClient({
          marmiton: {
            fail: new FakeSourceError("not_found", "Marmiton has no recipe at that address."),
          },
        }),
        { query: "stuffed turkey", limit_per_source: 5 },
      ),
    );
    const marmiton = payload.per_source.find((report) => report.source === "marmiton")!;

    expect(marmiton.status).toBe("answered");
    expect(payload.notes.join(" ")).toMatch(/Marmiton answered and offered no row/i);
  });

  it("still reports a source that could not be reached as failed", async () => {
    const payload = payloadOf<{ per_source: Report[] }>(
      await runSearchRecipes(
        fakeClient({ marmiton: { fail: new FakeSourceError("timeout", "Too slow.") } }),
        { query: "crêpes", limit_per_source: 5 },
      ),
    );

    expect(payload.per_source.find((report) => report.source === "marmiton")!.status).toBe(
      "failed",
    );
  });
});
