# mcp-recipes

[![npm](https://img.shields.io/npm/v/mcp-recipes.svg)](https://www.npmjs.com/package/mcp-recipes)
[![CI](https://github.com/smeet666/mcp-recipes/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-recipes/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-recipes.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-recipes)
[![Glama](https://glama.ai/mcp/servers/smeet666/mcp-recipes/badges/score.svg)](https://glama.ai/mcp/servers/smeet666/mcp-recipes)
[![M8ven](https://m8ven.ai/badge/mcp/smeet666-mcp-recipes-1o0x5l?variant=verified)](https://m8ven.ai/mcp/smeet666-mcp-recipes-1o0x5l)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=recipes&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1yZWNpcGVzIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=recipes&config=%7B%22name%22%3A%22recipes%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-recipes%22%5D%7D)

Recipes live on many sites, and each one writes them its own way: a French
cooking site publishes in French, with its own measures and its own idea of what
a serving is, and a wiki cookbook in English, with equipment lists and prose the
first has no field for. Asking a question of one of them answers about one of
them.

This server reads five at once. Three publish in French:
[Marmiton](https://www.marmiton.org), where home cooks publish,
[Ptitchef](https://www.ptitchef.com), which files its recipes under a tree of
ingredients, and [Supertoinette](https://www.supertoinette.com), which prints a
resting time of its own. Two publish in English: the
[Wikibooks Cookbook](https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents),
written and maintained in the open, and
[BBC Good Food](https://www.bbcgoodfood.com), which groups an ingredient list
under headings. You can search them all with one question, read a recipe from any
of them in one shape, put several versions of the same dish side by side, and
rescale any ingredient list. It needs no API key and no account.

_[Version française](#mcp-recipes-français)_

---

## Install

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=recipes&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1yZWNpcGVzIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=recipes&config=%7B%22name%22%3A%22recipes%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-recipes%22%5D%7D)

**Claude Code**

```bash
claude mcp add recipes -- npx -y mcp-recipes
```

**Claude Desktop, Cursor, and any client using the standard config format**

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

Node 24 or later is required, and no environment variable has to be set.

### With Docker

```json
{
  "mcpServers": {
    "recipes": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-recipes:3.0.0"]
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and `-t` is left out
because a TTY rewrites the stream. The container needs outbound HTTPS to
`www.marmiton.org`, `api.wikimedia.org`, `www.ptitchef.com`,
`www.bbcgoodfood.com` and `www.supertoinette.com`, and nothing else:
no volume, no port, no credential.

### Bundle, without npm

Download `mcp-recipes-3.0.0.mcpb` from
[the latest release](https://github.com/smeet666/mcp-recipes/releases/latest) and
open it. A client that supports MCP bundles installs it on its own, with no npm
and no configuration file to edit. The bundle carries its dependencies, so
nothing is fetched at install time.

## What you can ask

- "Find me carbonara recipes, from wherever you can."
- "Compare the French and English versions of that dish."
- "Read the second one for eight people."
- "Which of them uses cream?"
- "Scale this list from my notebook by 1.5."

The ordinary path runs from a search to a reading: a row carries an `id` naming
its source, and `get_recipe` takes it.

## The sources

| Source          | Site                    | Language |
| --------------- | ----------------------- | -------- |
| `marmiton`      | `www.marmiton.org`      | French   |
| `cookbook`      | Wikibooks Cookbook      | English  |
| `ptitchef`      | `www.ptitchef.com`      | French   |
| `goodfood`      | `www.bbcgoodfood.com`   | English  |
| `supertoinette` | `www.supertoinette.com` | French   |

A row's `id` names its source, so an identifier read from one answer goes back to
the right site. **Counts are never added across sources**, and a source that
failed is reported as having failed rather than as having found nothing.

## Tools

| Tool                | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `search_recipes`    | Searches every source with one question.                   |
| `get_recipe`        | Reads one recipe from any source, in one shape.            |
| `compare_recipes`   | Puts several versions of the same dish side by side.       |
| `scale_ingredients` | Rescales any ingredient list, with no request to any site. |

### `search_recipes`

Searches every source with one question.

| Argument           | Type                          | Required | What it does                                                     |
| ------------------ | ----------------------------- | -------- | ---------------------------------------------------------------- |
| `query`            | string, 1 to 200 characters   | yes      | The dish or the ingredient to look for.                          |
| `limit_per_source` | integer, 1 to 25, default `5` | no       | Rows to keep from each source.                                   |
| `sources`          | array of source ids           | no       | Ask these sources alone.                                         |
| `fan_out`          | boolean, default `true`       | no       | Ask every source rather than stopping at the first that answers. |

**In return:** `results`, rows carrying `id`, which `get_recipe` takes;
`source` and `source_name` saying which site published the row; `title`; `url`;
`image_url`; and an `excerpt` where the source offers one. `per_source` gives one
report per site with its `status`, reading `answered` or `failed`, the `count` it
contributed, and its `reported_total` alongside `reported_total_means`, which
says what that number counts on that site. `order` says in words how the list was
built.

### `get_recipe`

Reads one recipe from any source, in one shape.

| Argument         | Type                                                                                                           | Required | What it does                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | string, 1 to 500 characters                                                                                    | yes      | The identifier a row carries, such as `marmiton:44078`. Two sources address a recipe by a bare number, so spell an id with its source. |
| `servings`       | integer, 1 to 500                                                                                              | no       | Rescale the ingredients to this many servings.                                                                                         |
| `sections`       | array of `ingredients`, `steps`, `times`, `nutrition`, `tips`, `equipment`, default `["ingredients", "steps"]` | no       | Which parts to return.                                                                                                                 |
| `max_steps`      | integer, 1 to 100, default `20`                                                                                | no       | Steps to serve.                                                                                                                        |
| `max_step_chars` | integer, 80 to 4000, default `600`                                                                             | no       | Characters kept per step.                                                                                                              |

**In return:** the recipe in the shape every source is rendered into, whichever
published it: its title, its address, its ingredients with each line's `scaling`,
its steps, and the sections asked for. A field one source publishes and another
has no notion of comes back absent rather than invented. `rest_minutes` carries a
resting time from a source that prints one apart, and is in no other time here.
`steps_as_one_block` says when a source published its method as one block of
prose rather than as steps. `withheld` names a part a source keeps for its
subscribers, which is a part the page has rather than a part that could not be
read. Raise `max_step_chars` when a step was cut mid-sentence.

### `compare_recipes`

Puts several versions of the same dish side by side.

| Argument         | Type                                                                                                  | Required | What it does                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------- |
| `dish`           | string, 1 to 200 characters                                                                           | yes      | The dish to compare.                         |
| `servings`       | integer, 1 to 500                                                                                     | no       | Rescale every version to this many servings. |
| `sections`       | array of `ingredients`, `steps`, `times`, `nutrition`, `tips`, `equipment`, default `["ingredients"]` | no       | Which parts to return per version.           |
| `max_steps`      | integer, 1 to 100, default `10`                                                                       | no       | Steps to serve per version.                  |
| `max_step_chars` | integer, 80 to 4000, default `600`                                                                    | no       | Characters kept per step.                    |
| `sources`        | array of source ids                                                                                   | no       | Compare these sources alone.                 |

**In return:** `versions`, one recipe per source that answered, all rescaled to
the same number of servings so their quantities can be read against each other,
and `differences`, what separates them. `per_source` reports each site as a
search does.

### `scale_ingredients`

Rescales any ingredient list, with no request to either site.

| Argument        | Type                                 | Required   | What it does                               |
| --------------- | ------------------------------------ | ---------- | ------------------------------------------ |
| `ingredients`   | array of 1 to 200 lines              | yes        | The lines to rescale.                      |
| `factor`        | number, up to 1000                   | one of two | The multiplier to apply.                   |
| `from_servings` | integer, 1 to 500                    | one of two | How many servings the list is written for. |
| `to_servings`   | integer, 1 to 500                    | one of two | How many servings are wanted.              |
| `language`      | `auto`, `fr` or `en`, default `auto` | no         | How each line is read.                     |

Pass `factor`, or the `from_servings` and `to_servings` pair. `auto` reads each
line on its own, which is what a list holding both languages needs; naming a
language reads every line that way.

**In return:** the rescaled lines in the shape `get_recipe` returns, each with
its `scaling`.

## Rescaling the quantities

A quantity is stated in the unit that suits it, so a line can come back in a
different unit from the one the recipe used: 200 g multiplied by twenty reads
`4 kg`.

How finely an ingredient can be divided depends on what it is. A baguette can be
cut in two, in three or in four; an egg cannot be shared out. A quantity landing
between the two is rounded, and the rescaled recipe then departs a little from
the proportions of the original. The line carries `rounded`, and its note says
what was done.

The sources write their quantities in their own languages, and a line is read
in the language it was written in. The figures are this server's arithmetic, so
say they were recomputed when you show them.

## What an answer states about the sources

Every answer accounts for each source separately. A site that failed, one nobody
asked, and one that answered with nothing are three different things, and they
are reported as three. A total stays beside the source that published it, with
what that source counts when it says it: one site counts a whole category and the
other counts the rows it served.

## Configuration

Every variable is optional. Set them in the `env` block of your client config.

| Variable                    | Default              | What it does                                                                         |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| `RECIPES_USER_AGENT`        | the project identity | Names your application to both sites, with an address where a person can be reached. |
| `RECIPES_MIN_INTERVAL_MS`   | `1000`               | Gap between two requests to one site, from 500 to 60000.                             |
| `RECIPES_TIMEOUT_MS`        | `20000`              | Deadline for one request, from 1000 to 120000.                                       |
| `RECIPES_MAX_RETRIES`       | `3`                  | Attempts after a transient failure, from 0 to 8.                                     |
| `RECIPES_CACHE_TTL_MS`      | `900000`             | How long an answer stays in memory, from 0 to 86400000.                              |
| `RECIPES_CACHE_MAX_ENTRIES` | `200`                | Answers held in memory at once, from 1 to 5000.                                      |
| `RECIPES_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` or `debug`, written to stderr.                             |

A value outside its range falls back to the default, and the reason is written to
stderr.

## Errors

Every failure carries one of six codes, a message, and where it helps a hint
naming the next move.

| Code            | What happened                                           | What to do                                                                        |
| --------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `not_found`     | A source answered, and holds no such recipe.            | Check the identifier with `search_recipes`.                                       |
| `invalid_input` | The arguments were refused before any request went out. | Read the message, which names the argument.                                       |
| `rate_limited`  | A source asked this client to slow down.                | Wait, then call again with the same arguments. The recipe is still there.         |
| `parse_failure` | A page loaded and the expected content was absent.      | Report it at [the issue tracker](https://github.com/smeet666/mcp-recipes/issues). |
| `network_error` | The request did not complete.                           | Try again shortly.                                                                |
| `timeout`       | The request passed its deadline.                        | Raise `RECIPES_TIMEOUT_MS`, or ask for fewer rows.                                |

A source that failed is reported per source rather than failing the whole answer,
so one silent site never hides the other.

## As a library

The layer reading the two sites is published on its own, with its pacing, its
cache and its errors, and with no protocol attached.

```ts
import { RecipesClient } from "mcp-recipes/client";

const client = new RecipesClient();
const read = await client.search({ query: "carbonara", limitPerSource: 3 });
console.log(read.data.results.length);
```

Each read answers `{ data, cached }`, and throws an error carrying one of the six
codes. Each site keeps its own pace, and the floor holds here as well.

## Pacing and attribution

Each site is paced on its own, one request at a time with at least a second
between two, and the floor of half a second holds however the server is
configured. Asking every site at once therefore costs each of them one request,
never two. The `User-Agent` always ends with the project identity and an address
where a person can be reached.

Every row carries the address of the recipe's own page and the name of the site
that published it. The Cookbook pages are published under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), which asks that
what is built on them be shared under the same licence. Marmiton, Ptitchef, BBC
Good Food and Supertoinette state no terms on a recipe page, and their recipes
belong to those sites and to the cooks who wrote them. Silence is not a grant, so
credit the site and link the page you took a recipe from.

A recipe BBC Good Food keeps for its subscribers comes back without its
ingredients and its method, named as a recipe held back, with the address of its
page. This server does not reconstruct what that site chose to sell.

Two figures the sites publish are not repeated here. A difficulty is a word each
site writes its own way, on no scale any of them publishes, so it sits on no axis
along which two versions could be put. A cost is a price in euros on one site and
a rank inside its own list on another, and one field holding both would invite
them to be compared.

This MCP server is an unofficial project, with no affiliation to any of the
sites it reads.

## Privacy

This server collects nothing about you and sends nothing to its author. It runs
on your machine, contacts `www.marmiton.org`, `api.wikimedia.org`,
`www.ptitchef.com`, `www.bbcgoodfood.com` and `www.supertoinette.com` and nothing
else, holds its answers in memory while it runs,
and writes nothing to disk. [PRIVACY.md](PRIVACY.md) states what a request
carries and which settings change any of it.

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Tests run against generated fixtures and make no network request. The live suite,
`npm run test:live`, makes one request per route and runs nightly against the
sites themselves.

## Contributing

Bugs, questions and ideas belong in
[the issue tracker](https://github.com/smeet666/mcp-recipes/issues). Pull
requests are welcome; opening an issue first helps agree on the shape of the
change. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). The recipes belong to the sites that published them
and to their authors.

---

<a name="mcp-recipes-français"></a>

# mcp-recipes (français)

_[English version](#mcp-recipes)_

Les recettes vivent sur beaucoup de sites, et chacun les écrit à sa façon : un
site de cuisine français publie en français, avec ses mesures et son idée de ce
qu'est une part, et un wiki de cuisine en anglais, avec des listes de matériel et
une prose pour lesquelles le premier n'a aucun champ. Poser une question à l'un
d'eux répond au sujet de l'un d'eux.

Ce serveur en lit cinq à la fois. Trois publient en français :
[Marmiton](https://www.marmiton.org), où des cuisiniers publient,
[Ptitchef](https://www.ptitchef.com), qui range ses recettes sous un arbre
d'ingrédients, et [Supertoinette](https://www.supertoinette.com), qui imprime un
temps de repos à part. Deux publient en anglais : le
[Cookbook des Wikibooks](https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents),
écrit et entretenu à découvert, et
[BBC Good Food](https://www.bbcgoodfood.com), qui groupe une liste d'ingrédients
sous des intertitres. On peut chercher dans les cinq avec une seule question,
lire une recette de n'importe lequel sous une seule forme, mettre plusieurs
versions d'un même plat côte à côte, et adapter n'importe quelle liste
d'ingrédients. Aucune clé d'API, aucun compte.

## Installation

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=recipes&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1yZWNpcGVzIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=recipes&config=%7B%22name%22%3A%22recipes%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-recipes%22%5D%7D)

**Claude Code**

```bash
claude mcp add recipes -- npx -y mcp-recipes
```

**Claude Desktop, Cursor, et tout client au format de configuration standard**

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

Node 24 ou plus récent est nécessaire, et aucune variable d'environnement n'est à
renseigner.

### Avec Docker

```json
{
  "mcpServers": {
    "recipes": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-recipes:3.0.0"]
    }
  }
}
```

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et `-t` est
omis parce qu'un TTY réécrit le flux. Le conteneur a besoin d'un accès HTTPS
sortant vers `www.marmiton.org`, `api.wikimedia.org`, `www.ptitchef.com`,
`www.bbcgoodfood.com` et `www.supertoinette.com`, et de
rien d'autre : aucun volume, aucun port, aucun identifiant.

### Bundle, sans npm

Téléchargez `mcp-recipes-3.0.0.mcpb` depuis
[la dernière publication](https://github.com/smeet666/mcp-recipes/releases/latest)
et ouvrez-le. Un client qui gère les bundles MCP l'installe seul, sans npm et
sans fichier de configuration à modifier. Le bundle emporte ses dépendances, donc
rien n'est téléchargé à l'installation.

## Ce qu'on peut demander

- « Trouve-moi des recettes de carbonara, d'où que tu puisses. »
- « Compare les versions française et anglaise de ce plat. »
- « Lis-moi la seconde pour huit personnes. »
- « Laquelle utilise de la crème ? »
- « Multiplie par 1,5 cette liste de mon carnet. »

Le chemin ordinaire va d'une recherche à une lecture : une ligne porte un `id`
qui nomme sa source, et `get_recipe` le reprend.

## Les sources

| Source          | Site                    | Langue   |
| --------------- | ----------------------- | -------- |
| `marmiton`      | `www.marmiton.org`      | français |
| `cookbook`      | Cookbook Wikibooks      | anglais  |
| `ptitchef`      | `www.ptitchef.com`      | français |
| `goodfood`      | `www.bbcgoodfood.com`   | anglais  |
| `supertoinette` | `www.supertoinette.com` | français |

L'`id` d'une ligne nomme sa source, donc un identifiant lu dans une réponse
retourne vers le bon site. **Les comptes ne sont jamais additionnés entre
sources**, et une source qui a échoué est rapportée comme ayant échoué plutôt que
comme n'ayant rien trouvé.

## Les outils

| Outil               | Ce qu'il fait                                              |
| ------------------- | ---------------------------------------------------------- |
| `search_recipes`    | Cherche dans toutes les sources avec une seule question.   |
| `get_recipe`        | Lit une recette de l'une ou l'autre, sous une seule forme. |
| `compare_recipes`   | Met plusieurs versions d'un même plat côte à côte.         |
| `scale_ingredients` | Adapte n'importe quelle liste d'ingrédients, sans requête. |

### `search_recipes`

Cherche dans toutes les sources avec une seule question.

| Argument           | Type                             | Requis | Ce qu'il fait                                                           |
| ------------------ | -------------------------------- | ------ | ----------------------------------------------------------------------- |
| `query`            | chaîne, 1 à 200 caractères       | oui    | Le plat ou l'ingrédient cherché.                                        |
| `limit_per_source` | entier, 1 à 25, défaut `5`       | non    | Lignes à garder de chaque source.                                       |
| `sources`          | tableau d'identifiants de source | non    | N'interroger que ces sources.                                           |
| `fan_out`          | booléen, défaut `true`           | non    | Interroger chaque source plutôt que s'arrêter à la première qui répond. |

**En retour :** `results`, des lignes portant `id`, que `get_recipe` reprend ;
`source` et `source_name` qui disent quel site a publié la ligne ; `title` ;
`url` ; `image_url` ; et un `excerpt` là où la source en propose un.
`per_source` donne un rapport par site avec son `status`, valant `answered` ou
`failed`, le `count` qu'il a fourni, et son `reported_total` accompagné de
`reported_total_means`, qui dit ce que ce nombre compte sur ce site. `order` dit
en mots comment la liste a été bâtie.

### `get_recipe`

Lit une recette de n'importe quelle source, sous une seule forme.

| Argument         | Type                                                                                                            | Requis | Ce qu'il fait                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | chaîne, 1 à 500 caractères                                                                                      | oui    | L'identifiant d'une ligne, tel que `marmiton:44078`. Deux sources adressent une recette par un nombre nu : écrivez l'id avec sa source. |
| `servings`       | entier, 1 à 500                                                                                                 | non    | Adapte les ingrédients à ce nombre de parts.                                                                                            |
| `sections`       | tableau de `ingredients`, `steps`, `times`, `nutrition`, `tips`, `equipment`, défaut `["ingredients", "steps"]` | non    | Les parties à rendre.                                                                                                                   |
| `max_steps`      | entier, 1 à 100, défaut `20`                                                                                    | non    | Étapes à servir.                                                                                                                        |
| `max_step_chars` | entier, 80 à 4000, défaut `600`                                                                                 | non    | Caractères gardés par étape.                                                                                                            |

**En retour :** la recette dans la forme où toutes les sources sont rendues, quelle
que soit celle qui l'a publiée : son titre, son adresse, ses ingrédients avec le
`scaling` de chaque ligne, ses étapes, et les parties demandées. Un champ qu'une
source publie et dont une autre n'a pas la notion revient absent plutôt
qu'inventé. `rest_minutes` porte le temps de repos d'une source qui l'imprime à
part, et il n'entre dans aucun autre temps rendu ici. `steps_as_one_block` dit
quand une source a publié sa méthode d'un seul bloc de prose plutôt qu'en étapes.
`withheld` nomme la partie qu'une source réserve à ses abonnés, qui est une
partie que la page porte et non une partie illisible. Augmentez `max_step_chars`
quand une étape a été coupée au milieu d'une phrase.

### `compare_recipes`

Met plusieurs versions d'un même plat côte à côte.

| Argument         | Type                                                                                                   | Requis | Ce qu'il fait                               |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------- |
| `dish`           | chaîne, 1 à 200 caractères                                                                             | oui    | Le plat à comparer.                         |
| `servings`       | entier, 1 à 500                                                                                        | non    | Adapte chaque version à ce nombre de parts. |
| `sections`       | tableau de `ingredients`, `steps`, `times`, `nutrition`, `tips`, `equipment`, défaut `["ingredients"]` | non    | Les parties à rendre par version.           |
| `max_steps`      | entier, 1 à 100, défaut `10`                                                                           | non    | Étapes à servir par version.                |
| `max_step_chars` | entier, 80 à 4000, défaut `600`                                                                        | non    | Caractères gardés par étape.                |
| `sources`        | tableau d'ids de source                                                                                | non    | Ne compare que ces sources.                 |

**En retour :** `versions`, une recette par source ayant répondu, toutes adaptées
au même nombre de parts pour que leurs quantités se lisent l'une contre l'autre,
et `differences`, ce qui les sépare. `per_source` rapporte chaque site comme le
fait une recherche.

### `scale_ingredients`

Adapte n'importe quelle liste d'ingrédients, sans requête à l'un ou l'autre site.

| Argument        | Type                                | Requis        | Ce qu'il fait                             |
| --------------- | ----------------------------------- | ------------- | ----------------------------------------- |
| `ingredients`   | tableau de 1 à 200 lignes           | oui           | Les lignes à adapter.                     |
| `factor`        | nombre, jusqu'à 1000                | l'un des deux | Le multiplicateur à appliquer.            |
| `from_servings` | entier, 1 à 500                     | l'un des deux | Le nombre de parts de la liste d'origine. |
| `to_servings`   | entier, 1 à 500                     | l'un des deux | Le nombre de parts voulu.                 |
| `language`      | `auto`, `fr` ou `en`, défaut `auto` | non           | Comment chaque ligne est lue.             |

Passez `factor`, ou le couple `from_servings` et `to_servings`. `auto` lit chaque
ligne pour elle-même, ce dont a besoin une liste portant les deux langues ;
nommer une langue lit toutes les lignes ainsi.

**En retour :** les lignes adaptées dans la forme que rend `get_recipe`, chacune
avec son `scaling`.

## L'adaptation des quantités

Une quantité est exprimée dans l'unité qui lui convient. Après adaptation, une
ligne peut donc apparaître dans une autre unité que celle de la recette : 200 g
multipliés par vingt donnent `4 kg`.

La finesse à laquelle un ingrédient se coupe dépend de sa nature. Une baguette se
coupe en deux, en trois ou en quatre ; un oeuf ne se partage pas. Une quantité
qui tombe entre les deux est donc arrondie, et la recette adaptée s'écarte alors
un peu des proportions de l'originale. La ligne porte `rounded`, et sa note dit
ce qui a été fait.

Les sources écrivent leurs quantités dans leur propre langue, et une ligne
est lue dans la langue où elle a été écrite. Les chiffres sont l'arithmétique de
ce serveur, donc dites qu'ils ont été recalculés quand vous les montrez.

## Ce qu'une réponse dit des sources

Chaque réponse rend compte de chaque source séparément. Un site qui a échoué, un
que personne n'a interrogé et un qui a répondu vide sont trois choses
différentes, et elles sont rapportées comme trois. Un total reste à côté de la
source qui l'a publié, avec ce que cette source compte en le disant : l'un compte
une catégorie entière et l'autre compte les lignes qu'il a servies.

## Configuration

Chaque variable est facultative. Elles se posent dans le bloc `env` de la
configuration du client.

| Variable                    | Défaut               | Ce qu'elle fait                                                                          |
| --------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `RECIPES_USER_AGENT`        | l'identité du projet | Nomme votre application auprès des deux sites, avec une adresse où joindre une personne. |
| `RECIPES_MIN_INTERVAL_MS`   | `1000`               | Écart entre deux requêtes vers un même site, de 500 à 60000.                             |
| `RECIPES_TIMEOUT_MS`        | `20000`              | Délai d'une requête, de 1000 à 120000.                                                   |
| `RECIPES_MAX_RETRIES`       | `3`                  | Tentatives après un échec passager, de 0 à 8.                                            |
| `RECIPES_CACHE_TTL_MS`      | `900000`             | Durée pendant laquelle une réponse reste en mémoire, de 0 à 86400000.                    |
| `RECIPES_CACHE_MAX_ENTRIES` | `200`                | Réponses gardées en mémoire à la fois, de 1 à 5000.                                      |
| `RECIPES_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` ou `debug`, écrit sur la sortie d'erreur.                      |

Une valeur hors de sa plage retombe sur le défaut, et la raison est écrite sur la
sortie d'erreur.

## Erreurs

Chaque échec porte un des six codes, un message, et quand cela aide une
indication du geste suivant.

| Code            | Ce qui s'est passé                                  | Que faire                                                                               |
| --------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `not_found`     | Une source a répondu, et n'a pas cette recette.     | Vérifiez l'identifiant avec `search_recipes`.                                           |
| `invalid_input` | Les arguments ont été refusés avant toute requête.  | Lisez le message, qui nomme l'argument.                                                 |
| `rate_limited`  | Une source demande à ce client de ralentir.         | Attendez, puis rappelez avec les mêmes arguments. La recette est toujours là.           |
| `parse_failure` | Une page a chargé et le contenu attendu est absent. | Signalez-le sur [le suivi d'incidents](https://github.com/smeet666/mcp-recipes/issues). |
| `network_error` | La requête n'a pas abouti.                          | Réessayez sous peu.                                                                     |
| `timeout`       | La requête a dépassé son délai.                     | Augmentez `RECIPES_TIMEOUT_MS`, ou demandez moins de lignes.                            |

Une source qui échoue est rapportée source par source plutôt que de faire échouer
toute la réponse, donc un site silencieux n'en cache jamais un autre.

## Comme bibliothèque

La couche qui lit les deux sites est publiée seule, avec son rythme, son cache et
ses erreurs, sans protocole attaché.

```ts
import { RecipesClient } from "mcp-recipes/client";

const client = new RecipesClient();
const read = await client.search({ query: "carbonara", limitPerSource: 3 });
console.log(read.data.results.length);
```

Chaque lecture répond `{ data, cached }`, et lève une erreur portant un des six
codes. Chaque site garde son propre rythme, et le plancher tient également ici.

## Rythme et attribution

Chaque site est cadencé pour lui-même, une requête à la fois avec au moins une
seconde entre deux, et le plancher d'une demi-seconde tient quelle que soit la
configuration. Les interroger toutes à la fois coûte donc à chacune une requête,
jamais deux. Le `User-Agent` se termine toujours par l'identité du projet et une
adresse où joindre une personne.

Chaque ligne porte l'adresse de la page de la recette et le nom du site qui l'a
publiée. Les pages du Cookbook sont publiées sous
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.fr), qui
demande que ce qu'on bâtit dessus soit partagé sous la même licence. Marmiton,
Ptitchef, BBC Good Food et Supertoinette n'énoncent aucune condition sur une page
de recette, et leurs recettes appartiennent à ces sites et aux cuisiniers qui les
ont écrites. Le silence n'est pas une autorisation : créditez le site et liez la
page d'où vient la recette.

Une recette que BBC Good Food réserve à ses abonnés revient sans ses ingrédients
ni sa méthode, nommée comme une recette retenue, avec l'adresse de sa page. Ce
serveur ne reconstitue pas ce que ce site a choisi de vendre.

Deux chiffres que les sites publient ne sont pas repris ici. Une difficulté est
un mot que chaque site écrit à sa façon, sur aucune échelle publiée : elle ne
siège sur aucun axe le long duquel deux versions se compareraient. Un coût est un
prix en euros sur un site et un rang dans sa propre liste sur un autre, et un
seul champ portant les deux inviterait à les comparer.

Ce MCP est un projet non officiel, sans affiliation à aucun des sites qu'il
lit.

## Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur. Il tourne sur
votre machine, ne joint que `www.marmiton.org`, `api.wikimedia.org`,
`www.ptitchef.com`, `www.bbcgoodfood.com` et `www.supertoinette.com`, garde ses réponses en mémoire le temps qu'il tourne, et
n'écrit rien sur le disque. [PRIVACY.md](PRIVACY.md) dit ce qu'une requête
emporte et quels réglages changent cela.

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Les tests s'exécutent sur des fixtures engendrées et n'émettent aucune requête.
La suite en direct, `npm run test:live`, émet une requête par route et tourne
chaque nuit contre les sites eux-mêmes.

## Contribuer

Les anomalies, les questions et les idées ont leur place dans
[le suivi d'incidents](https://github.com/smeet666/mcp-recipes/issues). Les
propositions de modification sont bienvenues ; ouvrir un ticket d'abord aide à
s'accorder sur la forme du changement. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT, voir [LICENSE](LICENSE). Les recettes appartiennent aux sites qui les ont
publiées et à leurs auteurs.
