/** Schemas, error mapping and rendering shared by the tools. */

import { z } from "zod";
import { RecipesError } from "../errors.js";
import type { ScaledIngredient } from "../recipe/scale.js";
import type { RecipeRow, SourceReport } from "../types.js";

/**
 * The text block is what many clients render, and some render nothing else, so
 * it has to answer on its own. This ceiling is what keeps a recipe with forty
 * ingredients from arriving as a wall of text.
 */
export const MAX_TEXT_CHARS = 2200;

export interface ToolResult {
  // The SDK's result type carries an index signature for protocol extensions.
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** One search row, carrying what it takes to pick a recipe out of a list. */
export const rowSchema = z.object({
  id: z
    .string()
    .describe("Pass this to get_recipe. It names its source, so nothing has to be guessed."),
  source: z.string().describe("Which source published this row."),
  source_name: z.string(),
  title: z.string(),
  url: z.string().describe("The recipe's own page. Show this when citing it."),
  image_url: z.string().nullable(),
  excerpt: z
    .string()
    .nullable()
    .describe("The gloss or matching passage the source offered, when it offered one."),
});

/**
 * What one source answered, or why it did not.
 *
 * Present for every source asked, including the ones that failed, because an
 * answer that quietly drops a source reads as a complete answer that found
 * less.
 */
export const reportSchema = z.object({
  source: z.string(),
  name: z.string(),
  status: z.enum(["answered", "failed"]).describe("Whether this source replied at all."),
  count: z.number().int().describe("Rows this source contributed to the answer."),
  reported_total: z
    .number()
    .int()
    .nullable()
    .describe("What the source said it saw. Null when it states no number at all."),
  reported_total_means: z
    .string()
    .nullable()
    .describe(
      "What 'reported_total' counts on this source. Counts are never summed across sources.",
    ),
  skipped: z
    .number()
    .int()
    .describe("Rows this source sent in a shape the server could not read, and left out."),
  cached: z.boolean().describe("Served from this server's short-lived in-memory cache."),
  preferred_by_name: z
    .boolean()
    .describe(
      "Whether this source's rows were arranged so the ones whose title names the dish come first. An order over one source's own rows, never a score against another source.",
    ),
  wordings: z
    .array(
      z.object({
        query: z.string().describe("What was sent to this source, or would have been."),
        derivation: z.string().describe("How this wording was derived from the question."),
        ran: z.boolean(),
        count: z
          .number()
          .int()
          .nullable()
          .describe("Rows this wording returned. Null when it did not run."),
        added: z
          .number()
          .int()
          .nullable()
          .describe("Rows it returned that no earlier wording had."),
        not_run_because: z.string().nullable().describe("Why it was held back. Null when it ran."),
        error: z
          .object({ code: z.string(), message: z.string(), hint: z.string().optional() })
          .nullable(),
      }),
    )
    .describe(
      "Every wording this source was sent or held back from, in the order tried. A question written as a sentence is also sent in wordings derived from it, because these indexes answer the words they are handed. Counts here belong to one wording each and are never added.",
    ),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      hint: z.string().optional(),
    })
    .nullable()
    .describe("Why this source did not answer. Null when it did."),
  read: z
    .object({
      status: z.enum(["read", "failed"]),
      error: z
        .object({ code: z.string(), message: z.string(), hint: z.string().optional() })
        .nullable(),
    })
    .nullable()
    .describe(
      "What became of the row this source offered, once it was opened. Null when no row was opened, which is what a search that did not answer and a search holding nothing both come to. A search and a read are two moments, and this is the second one.",
    ),
});

/** One ingredient line, scaled, in the shape every source is read into. */
export const ingredientSchema = z.object({
  text: z.string().describe("The line as it now reads."),
  original: z.string().describe("The line as published."),
  scaling: z
    .enum(["scaled", "rounded", "unscaled"])
    .describe(
      "'scaled' means the arithmetic landed on the exact product, 'rounded' that something had to move for the line to stay usable or that the line carries a second quantity whose match is the page's claim, 'unscaled' that there is nothing to multiply.",
    ),
  amount: z
    .number()
    .nullable()
    .describe("The scaled quantity, in 'unit'. Read the two together, never the number alone."),
  amount_max: z.number().nullable().describe("Upper bound when the line gives a range."),
  unit: z
    .string()
    .nullable()
    .describe("The unit 'amount' is in, which may differ from the page's."),
  language: z.enum(["fr", "en"]).describe("The language the line was read and rewritten in."),
  note: z.string().optional().describe("What happened to this line, when anything did."),
});

export function toIngredientPayload(entry: ScaledIngredient): z.infer<typeof ingredientSchema> {
  return {
    text: entry.text,
    original: entry.original,
    scaling: entry.scaling,
    amount: entry.amount,
    amount_max: entry.amountMax,
    unit: entry.unit,
    language: entry.language,
    ...(entry.note ? { note: entry.note } : {}),
  };
}

export function toRowPayload(row: RecipeRow): z.infer<typeof rowSchema> {
  return {
    id: row.id,
    source: row.source,
    source_name: row.sourceName,
    title: row.title,
    url: row.url,
    image_url: row.imageUrl,
    // An excerpt is a source's own prose, and a long one crowds out the rows it
    // was meant to help choose between.
    excerpt: row.excerpt === null ? null : truncate(row.excerpt, MAX_EXCERPT_CHARS),
  };
}

/** How much of a source's own prose a search row carries. */
const MAX_EXCERPT_CHARS = 200;

export function toReportPayload(report: SourceReport): z.infer<typeof reportSchema> {
  return {
    source: report.source,
    name: report.name,
    status: report.status,
    count: report.count,
    reported_total: report.reportedTotal,
    reported_total_means: report.reportedTotalMeans,
    skipped: report.skipped,
    cached: report.cached,
    preferred_by_name: report.preferredByName,
    wordings: report.wordings.map((attempt) => ({
      query: attempt.query,
      derivation: attempt.derivation,
      ran: attempt.ran,
      count: attempt.count,
      added: attempt.added,
      not_run_because: attempt.notRunBecause,
      error: attempt.error,
    })),
    error: report.error ?? null,
    // A search alone opens nothing, so only a tool that reads a row fills this
    // in, through `withRead`.
    read: null,
  };
}

/** What became of the row a source offered, added to that source's report. */
export function withRead(
  payload: z.infer<typeof reportSchema>,
  read: z.infer<typeof reportSchema>["read"],
): z.infer<typeof reportSchema> {
  return { ...payload, read };
}

/**
 * A sentence qualifying an answer.
 *
 * The text block has room for a limited number of them, so something gives when
 * an answer carries more, and a note the answer would mislead without says so
 * for itself. Whoever writes a note knows what it is for; deciding it later
 * from the words the note happens to use makes every rewording of a warning a
 * warning that can be dropped, and the notes most often reworded are the ones
 * written to correct a specific misreading.
 */
export type Note = string | EssentialNote;

export interface EssentialNote {
  text: string;
  /** The answer misleads without this sentence. */
  essential: true;
}

/** Mark a note the answer cannot be read safely without. */
export function mustKeep(text: string): EssentialNote {
  return { text, essential: true };
}

export function noteText(note: Note): string {
  return typeof note === "string" ? note : note.text;
}

export function noteTexts(notes: readonly Note[]): string[] {
  return notes.map(noteText);
}

/** Name the recipe a note is about, keeping what the note is worth. */
export function labelNote(label: string, note: Note): Note {
  if (typeof note === "string") {
    const plain: string = note;
    return `${label}: ${plain}`;
  }
  const said: string = note.text;
  return mustKeep(`${label}: ${said}`);
}

/**
 * Turn the per-source reports into sentences a reader can act on.
 *
 * A failed source is named with the reason, so an answer holding part of what
 * was asked for never reads as the whole of what exists.
 */
export function reportNotes(reports: SourceReport[]): Note[] {
  const notes: Note[] = [];

  const answered = reports.filter((report) => report.status === "answered");
  const failed = reports.filter((report) => report.status === "failed");

  for (const report of failed) {
    // What the rest of the answer holds depends on whether anything else
    // answered. Promising a caller that another source made up the difference
    // when none did is the failure this whole shape exists to prevent.
    const consolation =
      answered.length > 0
        ? `This answer holds what the other sources found, and says nothing about what ${report.name} holds.`
        : "Nothing here is evidence about what it holds.";
    notes.push(
      mustKeep(
        `${report.name} did not answer (${report.error?.code}): ${report.error?.message} ${consolation}`,
      ),
    );
  }

  for (const report of answered) {
    const sent = report.wordings.filter((attempt) => attempt.ran && attempt.error === null);

    if (report.count === 0) {
      notes.push(
        mustKeep(
          sent.length > 1
            ? `${report.name} answered and offered no row for any of the ${sent.length} wordings it was ` +
                `sent (${sent.map((attempt) => `"${attempt.query}"`).join(", ")}). Each of those is a ` +
                "statement about a wording; together they are the closest this server comes to saying " +
                "the corpus holds nothing. Try a main ingredient, or the dish's name in the language " +
                "that source publishes in."
            : `${report.name} answered and offered no row for this wording. That is a statement about ` +
                "the wording as much as about the corpus: try the dish's name in another language, or a " +
                "main ingredient.",
        ),
      );
    }
    if (sent.length > 1) {
      notes.push(
        `${report.name} was asked ${sent.length} wordings and these rows are their union: ${sent
          .map((attempt) => `"${attempt.query}" (${attempt.count ?? 0})`)
          .join(", ")}. Those counts are per wording and are never added.`,
      );
    }
    if (report.preferredByName) {
      notes.push(
        `${report.name}'s rows are arranged with the ones naming the dish first, so a wording that ` +
          "returned near-misses cannot crowd out what another wording found. That is an order over " +
          "one source's own rows and not a score against any other source.",
      );
    }
    if (report.skipped > 0) {
      notes.push(
        mustKeep(
          `${report.name} sent ${report.skipped} row(s) in a shape this server could not read, and they were left out.`,
        ),
      );
    }
    if (report.reportedTotal !== null && report.reportedTotalMeans !== null) {
      const forWording =
        sent.length > 1 ? ` That number belongs to "${sent[0]?.query}" alone.` : "";
      notes.push(
        `${report.name} reported ${report.reportedTotal}: ${report.reportedTotalMeans}.${forWording}`,
      );
    } else {
      notes.push(
        `${report.name} states no total and offers no second page, so a short list here is not evidence that little exists.`,
      );
    }
  }

  if (answered.some((report) => report.mixesReferencePages && report.count > 0)) {
    const mixing = answered.filter((report) => report.mixesReferencePages && report.count > 0);
    notes.push(
      `${mixing.map((report) => report.name).join(" and ")} files pages about an ingredient beside ` +
        "recipes using it, so a row here can be a page about an ingredient rather than a recipe. " +
        "get_recipe says what it read off the page.",
    );
  }

  if (answered.length > 1) {
    notes.push(
      "Each count above measures something different, and they are never added together into one total.",
    );
  }

  if (reports.some((report) => report.cached)) {
    notes.push("Part of this answer came from this server's short-lived in-memory cache.");
  }

  return notes;
}

/**
 * Words this server writes at the start of one of its own lines.
 *
 * A caller has no way to tell one of these from the same words inside a title,
 * an ingredient or a step written by whoever published it, so a value opening
 * with one is indented before it is rendered. Spacing and case are allowed for,
 * because a forged line only has to look like one of these to a reader.
 */
const SERVER_MARKERS = /^(\s*)(Note|Sources?|Hint|Ingredients|Steps|What differs)(\s*:)/gim;

/**
 * Keep text somebody else wrote out of the shape this server's own lines take.
 *
 * Applied to the foreign value rather than to the assembled block, because the
 * server writes those same words itself: indenting the whole block would indent
 * its own headings and leave the answer looking like quoted text.
 *
 * The structured output still carries the text exactly as it was published;
 * this is the rendered block only.
 */
export function indentMarkerLines(value: string): string {
  return value.replace(SERVER_MARKERS, " $1$2$3");
}

/**
 * Put a value somebody else wrote onto one of this server's own lines.
 *
 * Two things make that safe. A line terminator is turned into a space, because
 * a title or a licence carrying a newline can otherwise close the server's
 * sentence and open a whole section of its own: a forged "Steps:" block, a
 * forged search row with an address of its own, or a forged credit line. And an
 * image is defused, because most clients render this block as markdown and an
 * image tag fetches its address the moment it is drawn.
 *
 * Everything a source or a caller wrote passes through here on its way into the
 * text block, including into the notes and the credit, which are the lines a
 * reader trusts most.
 */
export function quoteForeign(value: string): string {
  return (
    value
      // Every line terminator Unicode recognises, so a value can occupy one line
      // and no more.
      .replace(/[\r\n\u2028\u2029\u0085]+/g, " ")
      // Control characters, which render as nothing and hide what follows them.
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      // An image tag fetches its address on render; escaping the mark leaves the
      // text readable and the request unmade.
      .replace(/!\[/g, "!\\[")
      .replace(/\s{2,}/g, " ")
      .trim()
      // Now that it occupies one line, a value opening on one of the server's
      // own markers is the last way it could pass for a line the server wrote.
      .replace(SERVER_MARKERS, " $1$2$3")
  );
}

/**
 * How much of the block the notes may take.
 *
 * Enough for the sentences that qualify an answer, while leaving the answer
 * they qualify room to be one. Whatever is dropped is still in the structured
 * output, where a caller reading that instead loses nothing.
 */
const NOTE_BUDGET = Math.round(MAX_TEXT_CHARS * 0.55);

export interface OkOptions {
  notes?: readonly Note[];
  /** The line that credits whoever published what the answer holds. */
  credit?: string;
}

/**
 * The notes the block will carry, and the trailer they make with the credit.
 *
 * A long run of notes must not crowd out the answer it qualifies, so the last
 * note the answer reads correctly without goes first and the ones it misleads
 * without are still there when the room runs out. Whatever is dropped stays in
 * the structured output.
 */
function buildTrailer(options: OkOptions): string {
  const kept: Note[] = [];
  const held = new Set<string>();
  for (const note of options.notes ?? []) {
    const text = noteText(note);
    if (held.has(text)) {
      continue;
    }
    held.add(text);
    kept.push(note);
  }

  const length = (): number => kept.map(noteText).join("\n").length;

  while (kept.length > 0 && length() > NOTE_BUDGET) {
    let victim = -1;
    for (let index = kept.length - 1; index >= 0; index -= 1) {
      if (typeof kept[index] === "string") {
        victim = index;
        break;
      }
    }
    // Room runs out with nothing but the sentences the answer misleads without.
    // Dropping one of those buys space by removing the warning the answer most
    // needed, so the body gives up its own room instead.
    if (victim === -1) {
      break;
    }
    kept.splice(victim, 1);
  }

  const credit = options.credit ?? "Source: this server called none.";
  return [...kept.map((note) => `Note: ${noteText(note)}`), credit].join("\n");
}

/**
 * Build a result whose text block ends with its notes and its credit.
 *
 * The body is cut to fit around the trailer rather than the whole block being
 * cut afterwards. Appending the credit and then truncating loses exactly the
 * credit, which is the one line that must survive.
 *
 * Notes qualify an answer: that a source failed, that a quantity was rounded,
 * that a count means one thing here and another there. A client that shows only
 * the text would otherwise present an unqualified answer, so they travel with
 * the credit.
 */
export function ok(
  structured: Record<string, unknown>,
  body: string,
  options: OkOptions = {},
): ToolResult {
  const trailer = buildTrailer(options);
  const cut = "\n\n[shortened; the full result is in the structured output]";
  const room = MAX_TEXT_CHARS - `\n\n${trailer}`.length;
  const text =
    body.length <= room
      ? `${body}\n\n${trailer}`
      : `${truncate(body, Math.max(0, room - cut.length))}${cut}\n\n${trailer}`;

  return { content: [{ type: "text", text }], structuredContent: structured };
}

/**
 * Errors carry no structured payload: the SDK checks it against the tool's
 * declared output schema, and a failure does not fit that shape.
 */
export function toToolError(error: unknown): ToolResult {
  const known =
    error instanceof RecipesError
      ? error
      : new RecipesError("network_error", error instanceof Error ? error.message : String(error));

  const lines = [`[${known.code}] ${quoteForeign(known.message)}`];
  if (known.details.hint) {
    lines.push(`Hint: ${quoteForeign(known.details.hint)}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

/**
 * How much room a body has once its notes and its credit are set aside.
 *
 * A tool rendering several things at once shares this out between them, so each
 * gets an opening rather than the first one filling the block and the rest
 * being cut away.
 */
export function roomForBody(options: OkOptions = {}): number {
  return Math.max(200, MAX_TEXT_CHARS - buildTrailer(options).length - 60);
}

/**
 * The opening of a list, and how much of it is not here.
 *
 * The sentences qualifying an answer keep their room, which leaves the result
 * lines as the thing that gives way when a block runs short. Giving way to
 * nothing at all, in silence, is what turns a hundred ingredients into a recipe
 * that appears to need none, so a few lines are kept whatever the room allows
 * and the caller is told how many are missing.
 */
export interface FittedLines {
  lines: string[];
  hidden: number;
}

/** Lines that were always going to be shown, however tight the block is. */
const ALWAYS_SHOWN = 3;

export function fitLines(lines: readonly string[], room: number): FittedLines {
  const kept: string[] = [];
  let used = 0;

  for (const line of lines) {
    if (kept.length >= ALWAYS_SHOWN && used + line.length > room) {
      break;
    }
    kept.push(line);
    used += line.length + 1;
  }

  return { lines: kept, hidden: lines.length - kept.length };
}

/** What a block says about the rows it had no room for. */
export function omittedLinesLine(shown: number, total: number, what: string): string {
  return `… ${shown} of ${total} ${what} shown here; all ${total} are in the structured output`;
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** A compact listing, carrying what it takes to pick one recipe out of many. */
export function renderRows(rows: z.infer<typeof rowSchema>[]): string {
  return rows
    .map((row, index) => {
      const head = `${index + 1}. ${quoteForeign(row.title)} · ${quoteForeign(row.source_name)} · id: ${row.id}`;
      // The address goes on its own line: a client that renders only text has
      // nothing else to cite from, and a model with an identifier and no link
      // will build one.
      return `${head}\n   ${quoteForeign(row.url)}`;
    })
    .join("\n");
}

/**
 * The credit line, naming the sources that actually contributed to this answer.
 *
 * A source that failed, or that was never asked, has published nothing here and
 * crediting it would say it had.
 */
export function creditLine(contributors: Array<{ attribution: string; url?: string }>): string {
  if (contributors.length === 0) {
    return "No source contributed to this answer.";
  }
  const names = contributors.map((entry) =>
    entry.url ? `${entry.attribution} — ${quoteForeign(entry.url)}` : entry.attribution,
  );
  return names.join("\n");
}
