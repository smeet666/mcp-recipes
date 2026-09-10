/**
 * What the launch guide tells a directory, held against the sources themselves.
 *
 * That text is submitted to directories and read by people choosing whether to
 * install the server, and nothing in the repository makes it follow a source
 * being added. A description naming two kitchens where six answer sends a
 * reader to a server they will take for a different one.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROFILES } from "../../src/sources/registry.js";

const guide = readFileSync(join(import.meta.dirname, "..", "..", "LAUNCHGUIDE.md"), "utf8");
/**
 * The Description section alone.
 *
 * A source's name appears again under Features and Tags, so a cut that overran
 * the section would pass on a description that had stopped naming it.
 */
const opens = guide.indexOf("## Description");
const closes = guide.indexOf("\n## ", opens + 1);
const description = guide.slice(opens, closes === -1 ? guide.length : closes);

describe("the description a directory publishes", () => {
  it("names every source the server reads", () => {
    for (const profile of PROFILES) {
      expect(description, `${profile.name} answers and the description omits it`).toContain(
        profile.name,
      );
    }
  });

  it("counts the sources the way the registry does", () => {
    expect(PROFILES.length, "a source was added without the description following").toBe(6);
  });
});
