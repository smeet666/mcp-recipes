# Contributing

Thanks for looking. This is a small, single-maintainer project, and everything
below is meant to save you from writing something that then has to be rewritten.

## Where to say something

Open an issue: <https://github.com/smeet666/mcp-recipes/issues>

That is the right place for a bug, a question, an idea, or "this answer looks
wrong to me". The issue tracker is the only channel; anything posted on the npm page goes
unread.

## Pull requests are welcome, but talk to me first

Please open an issue before you write the code, even when you are sure of the
fix. Not to gate you: to agree on what the right answer actually is. Most of the
decisions in this repository are about what a model should be told, and two
reasonable people land on different answers. A short exchange up front is cheaper
for you than a rewrite after review.

The exception is the obviously mechanical: a typo, a dead link, a wrong version
in the documentation. Send those straight as a pull request.

## What a good report contains

The tool you called, the arguments you passed, and what came back. A single
copy-paste of the result is worth several paragraphs of description.

If the answer was wrong and not merely missing, say what you expected and why.
A link to the page on the source itself is usually the shortest proof.

If the server returned an error code, include it. `not_found`, `rate_limited`,
`parse_failure`, `invalid_input`, `timeout` and `network_error` mean quite
different things, and the first question is always which one you saw.

For a scaling report, the whole line matters. "3 eggs at a factor of 4.1667" is
answerable; "the eggs came out wrong" is not. Say what the line said, what factor
you asked for, what came back, and what a cook would have written instead.

## What this server will and will not do

It reads public recipe sites and returns what it reads. It writes nothing
back, holds no account, and needs no API key.

Five rules shape most of the code, and a change that breaks one of them will be
turned down however useful it looks:

- **A failure is never reported as an empty result.** A site that could not be
  reached is named, with the reason. Silence about a failure becomes "there is
  none" in the mouth of a model, which is a false statement about the world.
- **Nothing is invented across sources.** No total is summed, no rating is
  compared, and no ranking is computed on a field only some rows can carry.
- **No quantity is converted between measuring systems.** A line keeps the units
  its site published.
- **A scaled quantity is something a cook can act on**, and the line says which
  of the three things happened to it: exact, rounded, or nothing to multiply.
- **The server paces itself.** The minimum interval between two requests to one
  source has a floor that configuration cannot go below, whether the setting
  arrives from the environment or from a configuration object handed to the
  published client.

## Running it locally

```bash
npm install
npm run typecheck
npm test
npm run build
```

The unit suite runs against stand-in sources and touches no network. It is
deterministic on purpose: time is pinned to a fixed epoch, and every assertion
is exact. A test that passes only on a fast machine is rewritten or deleted.

The live suite is opt-in and makes one request per route:

```bash
RECIPES_LIVE=1 npm run test:live
```

Run it when you have touched anything that reads a source. Leave it alone
otherwise: the sources serve everyone free of charge.

To drive the server by hand:

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

## Where the code lives

```
src/index.ts        the executable, stdio transport
src/server.ts       tool registration and the guidance a model reads
src/tools/*.ts      arguments, rendering, notes        ← imports the MCP SDK
──────────────────────────────────────────────────────  the seam
src/sources/*.ts    asking the sources and merging them ← never imports the SDK
src/recipe/*.ts     reading and scaling quantities     ← pure, no I/O at all
```

Anything the upper layer knows that the lower layer does not is a rendering
decision. Anything the lower layer knows that the upper does not is a fact about
a source.

Adding a source is writing an adapter and registering it in
`src/sources/registry.ts`. No tool, no merge and no error path has a branch per
source, so a change that adds one anywhere else is in the wrong place.

The reading of each site is a published library this project depends on rather
than code it carries, so a fix to how a page is parsed belongs in that library
and reaches here as a version bump. Everything else, including the whole of the
scaling, lives in this repository.

## Adding to the scaler

The scaler is the part most likely to be wrong in a way nobody notices, so it
gets the strictest treatment.

- Add the failing line as a test first, with the output a cook would have
  written, and say in the test name which rule the line is about.
- A new measure goes in `src/recipe/units.ts` with its kind: `measured` scales
  continuously, `portioned` scales to sensible fractions, `approximate` has its
  count multiplied while the size of one stays the cook's.
- A measure divides as far as half of what it holds is still a quantity a
  kitchen can take out, which is almost everything. What does not divide is
  decided from the item's own name, and that list holds an egg, a yolk and a
  white, because half of one means beating it and weighing the result.
- A measure whose plural or spelling the ordinary rules would get wrong is worth
  a table entry. One the rules handle is not: French reads a container from the
  partitive that follows it, and English reads one from the `-ful` suffix, so
  both languages already understand a measure nobody thought to list.
- Nothing in the scaler reads a clock, a network or a global. Given the same line
  and the same factor it returns the same answer, and the tests hold it to that.

## Writing

Comments and documentation are read by people who have never seen this project
and will never see its history. Write what the code does and why. Do not write
what it used to do, how it compares to another version, or what was not done.
