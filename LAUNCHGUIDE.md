# mcp-recipes

## Tagline

One question, several kitchens: every recipe source answered together.

## Description

An MCP server for recipes. It reads Marmiton in French and the Wikibooks
Cookbook in English, searches them at once for one merged list, reads either
recipe in full, rescales it to any number of people, and puts the same dish side
by side as each tradition writes it.

The scaling is the part worth having. Multiplying every number by a factor
produces "2.4 eggs" and "0.67 pinch of salt" with the same confidence as "267 g
flour", which is arithmetically correct and useless in a kitchen. Here an egg stays whole,
because half of one means beating it and weighing the result; anything that
pours, weighs or cuts halves; a spoonful shrinks into the smaller spoon before
it is rounded; and a pinch keeps whatever size a hand gives it while its count
is multiplied. One list can hold French lines and English lines at
once, and each comes back written the way its own language writes numbers,
plurals and measures.

The server is careful about what it refuses to claim. A source that failed is
named as a source that failed, with the reason. Each source's count is reported
in that source's own terms, and each quantity in the units that source
published. A yield is repeated in the source's own words, because "4 à 6
personnes" and "4 personnes" are different claims.

## Setup Requirements

- `RECIPES_USER_AGENT` (optional): Identify your own client. The project's own identifier is appended, so a site can always reach a human.
- `RECIPES_MIN_INTERVAL_MS` (optional): Minimum gap between two requests to one source. Default 1000, and values below 500 are refused.
- `RECIPES_TIMEOUT_MS` (optional): Per-request deadline. Default 20000.
- `RECIPES_MAX_RETRIES` (optional): Retries on rate limiting and transient errors. Default 3.
- `RECIPES_CACHE_TTL_MS` (optional): In-memory cache lifetime. Default 900000. Set 0 to turn it off.
- `RECIPES_CACHE_MAX_ENTRIES` (optional): In-memory cache size. Default 200.
- `RECIPES_LOG_LEVEL` (optional): silent, error, info or debug. Default error, on stderr.

No API key and no account are needed.

## Category

Lifestyle & Food

## Features

- Searches every source at the same time, and returns one list
- Every identifier names the source it came from, so the right one is read without guessing
- Puts one dish side by side as each source writes it, all rescaled to the same yield
- Scales quantities in French and English, including a list holding both at once
- A countable thing lands where a kitchen can follow it: an egg whole, and anything that pours or cuts halved
- A measurement moves to a smaller unit before it is rounded, so a small share never rounds to nothing
- A pinch, a poignée and a capful have their count multiplied while the size of one stays the cook's
- A line offering a choice has every branch scaled, and is never reported as exact
- Every line says whether the arithmetic was exact, rounded, or impossible
- A page stating no yield is returned as published, with the reason
- A source that fails is named, with the reason, and the other sources' rows still come back
- Each source's count is reported in that source's own terms, and each quantity in the units it published
- The Cookbook's licence travels with everything it publishes
- Self-paced with a floor configuration cannot go below, and an honest User-Agent

## Getting Started

- "Find a carbonara and show me how the sources differ"
- "Read the Marmiton crêpes recipe for 12 people"
- "Scale this list to 30 people: 250 g de farine, 4 oeufs, une pincée de sel"
- "What does the Cookbook ask for in a Victoria sponge, for 6?"
- Tool: search_recipes — Searches every source at once and returns one merged list
- Tool: get_recipe — Reads one recipe, optionally rescaled
- Tool: scale_ingredients — Scales a list from anywhere, offline, in either language
- Tool: compare_recipes — One dish, as each source writes it

## Tags

recipes, cooking, marmiton, wikibooks, cookbook, ingredient-scaling, bilingual, french, english, no-api-key

## Documentation URL

https://github.com/smeet666/mcp-recipes#readme
