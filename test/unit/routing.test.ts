/**
 * Routing an identifier, and refusing one nothing can be done with.
 *
 * An identifier sent to the wrong source comes back as another dish of another
 * name, answered with the same confidence as the right one. That is the failure
 * this layer exists to prevent, so every refusal here says what it read and
 * what it would take instead.
 */

import { describe, expect, it } from "vitest";
import { resolveId, sourceOf } from "../../src/sources/ids.js";
import { fakeSources } from "./support.js";

const sources = fakeSources();

describe("which source an identifier names", () => {
  it("reads the prefix, whatever its case", () => {
    expect(sourceOf("marmiton:1", sources)).toBe("marmiton");
    expect(sourceOf("MARMITON:1", sources)).toBe("marmiton");
  });

  it("names none where the prefix is not a source", () => {
    expect(sourceOf("nowhere:1", sources)).toBeNull();
    expect(sourceOf("", sources)).toBeNull();
  });
});

describe("a refusal says what this server would take", () => {
  it("offers the shape an identifier has, built from the registry", () => {
    try {
      resolveId("!!", sources);
      throw new Error("a shape no source mints should not resolve");
    } catch (error) {
      expect((error as { details: { hint?: string } }).details.hint ?? "").toMatch(/marmiton:/);
    }
  });

  it("offers a shape even where the registry is empty", () => {
    try {
      resolveId("!!", []);
      throw new Error("an empty registry should not resolve anything");
    } catch (error) {
      expect((error as { details: { hint?: string } }).details.hint ?? "").toMatch(/<source>:<id>/);
    }
  });

  it("refuses an empty identifier before looking anywhere", () => {
    expect(() => resolveId("   ", sources)).toThrow(/identifier/i);
  });

  it("refuses a prefix that names no source, and says so", () => {
    expect(() => resolveId("nowhere:1", sources)).toThrow(/nowhere/);
  });
});

describe("a shape more than one source would take", () => {
  it("names all of them in one sentence, and resolves none", () => {
    // Marmiton and Supertoinette both address a recipe by a bare number.
    expect(() => resolveId("44078", sources)).toThrow(/Marmiton and Supertoinette/);
  });

  it("names one alone without a list where only one would take it", () => {
    const one = sources.filter((source) => source.id === "marmiton");
    const read = resolveId("44078", one);

    expect(read.source.id).toBe("marmiton");
    expect(read.inferred).not.toBeNull();
  });
});
