# mcp-recipes

One question, several kitchens. An MCP server that asks every recipe source it
reads at the same time, merges what they say, and scales quantities in French
and English.

Today it reads two: **Marmiton**, in French, and the **Wikibooks Cookbook**, in
English.

No API key. No account. Read-only.

---

## What it does

Marmiton is a French recipe site with reader ratings and millions of visitors.
The Wikibooks Cookbook is an English wiki written by whoever edits it, published
under a Creative Commons licence. They write the same dishes differently, and
that difference is worth having in one place.

This server:

- **searches every source at once** and returns one list, each row naming the
  source it came from;
- **reads one recipe** in full and rescales it to any number of people;
- **scales an ingredient list** you already hold, offline, in either language or
  a list holding both;
- **puts one dish side by side**, as each source writes it, all rescaled to the
  same number of servings so the lists stand comparison.

### What makes the answers usable

Multiplying every number by a factor is arithmetically correct and practically
useless: it produces "2.4 eggs" and "0.67 pinch of salt" with the same
confidence as "267 g flour". Every quantity here lands where a cook can act on
it:

| The line says                             | Times six                           | Why                                                                      |
| ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `une pincée de sel`                       | `6 pincées de sel`                  | A pinch keeps the size a hand gives it; the count carries the proportion |
| `1 dose (cup) de Mountain Dew`            | `6 doses (cup) de Mountain Dew`     | A French line naming an English measure stays French                     |
| `2/3 d'un flacon de fleur d'oranger`      | `4 flacons de fleur d'oranger`      | A share of one thing becomes a count of them                             |
| `1/4 litre de lait`                       | `1,5 l de lait`                     | French writes its decimals with a comma                                  |
| `250 ml milk`                             | `1.5 l milk`                        | English writes them with a dot, and both climb the metric ladder         |
| `2/3 of a bottle of orange blossom water` | `4 bottles of orange blossom water` | The bottles are what is counted, and the water comes with them           |
| `a capful of rum`                         | `6 capfuls rum`                     | A measure named after what holds it is read as one, listed or not        |

### What divides, and what does not

A measure divides as far as half of what it holds is still a quantity a kitchen
can take out. Almost everything is: what a tin, a sachet or a carton
holds is poured, weighed or spooned, so half a tin of tomatoes is half a tin of
tomatoes and the rest keeps in the fridge. A leaf of gelatine and a sprig of
thyme are cut with a knife. A handful is halved by taking less.

An egg is the exception, along with a yolk and an egg white on their own: half
of one means beating it and weighing the result, which no recipe asks for. A
clou de girofle, a zeste and a zest go with it, having no half anyone takes.

A few measures go the other way and divide further. A pot, a bouteille, a
bottle, a jar and a block hold enough for a quarter to be a portion someone
serves. Une tranche and a slice are already cut off something larger, and the
board that produced one takes a corner off it in the same gesture. And a word can state a number of things rather than a measure of them,
so `2 dozen mushrooms` at three quarters comes back as **18 mushrooms**. A blanc
belongs to whichever food the line named: the white of an egg is counted whole,
a blanc de poulet is meat and halves.

A thing counted on its own is divided by the size of one against what a recipe
puts in, in either language. A crevette and a shrimp, une moule and a mussel,
une noisette and a hazelnut, un grain de poivre and a peppercorn, un anis étoilé
and a star anise is already a portion: a recipe counts twelve of them and a
smaller recipe puts one fewer in the pan, so they land on a whole number. Un
gigot and a leg of lamb, une baguette, un camembert, un ananas and a pineapple,
une pastèque and a watermelon, une pintade and a guinea fowl, un poulet and a
chicken, un poireau and a leek
sit at the other end of that comparison, asked for by the one or the two and shared out with a knife, so they go as far as the
quarter. A cut carved off one of them stops at the half, une cuisse and a thigh
being the portion the knife already produced. Un jus, and a juice, stops at the
half too: half the jus of a citron is
taken by squeezing half the fruit, and a quarter of one has to be poured out and
measured back.

The word `clove` names two foods, and the line says which. Garlic in the line
makes it the wedge broken off a bulb, the gousse d'ail, which a knife splits in
two; on its own, or written `whole cloves`, it is the dried flower bud, the
clou de girofle, and a count of those lands on a whole number.

- `3 eggs` taken from six people to twenty-five gives **13 eggs**, and never a
  half of one.
- `1 can tomatoes` at four tenths gives **half a tin**, with a note saying the
  line no longer holds its share of the recipe.
- `2 tablespoons butter OR 30 g margarine` doubled scales **both** branches, and
  the line is never reported as exact arithmetic: how far one stands for the
  other is the page's own claim.
- `4 tablespoons` at a tenth comes down to **1.2 teaspoons**. A measurement moves
  to a smaller unit _before_ it is rounded, so a small share survives.

Every line comes back with a `scaling` field: `scaled` when the arithmetic
landed on the exact product, `rounded` when something had to move for the line
to stay usable, `unscaled` when the line carries nothing to multiply. A rounded
line says what it was rounded from and in which direction.

---

## Install

Node 20 or later.

```bash
npx -y mcp-recipes
```

### Claude Desktop

```json
{
  "mcpServers": {
    "recipes": {
      "command": "npx",
      "args": ["-y", "mcp-recipes"]
    }
  }
}
```

### From a clone

```bash
npm install
npm run build
node dist/index.js
```

---

## The four tools

### `search_recipes`

Asks every source at the same time, so asking them all costs about what asking
one costs.

| Argument           | Type                          | Meaning                                                        |
| ------------------ | ----------------------------- | -------------------------------------------------------------- |
| `query`            | string                        | A dish or an ingredient, in any language a source publishes in |
| `limit_per_source` | integer, 1 to 25, default 5   | Rows to take from each source                                  |
| `sources`          | array of source ids, optional | Left out, every source is asked                                |

The query goes to each source's own search as free text. There is no filtering:
a word naming a diet, a time or a calorie count matches only where that source's
index happens to carry it, and a question long enough to read like a request for
conditions gets a note saying so.

Rows are interleaved one source at a time. No score orders them against each
other, because the sources share none: one carries reader ratings and another
has no author and no rating by nature. The answer says how the order was built.

`per_source` reports what each source answered in that source's own terms.
Marmiton counts the rows on the single page it serves. The Cookbook states no
total at all, so a short list from it is not evidence that little exists. The
counts measure different things and are never added together.

### `get_recipe`

| Argument         | Type                                      | Meaning                                                           |
| ---------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `id`             | string                                    | From `search_recipes`, such as `marmiton:44078`                   |
| `servings`       | integer, optional                         | Rescale to this many                                              |
| `sections`       | array, default `["ingredients", "steps"]` | `ingredients`, `steps`, `times`, `nutrition`, `tips`, `equipment` |
| `max_steps`      | integer, default 20                       | Steps to return; the answer says how many more there are          |
| `max_step_chars` | integer, default 600                      | Characters kept per step                                          |

The identifier names its source, so the right one is read without guessing. A
raw identifier is routed by its shape, and the answer says which reading it
used: a bare number is Marmiton's, a page key carrying the Cookbook namespace is
the Cookbook's, and an address is routed by its host. A string no source would
have minted is refused, because sending it anywhere returns whatever that guess
happened to hit.

`sections_omitted` names what was left out. A field belonging to one of those
sections is empty because nobody asked for it, and a field a source genuinely
does not publish is `null`.

A page stating no number of servings comes back as published and says why:
dividing by a yield nobody wrote would answer for a number of people the page
never claimed. A page stating a span, such as "4 à 6 personnes", is scaled from
the lower end, and the answer gives the factor the upper end would have needed.

Some sources keep recipes and reference pages under one namespace, so a search
row can be a page _about_ a dish rather than a recipe _for_ it. Only reading the
page tells them apart, and this tool says when a page carries no ingredient
list.

### `scale_ingredients`

Offline. Nothing is fetched. The list can come from any of the sources, from a
cookbook on a shelf, or from a photograph of a card.

| Argument                        | Type                                 | Meaning                                     |
| ------------------------------- | ------------------------------------ | ------------------------------------------- |
| `ingredients`                   | string[]                             | The lines as written, one ingredient each   |
| `factor`                        | number                               | What to multiply by                         |
| `from_servings` + `to_servings` | integers                             | The factor worked out from a pair of counts |
| `language`                      | `auto` / `fr` / `en`, default `auto` | `auto` reads each line on its own           |

Give `factor`, or the pair. Giving both is refused: a caller who means two
different things by them has made a mistake worth hearing about.

`auto` is what a mixed list needs. A line is read in the language it is written
in, and comes back written the same way, down to the decimal mark and where the
plural falls.

### `compare_recipes`

| Argument         | Type                             | Meaning                                         |
| ---------------- | -------------------------------- | ----------------------------------------------- |
| `dish`           | string                           | The dish, in any language a source publishes in |
| `servings`       | integer, optional                | Rescale every version to this many              |
| `sections`       | array, default `["ingredients"]` | As above                                        |
| `max_steps`      | integer, default 10              | Steps to return per version                     |
| `max_step_chars` | integer, default 600             | Characters kept per step                        |

This is the tool that exists because there is more than one source. It reads
each source's closest match, rescales them all to the same yield, and states
what differs: the quantities, the yields, the times, and which fields each
source publishes at all. Where the versions agree, it says nothing.

The versions are shown side by side, each in the units its own source published.
A gram in one and a cup in another are two ways of writing a recipe.

When one source is missing, the answer says which of three things happened: its
search failed, it offered a row that could not be read, or it offered nothing
close enough to compare.

---

## What it refuses to claim

Each of these is a rule the code is held to, with a test naming it.

- **A source that failed is named as a source that failed.** An answer holding
  rows from some sources says nothing about what the others hold. "Marmiton was
  unreachable" and "Marmiton holds no such recipe" are different statements
  about the world, and a caller that cannot tell them apart will make the second
  one.
- **No total is invented.** Each source's own number is reported with what it
  counts, in that source's terms, and the counts are never summed.
- **No ranking across sources.** They share no scale, so rows interleave and the
  answer says how the order was built.
- **No conversion between measuring systems.** A line keeps the units its source
  published, and the source is named beside it.
- **A yield is repeated in the source's own words.** "4 à 6 personnes" and
  "4 personnes" are different claims.
- **A field a source does not publish is `null`**, and a field nobody asked for
  is listed in `sections_omitted`.
- **Text from a source cannot imitate this server.** Anything a source or a
  caller wrote is put on a single line before it is rendered, with markdown
  image syntax defused and any opening that looks like one of the server's own
  markers indented. The structured payload keeps the text exactly as published.

---

## Settings

All optional. A value that cannot be read is reported on stderr and the default
stands, because a server that refuses to start over a typo is very hard to
diagnose from inside a host application.

| Variable                    | Default  | Meaning                                                                                              |
| --------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `RECIPES_USER_AGENT`        | —        | Identify your own client. The project's identifier is appended, so a source can always reach a human |
| `RECIPES_MIN_INTERVAL_MS`   | `1000`   | Minimum gap between two requests to one source. Floor 500                                            |
| `RECIPES_TIMEOUT_MS`        | `20000`  | Deadline for one request                                                                             |
| `RECIPES_MAX_RETRIES`       | `3`      | Retries on rate limiting and transient failures                                                      |
| `RECIPES_CACHE_TTL_MS`      | `900000` | In-memory cache lifetime. `0` turns it off                                                           |
| `RECIPES_CACHE_MAX_ENTRIES` | `200`    | In-memory cache size                                                                                 |
| `RECIPES_LOG_LEVEL`         | `error`  | `silent`, `error`, `info`, `debug`. Logs go to stderr                                                |

No source publishes a ceiling for a client like this one, so the pacing is
self-imposed politeness. Configuration can widen it, and the floor holds
whichever way a setting arrives.

---

## As a library

Two entry points are published beside the server, with no protocol attached.

```ts
import { RecipesClient } from "mcp-recipes/client";

const client = new RecipesClient();
const merged = await client.searchRecipes("carbonara", 3);

for (const report of merged.reports) {
  console.log(report.name, report.status, report.error?.code ?? "");
}
```

```ts
import { scaleIngredients } from "mcp-recipes/scale";

scaleIngredients(["200 g de farine", "3 eggs"], { factor: 2 });
// [{ text: "400 g de farine", language: "fr", scaling: "scaled", … },
//  { text: "6 eggs",          language: "en", scaling: "scaled", … }]
```

`RecipesClient` also takes stand-in readers, so a program embedding it can put
its own cache in front of a source, or drive it from fixed answers in a test:

```ts
new RecipesClient({ readers: { marmiton: myReader } });
```

A program bringing corpora of its own replaces the registry outright with
`sources`, and every tool works over however many it holds.

---

## When something goes wrong

Six error codes, and no others.

| Code            | Means                                                |
| --------------- | ---------------------------------------------------- |
| `not_found`     | A source answered, and holds no such recipe          |
| `invalid_input` | The arguments could not produce a request            |
| `rate_limited`  | A source asked this client to slow down              |
| `parse_failure` | An answer arrived in a shape this client cannot read |
| `network_error` | The request did not complete                         |
| `timeout`       | The request exceeded its deadline                    |

`rate_limited` means the recipe may well exist. Wait and ask again.

A `parse_failure` usually means a source changed how it answers. That is worth
reporting: <https://github.com/smeet666/mcp-recipes/issues>

If a search comes back short, read `per_source` before concluding anything.

---

## Development

```bash
npm install
npm run typecheck
npm test           # unit tests, no network
npm run build
```

The unit suite runs against stand-in sources, so it is deterministic: time is
pinned to a fixed epoch, and every assertion is exact. A live suite sits behind
an environment variable and makes one request per route:

```bash
RECIPES_LIVE=1 npm run test:live
```

A nightly job runs that suite against the real sites and opens an issue when it
fails, because the unit tests cannot notice that a source changed.

**Adding a source.** Write an adapter: what it is called, how it recognises one
of its own identifiers, how to search it, and how to read one recipe off it.
Register it in `src/sources/registry.ts`. No tool, no merge and no error path
has a branch per source, so nothing else changes.

**Dependencies.** The reading of each site is a published library this server
depends on rather than code it carries: `mcp-marmiton` for Marmiton and
`mcp-wikibooks-cookbook` for the Cookbook. Each keeps its own pacing, its own
cache and its own error taxonomy. Everything above the seam, including the whole
of the bilingual scaling, lives here.

---

## Licence and credit

This server is MIT. What it returns is not.

Cookbook pages are published under **Creative Commons Attribution-Share Alike
4.0**, which requires attribution: every recipe carries its licence and its
link, and both have to travel with anything you repeat.

Marmiton states no terms of use on a recipe page. Silence is not permission.
Credit the source and link the page.

Every result carries a `url`. Use it.

---

---

# mcp-recipes (français)

Une question, plusieurs cuisines. Un serveur MCP qui interroge en même temps
toutes les sources de recettes qu'il lit, fusionne leurs réponses, et met les
quantités à l'échelle en français comme en anglais.

Il en lit deux aujourd'hui : **Marmiton**, en français, et le **Wikibooks
Cookbook**, en anglais.

Aucune clé d'API. Aucun compte. Lecture seule.

---

## Ce qu'il fait

Marmiton est un site de recettes français, avec des notes de lecteurs et
plusieurs millions de visiteurs. Le Wikibooks Cookbook est un wiki anglophone
écrit par qui veut l'éditer, publié sous licence Creative Commons. Les deux
écrivent les mêmes plats différemment, et cette différence vaut d'être réunie au
même endroit.

Ce serveur :

- **cherche dans toutes les sources à la fois** et renvoie une seule liste,
  chaque ligne nommant la source d'où elle vient ;
- **lit une recette** en entier et la recalcule pour le nombre de personnes
  voulu ;
- **met à l'échelle une liste d'ingrédients** que vous avez déjà, hors ligne,
  dans l'une ou l'autre langue, ou dans une liste qui mélange les deux ;
- **place un même plat côte à côte**, tel que chaque source l'écrit, toutes
  ramenées au même nombre de parts pour que les listes se comparent.

### Ce qui rend les réponses utilisables

Multiplier chaque nombre par un facteur est juste arithmétiquement et inutile en
cuisine : cela donne « 2,4 oeufs » et « 0,67 pincée de sel » avec le même aplomb
que « 267 g de farine ». Ici, chaque quantité tombe là où un cuisinier peut la
suivre :

| La ligne dit                         | Fois six                        | Pourquoi                                                                                   |
| ------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------ |
| `une pincée de sel`                  | `6 pincées de sel`              | Une pincée garde la taille que la main lui donne ; c'est le compte qui porte la proportion |
| `1 dose (cup) de Mountain Dew`       | `6 doses (cup) de Mountain Dew` | Une ligne française qui cite une mesure anglaise reste française                           |
| `2/3 d'un flacon de fleur d'oranger` | `4 flacons de fleur d'oranger`  | Une part d'une chose devient un compte de ces choses                                       |
| `1/4 litre de lait`                  | `1,5 l de lait`                 | Le français écrit ses décimales avec une virgule                                           |
| `250 ml milk`                        | `1.5 l milk`                    | L'anglais avec un point, et les deux montent l'échelle métrique                            |
| `a capful of rum`                    | `6 capfuls rum`                 | Une mesure nommée d'après ce qui la contient est lue comme telle, répertoriée ou non       |

### Ce qui se divise, et ce qui ne se divise pas

Une mesure se divise tant que la moitié de son contenu reste une quantité qu'une
cuisine sait prélever. C'est presque toujours le cas : ce que contient une
boîte, un bocal, un sachet ou une brique se verse, se pèse ou se
cuillère, donc une demi-boîte de tomates est une demi-boîte de tomates et le
reste se garde au frais. Une feuille de gélatine et une branche de thym se
coupent au couteau. Une poignée se divise en prenant moins.

L'œuf fait exception, avec le jaune et le blanc d'œuf pris à part : en prélever
la moitié demanderait de le battre et de le peser, ce qu'aucune recette ne
demande. Le clou de girofle et le zeste le rejoignent, faute de moitié que
quiconque prélève.

Quelques cas vont dans l'autre sens et se divisent plus loin, parce qu'ils
contiennent assez pour qu'un quart soit une portion : un pot, une bouteille, un
bottle, un block. Et un mot peut énoncer un nombre de choses plutôt qu'une
mesure, si bien que « 2 dozen mushrooms » réduits d'un quart reviennent en
**18 mushrooms**. Un blanc appartient à l'aliment que la ligne nomme : le blanc
d'œuf se compte entier, le blanc de poulet est une viande et se coupe en deux.

- `3 eggs` de six personnes à vingt-cinq donne **13 eggs**, jamais une demie.
- `1 can tomatoes` à quatre dixièmes donne **une demi-boîte**, avec la mention
  que la ligne ne porte plus sa part de la recette.
- `2 tablespoons butter OR 30 g margarine` doublé met les **deux** branches à
  l'échelle, et la ligne n'est jamais annoncée comme exacte : à quel point l'une
  vaut l'autre, c'est la page qui l'affirme.
- `4 tablespoons` au dixième descend à **1.2 teaspoons**. Une mesure passe à une
  unité plus petite _avant_ d'être arrondie, pour qu'une petite part survive.

Chaque ligne revient avec un champ `scaling` : `scaled` quand le calcul est tombé
juste, `rounded` quand quelque chose a dû bouger pour que la ligne reste
utilisable, `unscaled` quand la ligne ne porte rien à multiplier. Une ligne
arrondie dit depuis quelle valeur et dans quel sens.

---

## Installation

Node 20 ou plus récent.

```bash
npx -y mcp-recipes
```

### Claude Desktop

```json
{
  "mcpServers": {
    "recipes": {
      "command": "npx",
      "args": ["-y", "mcp-recipes"]
    }
  }
}
```

---

## Les quatre outils

### `search_recipes`

Interroge toutes les sources en parallèle : les demander toutes coûte à peu près
ce que coûte en demander une.

| Argument           | Type                                        | Sens                                                       |
| ------------------ | ------------------------------------------- | ---------------------------------------------------------- |
| `query`            | string                                      | Un plat ou un ingrédient, dans une des langues des sources |
| `limit_per_source` | entier, 1 à 25, défaut 5                    | Lignes prises à chaque source                              |
| `sources`          | tableau d'identifiants de source, optionnel | Absent, toutes sont interrogées                            |

La requête part vers la recherche de chaque source en texte libre. Il n'y a
aucun filtrage : un mot désignant un régime, un temps ou un nombre de calories
ne compte que si l'index de la source le porte, et une question assez longue
pour ressembler à une demande de conditions reçoit une note qui le dit.

Les lignes alternent d'une source à l'autre. Aucune note ne les classe les unes
contre les autres, faute d'échelle commune : l'une porte des avis de lecteurs,
l'autre n'a par nature ni auteur ni note. La réponse dit comment l'ordre a été
construit.

`per_source` rapporte ce qu'a répondu chaque source, dans les termes de cette
source. Marmiton compte les lignes de l'unique page qu'il sert. Le Cookbook
n'annonce aucun total, donc une liste courte venant de lui ne prouve pas qu'il y
ait peu de choses. Ces nombres comptent des choses différentes et ne sont jamais
additionnés.

### `get_recipe`

| Argument         | Type                                       | Sens                                                              |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `id`             | string                                     | Issu de `search_recipes`, par exemple `marmiton:44078`            |
| `servings`       | entier, optionnel                          | Recalculer pour ce nombre de personnes                            |
| `sections`       | tableau, défaut `["ingredients", "steps"]` | `ingredients`, `steps`, `times`, `nutrition`, `tips`, `equipment` |
| `max_steps`      | entier, défaut 20                          | Étapes renvoyées ; la réponse dit combien il en reste             |
| `max_step_chars` | entier, défaut 600                         | Caractères gardés par étape                                       |

L'identifiant nomme sa source, donc la bonne est lue sans deviner. Un
identifiant brut est routé sur sa forme et la réponse dit quelle lecture elle a
faite : un nombre nu est celui de Marmiton, une clé de page portant l'espace de
noms du Cookbook est celle du Cookbook, une adresse est routée par son hôte. Une
chaîne qu'aucune source n'aurait produite est refusée, car l'envoyer quelque
part renverrait ce que ce pari aurait touché.

`sections_omitted` nomme ce qui a été laissé de côté. Un champ appartenant à
l'une de ces sections est vide parce que personne ne l'a demandé, et un champ
qu'une source ne publie pas vaut `null`.

Une page qui n'annonce aucun nombre de parts revient telle que publiée, en
disant pourquoi. Une page qui annonce une fourchette, « 4 à 6 personnes », est
recalculée depuis la borne basse, et la réponse donne le facteur qu'aurait
demandé la borne haute.

### `scale_ingredients`

Hors ligne. Rien n'est téléchargé. La liste peut venir de n'importe quelle
source, d'un livre de cuisine sur une étagère, ou d'une photo de fiche.

| Argument                        | Type                                | Sens                                               |
| ------------------------------- | ----------------------------------- | -------------------------------------------------- |
| `ingredients`                   | string[]                            | Les lignes telles quelles, un ingrédient par ligne |
| `factor`                        | nombre                              | Par quoi multiplier                                |
| `from_servings` + `to_servings` | entiers                             | Le facteur déduit d'un couple de nombres de parts  |
| `language`                      | `auto` / `fr` / `en`, défaut `auto` | `auto` lit chaque ligne pour elle-même             |

Donnez `factor`, ou le couple. Donner les deux est refusé : un appelant qui leur
fait dire deux choses différentes a commis une erreur qui mérite d'être
signalée.

`auto` est ce dont une liste mixte a besoin. Une ligne est lue dans la langue où
elle est écrite, et revient écrite pareil, jusqu'à la virgule décimale et à
l'endroit où tombe le pluriel.

### `compare_recipes`

| Argument         | Type                              | Sens                                        |
| ---------------- | --------------------------------- | ------------------------------------------- |
| `dish`           | string                            | Le plat, dans une des langues des sources   |
| `servings`       | entier, optionnel                 | Ramener chaque version à ce nombre de parts |
| `sections`       | tableau, défaut `["ingredients"]` | Comme ci-dessus                             |
| `max_steps`      | entier, défaut 10                 | Étapes renvoyées par version                |
| `max_step_chars` | entier, défaut 600                | Caractères gardés par étape                 |

C'est l'outil qui existe parce qu'il y a plus d'une source. Il lit la version la
plus proche chez chacune, les ramène au même rendement, et énonce ce qui
diffère : les quantités, les rendements, les temps, et les champs que chaque
source publie. Là où les versions s'accordent, il se tait.

Les versions sont montrées côte à côte, chacune dans les unités que sa source a
publiées. Un gramme dans l'une et une tasse dans l'autre sont deux façons
d'écrire une recette.

Quand une source manque, la réponse dit laquelle des trois choses s'est
produite : sa recherche a échoué, elle a proposé une ligne illisible, ou elle
n'a rien proposé d'assez proche pour comparer.

---

## Ce qu'il refuse d'affirmer

Chacune de ces règles est tenue par un test qui la nomme.

- **Une source en échec est nommée comme une source en échec.** Une réponse qui
  ne porte que les lignes de certaines sources ne dit rien de ce que contiennent
  les autres.
- **Aucun total n'est inventé.** Le nombre de chaque source est rapporté avec ce
  qu'il compte, dans les termes de cette source, et ces nombres ne sont jamais
  additionnés.
- **Aucun classement entre les sources.** Elles n'ont pas d'échelle commune,
  donc les lignes alternent et la réponse dit comment l'ordre a été construit.
- **Aucune conversion entre systèmes de mesure.** Une ligne garde les unités que
  sa source a publiées, et la source est nommée à côté.
- **Un rendement est repris dans les mots de la source.** « 4 à 6 personnes » et
  « 4 personnes » sont deux affirmations différentes.
- **Un champ qu'une source ne publie pas vaut `null`**, et un champ que personne
  n'a demandé figure dans `sections_omitted`.
- **Le texte d'une source ne peut pas imiter ce serveur.** Tout ce qu'une source
  ou un appelant a écrit tient sur une seule ligne avant affichage, la syntaxe
  d'image markdown est désamorcée, et une ouverture ressemblant à un marqueur du
  serveur est indentée. La charge structurée conserve le texte tel que publié.

---

## Réglages

Tous optionnels. Une valeur illisible est signalée sur stderr et la valeur par
défaut s'applique : un serveur qui refuse de démarrer à cause d'une faute de
frappe est très difficile à diagnostiquer depuis l'application hôte.

| Variable                    | Défaut   | Sens                                                                                                   |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `RECIPES_USER_AGENT`        | —        | Identifiez votre client. L'identité du projet est ajoutée, pour qu'une source puisse joindre un humain |
| `RECIPES_MIN_INTERVAL_MS`   | `1000`   | Écart minimal entre deux requêtes vers une même source. Plancher 500                                   |
| `RECIPES_TIMEOUT_MS`        | `20000`  | Délai maximal d'une requête                                                                            |
| `RECIPES_MAX_RETRIES`       | `3`      | Réessais en cas de limitation ou d'échec passager                                                      |
| `RECIPES_CACHE_TTL_MS`      | `900000` | Durée de vie du cache mémoire. `0` le désactive                                                        |
| `RECIPES_CACHE_MAX_ENTRIES` | `200`    | Taille du cache mémoire                                                                                |
| `RECIPES_LOG_LEVEL`         | `error`  | `silent`, `error`, `info`, `debug`. Sur stderr                                                         |

Aucune source ne publie de plafond pour un client comme celui-ci : le rythme est
une politesse que le serveur s'impose. La configuration peut l'élargir, et le
plancher tient par quelque chemin que le réglage arrive.

---

## En cas de problème

Six codes d'erreur, et pas d'autres.

| Code            | Sens                                                            |
| --------------- | --------------------------------------------------------------- |
| `not_found`     | Une source a répondu, et n'a pas cette recette                  |
| `invalid_input` | Les arguments ne permettaient pas de former une requête         |
| `rate_limited`  | Une source a demandé à ce client de ralentir                    |
| `parse_failure` | Une réponse est arrivée dans une forme illisible pour ce client |
| `network_error` | La requête n'a pas abouti                                       |
| `timeout`       | La requête a dépassé son délai                                  |

`rate_limited` laisse entière la possibilité que la recette existe. Attendez et
redemandez.

Un `parse_failure` signifie en général qu'une source a changé sa façon de
répondre. Cela vaut un signalement :
<https://github.com/smeet666/mcp-recipes/issues>

Si une recherche revient courte, lisez `per_source` avant d'en conclure quoi que
ce soit.

---

## Licence et crédit

Ce serveur est sous licence MIT. Ce qu'il renvoie ne l'est pas.

Les pages du Cookbook sont publiées sous **Creative Commons Attribution-Share
Alike 4.0**, qui exige l'attribution : chaque recette porte sa licence et son
lien, et les deux doivent voyager avec ce que vous reprenez.

Marmiton n'énonce aucune condition d'utilisation sur une page de recette. Le
silence n'est pas une autorisation. Créditez la source et liez la page.

Chaque résultat porte une `url`. Servez-vous-en.
