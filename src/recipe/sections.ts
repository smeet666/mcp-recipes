/**
 * Reading what a page's own headings announce.
 *
 * A heading is the one statement a page makes about its own layout, and it is
 * the only evidence there is that a part of a recipe was published when nothing
 * was read out of that part. That matters because reading nothing is a fact
 * about this server, and only the page can say whether there was anything to
 * read.
 *
 * Both languages the pages are written in are recognised here, since a heading
 * belongs to a page rather than to the corpus it sits in.
 */

/** The parts of a recipe a page announces with a heading of its own. */
export type PagePart = "ingredients" | "method";

const HEADINGS: Record<PagePart, RegExp> = {
  ingredients: /^\s*(?:ingr[ée]dients?|ingredients?|garniture)\b/i,
  method:
    /^\s*(?:procedure|proc[ée]d[ée]|directions?|instructions?|method|preparation|pr[ée]paration|r[ée]alisation|steps?|[ée]tapes?)\b/i,
};

/**
 * The first heading on the page announcing this part, when the page carries
 * one. Null covers two different things on purpose, and the caller separates
 * them: a page heading nothing of the kind, and a source that does not report
 * a page's headings at all.
 */
export function headingFor(part: PagePart, headings: readonly string[] | null): string | null {
  if (headings === null) {
    return null;
  }
  return headings.find((heading) => HEADINGS[part].test(heading)) ?? null;
}
