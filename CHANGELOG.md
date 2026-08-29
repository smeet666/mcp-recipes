# Changelog

## 3.0.1

- **Every tool is documented, with its arguments and what its answer carries.**
  The README is written for a person deciding whether to install and for a
  program installing on its own, and a test holds both halves to what the server
  registers.
- **The privacy policy travels in the package.** It states the hosts contacted,
  what a request carries, what is held and for how long.
- **The manifest names every tool the server registers**, which a host reads
  before installing anything.

## 3.0.0

- **`compare_recipes` now answers with up to five versions where it answered
  with two.** A caller rendering the whole of its answer sees more of it, and
  its `differences` list grows with the number of sources. The new optional
  `sources` argument narrows it back to whichever traditions a question is
  actually about, and the tool asks every source when it is left out.
- **A bare number is no longer read as a Marmiton identifier.** Two of the
  sources address a recipe by digits alone, so `get_recipe` answers `44078`
  with `invalid_input` naming both readings rather than confidently returning
  one site's recipe. Every id `search_recipes` hands back already carries its
  source, so this reaches only a caller who wrote a bare number by hand.
- **Three sources are added:** Ptitchef and Supertoinette in French, BBC Good
  Food in English, beside Marmiton and the Wikibooks Cookbook. Each is named by
  an id of its own, `ptitchef`, `supertoinette` and `goodfood`, and every tool
  that took a source id takes them.
- **A recipe a source keeps for its subscribers is named as one.** BBC Good
  Food publishes such a recipe's title, times, rating and nutrition and holds
  back its ingredients and its method. The answer says which parts were held
  back and why, and links the page, rather than reporting a list this server
  failed to read. Asking to rescale one says there is nothing to rescale, in
  place of the sentence about a page that states no servings, which would be
  false: the page states what it serves.
- **A method published as one block of prose is reported as one**, so a
  paragraph is not read as the first step of several.
- **A resting time published apart is carried under its own name.** It is in no
  other time in the answer, and it is never added to another source's cooking
  time.
- **A search every source answered and none holds anything for keeps saying so**
  however many sources report. That sentence separates a wording nothing matched
  from a search that failed, and it used to be dropped once several sources each
  reported holding nothing.
- A difficulty and a cost are deliberately not carried. Every source writes a
  difficulty in a word of its own and none publishes a scale for it, so it sits
  on no axis two versions could be compared along. A cost is a price in euros on
  one source and a rank inside its own list on another.
- The privacy policy names the hosts this server actually contacts. A Cookbook
  page is read through `api.wikimedia.org` and only linked as `en.wikibooks.org`,
  which the host table stated the other way round.

## 2.0.0

- **This server now needs node 24 or later.** Node 20 reached its end of
  support on 2026-04-30 and node 22 is no longer what this code is built and
  typed against. That is what makes this a major version: an install on an
  older node is refused rather than left to fail somewhere later.
- **Every refusal of an argument opens with `invalid_input`.** A value outside
  its bounds, of the wrong type, or outside the set an argument reads used to
  come back in the validator's own words, with no code to branch on.
- **A container image is published for each version**, on ghcr, for amd64 and
  arm64. The readme carries the configuration that runs it.
- The published package carries its changelog, and the entry point it declares
  for the package root now publishes its types.

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.3.1

- The README carries the same badge row as every server here: npm, CI, the
  licence, the MCP registry entry, the Glama score, and one-click installs for
  Cursor and VS Code. Each install link encodes this package. npm serves the
  README frozen at publish time, so a release is what puts it there.

## 1.3.0

### Added

- A question asked in a sentence is sent in shorter wordings as well as in the
  words it was written in. These indexes answer the words they are handed: one
  requires every word given to appear on the same page, so "comment faire un
  ceviche de truite à l'origan" came back empty from a corpus holding four
  ceviche recipes, and the other ranks on the words received, so the words
  framing a question pulled up whatever shared them and pushed the dish out of
  the list. A question now becomes an ordered ladder of at most three wordings,
  tried in order and stopped as soon as enough rows have come back, and the rows
  are the union deduplicated on the id naming its source. `per_source` lists
  every wording, what each returned, and the ones held back with the reason.
  Nothing is translated between the sources' languages.

- `search_recipes` takes `fan_out`, on unless a caller turns it off, which sends
  exactly the words typed and still names the wordings that were withheld.

### Changed

- A condition a question sets is handled as a condition rather than as a word to
  find. "sans beurre", "gluten free" and "pour 6 personnes" stay in the wording
  sent first, where a source whose index carries them can match, and are set
  aside from the derived wordings, since no page is named for what it leaves out
  and a number of eaters is not printed in a title. Every condition set aside is
  named back in the notes with a reminder to read the ingredient list, because a
  recipe found this way can hold exactly what was being avoided. A number of
  servings is pointed at the `servings` argument.

- A condition is read by the role its words play rather than by the turn of
  phrase they are written in. Reading it off the phrasings "sans X", "without X"
  and "X-free" left an allergen a person had declared to become a positive
  search term: "je suis allergique aux noix" put "noix" into a derived wording,
  which pulled a coconut cake to the second row of a lasagne search with nothing
  said about nuts. An exclusion written "no butter" or "pas de beurre" raised no
  warning at all, and a diet named in one word was not treated as a condition,
  so "recette vegane au foie gras" returned foie gras at the first row unmarked.
  Three roles are now read: a negation, whichever of the closed class of
  negating words carries it; a sentence about the eater rather than the dish,
  which is named back as an allergy because that is the condition whose failure
  is a matter of health; and a diet named in one word. All three are set aside
  from the derived wordings and named back in the notes. A question can still
  phrase one in a way this reading misses, and the notes say so instead of
  presenting the conditions read as the only ones present. The reading is made
  once for the whole question, so the words set aside as a condition and the
  words searched for as a dish can no longer disagree.

- A quantity written across two measures is read as one quantity. "1 lb 4 oz
  beef" doubled came back as "2 lb 4 oz beef", a tenth short of the answer and
  marked as the exact product, and "1 kg 500 de farine" came back as "2 kg de
  500 de farine". Two measures off the same ladder written side by side, with
  the second holding less than one of the first, are one amount: they give
  "2.5 lb beef" and "3 kg de farine". The French form that leaves the smaller
  unit unwritten is read the same way.

- A measure standing in front of a container is read as the size of one of them.
  "12 oz can tomatoes" doubled came back as "1.5 lb can tomatoes", which asks
  for a bigger tin where the recipe wants a second one. Lines of that shape come
  back as published, with a note saying what the measure gives and that the line
  states no count.

- A further quantity on a line is seen where the measure stands behind the word
  introducing it. "150 g de sucre (soit 3/4 de tasse)" doubled came back as
  "300 g de sucre (soit 3/4 de tasse)" marked as exact, so the line claimed
  300 g was three quarters of a cup. A quantity left as published beside a mass
  or a volume now shows on the line's own `scaling`, which no longer reads
  `scaled`. A container's stated capacity is not one of those: "2 boîtes de
  400 g" is exactly twice "1 boîte de 400 g" and stays `scaled`.

- A count read from a word that names no number is not reported as exact
  arithmetic. "quelques feuilles de basilic" doubled gave six leaves marked
  `scaled`, which put the weight of arithmetic behind a reading of "quelques".
  The line comes back `rounded`, and the note says the figure is that reading
  multiplied rather than a count the page gave.

- `compare_recipes` says when no version carries a word of the dish in its
  title. One of these indexes answers almost any spelling with its closest row,
  so a dish nobody publishes came back as a doughnut recipe presented as a
  source's version of it, closing on an invitation to read it as what that
  source publishes. That invitation is now withheld in exactly that case, and
  the answer says the rows are candidates to check.

- A part of a recipe that comes back empty is reported as something this server
  read nothing from rather than as something the page does not publish. Where
  the page shows a sign of it anyway, a heading announcing that part or another
  part of the recipe that was read, the answer states that this server failed to
  read what the page carries. Where the page shows neither, the answer states
  that a page publishing nothing and a layout this reader cannot follow are
  indistinguishable from here. Both wordings close on the same warning: an empty
  ingredient list is no evidence that an ingredient is absent from the dish.
  This covers an empty method the same way. The note is only raised for a
  section that was asked for.

### Fixed

- An allergy stated with the food before the marker is read. Scoping a condition
  forwards alone reads the French order, "allergique aux noix", and misses the
  English one, so "cookies peanut allergy" searched for the nut, returned peanut
  butter and said nothing about an allergy; "pancakes, I am lactose intolerant"
  did the same with lactose. A marker now takes its food from whichever side of
  it the sentence put one: a joining word straight after it says the food
  follows, and with no such word the food is the one the marker was written onto
  the end of.

- An exclusion and the dish no longer swap places. "a dessert free of dairy"
  reported the dessert as the thing to leave out and searched for the dairy.
  "free" is read the same way as any other marker, so "free of dairy" leaves out
  the dairy and "gluten free" leaves out the gluten.

- A condition ends at the food it names. A fixed span of words let a condition
  written at the head of a question swallow the dish behind it, so "sans gluten
  gateau au chocolat" reported a recipe free of "gluten gateau au". A food's
  name now runs on only through a word that carries it into a second noun, as in
  "farine de blé", and stops everywhere else.

- A marker with a food on neither side of it is reported as a condition whose
  food was not read, rather than passing unmentioned or taking a word at random.
  Naming the wrong word hides a dish and searches for the food being avoided at
  the same time, so the answer states that a condition was set and that this
  server did not read what it covers.

- The note that says a diet was not filtered on reaches the text block. Notes
  are dropped from that block when an answer carries more than it has room for,
  and which ones could go was decided by matching their wording, so the diet
  note went with the rest and "recette vegane au foie gras" rendered pan-fried
  foie gras at the first row with nothing said about the diet. A note now
  carries whether the answer misleads without it, set where the note is written,
  and the block gives up body text before it gives up such a note.

- A comparison confronts two versions only where both titles carry the dish.
  Sharing one word of a name is what makes a row worth offering and not what
  makes it the dish, so "biscuits and gravy" put a tin of Christmas biscuits
  beside the American dish and reported their yields, their times and their
  ingredient counts as the difference between two traditions. A version whose
  title leaves a word of the dish unanswered is now named, with the words it
  does not carry and an invitation to read it as a candidate to check, and
  nothing is set side by side until every version answers to the same name.

- A bracket the line closes on is scaled with the amount it restates.
  "150 g de sucre (soit 3/4 de tasse)" doubled came back with the bracket as
  published, so the line claimed that 300 g is three quarters of a cup. A
  closing bracket that reads entirely as measures now moves with the figure it
  restates, and it is read through the word that introduces it and through the
  partitive between the number and the measure, so "soit 3/4 de tasse" is the
  same quantity as "0,75 tasse". A slash inside a bracket separates two
  statements of one quantity, and one sitting between two digits belongs to the
  fraction it writes.

- A capacity in brackets counts containers rather than measuring one out.
  "1 (14 oz) can" doubled came back as "2 (1.75 lb) can", which asks for a tin
  no shop sells and converts a quantity into another system on the way. A
  measure inside a bracket standing beside a container is what one of them
  holds: it goes back exactly as published, the count is what the factor moves,
  the container agrees with that count, and the line says which figure is
  whose.

- A bracket a French line closes on moves with the rest of the line.
  "1 demi verre de lait (10 cl)" tripled instructed the reader to take the ten
  centilitres as published while asking for three times the milk.

- A measure written in abbreviations keeps what stands behind it.
  "2 c.à.s d'huile" doubled came back as "4 cuillères à soupe", with the oil
  gone from the recipe, and "2 c.à.s + 1 c.à.c d'huile" came back as
  "4 cuillères à soupe de c.à.c d'huile". Normalising an abbreviation spells it
  as several words where the line writes one, and that difference was consuming
  words of the ingredient; the words the line wrote are now consumed until they
  match the measure. Two measures joined by a sign or a word saying they add up
  are read as one quantity, as two measures written side by side already were.

- A mass keeps the precision the arithmetic gave it. "1234 g" doubled came back
  as "2,47 kg" marked as the exact product, where the exact product is 2468 g:
  a whole number of grams was being snapped to a multiple of five, and the
  result was then read in kilos, where a hundredth of the unit is ten grams and
  every gap looks small. A whole number is what a scale shows and is left where
  the arithmetic put it, a quantity moves up to a bigger unit only where that
  unit states it as precisely, and whether a value landed exactly is judged in
  the finer of the two units.

- A mark standing in front of the amount is not the amount. A line opening on a
  bullet, a dash or a picture of the food was answered as a line carrying no
  quantity, so 200 g of cheese stayed 200 g in a doubled recipe with nothing
  said, and the mark also silenced the measure the language is read from. Such
  a mark is set aside for reading and put back for writing.

- A text block that runs out of room says what it left out. Sentences
  qualifying an answer keep their room, which leaves the result lines as the
  thing that gives way, and a list of 119 ingredients gave way to nothing at
  all in silence, which reads as a recipe needing no ingredients. A list now
  keeps its opening whatever the room allows, states how many of how many lines
  are shown, and points at the structured output for the rest. A recipe's
  ingredients and its method share what is left rather than the first of them
  filling the block.

- A length of time is no longer multiplied like an ingredient. Ingredient lists
  carry a rest, a proof or a marinade among the quantities, and "2 h de repos"
  tripled came back as "6 h de repos". A figure followed by a measure of time,
  in either language, is returned as published with a note saying that a rest
  takes as long for a large batch as for a small one.

- A word that names no number no longer produces one. "quelques feuilles de
  basilic" tripled came back as "9 feuilles de basilic", while "a few basil
  leaves" and "plusieurs feuilles de basilic" were returned as published, so
  three ways of writing the same vagueness got three answers. All three are read
  the same way now: the line carries no count, so it is repeated as published
  and flagged as carrying nothing to multiply.

- The factor stated is the factor applied. It was shortened to three decimals
  while the arithmetic was not, so `factor: 0.0001` rendered "Scaled by 0" and
  put a zero in the payload beside quantities that were not zero. Below three
  decimals the significant digits are stated instead.

- One quantity gives one answer however the page spelled it. "1234 g de farine"
  and "1 kg 234 de farine" doubled came back 32 g apart, one of them called
  exact and the other rounded, because the kilo cannot state 2468 g in the two
  decimals a kitchen reads. A measured amount now moves down to the unit that
  states it exactly, the way it already moved up only to a unit that could hold
  it, so both lines answer "2468 g de farine".

- `compare_recipes` states differences about the parts it returned. It compared
  the times of versions whose times the same answer said were not requested and
  not returned, leaving a reader with a claim they had no way to check; a
  difference is now stated only about a section the call asked for. Each
  version's yield is also written the way the rest of the answer writes one, as
  published and with the factor and the number of servings it was rescaled for,
  rather than as a bare published yield standing above a rescaled list.

- Four smaller repairs. A query carrying no letter and no digit is refused
  rather than sent, since an index handed nothing to match on answers with the
  page it shows by default and those rows came back as recipes for "!!!". A
  failure raised while reading a source is restated in this server's own words,
  with what the site said quoted and credited to it and with any advice it
  carried dropped, rather than served as this server's own sentence pointing
  somewhere this server cannot answer for. A figure glued to an ordinal ending
  is a rank rather than an amount, so "1er choix de boeuf" doubled no longer
  reads "2 er choix de boeuf". And a rewritten line keeps the case the page
  used, "1 TOMATO" tripled giving "3 TOMATOES", while a French noun in -ou takes
  the plural French gives it: three choux, not three chous.

## [1.2.0] - 2026-08-07

### Changed

- A mass stated behind the thing counted is read as the size of one of them.
  "1 dinde de 3 kg" names one bird and says what it weighs, and multiplying the
  count answered a dinner for twelve with a bird and a half. Lines of that shape
  come back as the page published them, with a note saying the figure gives a
  size and that more people means a bigger bird. A container keeps counting:
  "2 boîtes de 400 g de tomates" states what one boîte holds and goes on to name
  what is in it, and an equivalence such as "450 g (1 livre) de spaghetti"
  restates one quantity twice and is scaled on both sides.

- A comparison tells apart the two moments a source can fail in. Searching and
  then opening the version a search offered are two different readings, and a
  source missing from a comparison was described as one whose search did not
  answer whichever of the two had happened. Every row of `per_source` now
  carries a `read` field saying what became of the version that source offered,
  and the notes name the moment that failed.

- A search Marmiton answers with nothing is counted as an answer. Marmiton
  serves a 404 on its results page when no recipe matches, and reading that as a
  failed source put "Marmiton did not answer" in front of a reader for a search
  Marmiton had answered. Every other failure stays a failure, so a site that
  cannot be reached is never read as a site that holds nothing.

- A list of results carrying none of the words asked for says so. A source
  ranking a title on the letters it opens with answers "chameau farci" with a
  chapeau and a gâteau château. When no title returned carries a word of the
  query, the answer names that, and the rows read as candidates to check.

## [1.1.0] - 2026-08-07

### Changed

- The three readings a comma can take are now told apart. English groups
  thousands with it and French marks the decimal, so "1,500 g flour" is fifteen
  hundred grams and "1,500 kg de farine" is a kilo and a half. Where a line
  gives no sign which language it is in, both readings stand and they differ by
  a factor of a thousand, so the line comes back as published and says why
  rather than under a guess.

- A figure that was never a count is no longer multiplied. "4 to 5-pound
  boneless pork loin roast" describes one roast and was doubled into eight to
  ten of them, and an amount stated "par personne" or "per person" already
  carries the change the factor asks for. Both come back as the page published
  them, with a note saying which of the two it is.

- The quantity behind the word that hid it is read. "~1 cup water", "about 6
  medium lemons" and "environ 6 citrons" carried an amount that was answered as
  if the line had none, and "1 grosse pincée de sel" lost the pincée, and with it
  the fact that a pincée is held to no better than the hand. Both now read
  through to the figure and the measure, and put the word and the sign back
  where the page had them.

- HTML entities are decoded, brackets a page left empty are dropped, "recipe"
  naming another dish takes its plural on the count, and "livre" is read as the
  pound a French page glosses a weight with.

- An approximate measure lands its count on a whole one. There is no half of a
  hand: the size of one pincée is the cook's and the count is the whole of what
  the measure can say, so "1 pincée de sel" halved keeps the pincée and the line
  reports that it moved, where it answered "1/2 pincée" and called the
  arithmetic exact.

- A gousse d'ail and a clove of garlic stop at the half rather than the quarter,
  as the person who cooks these recipes has them, and a baie de genévrier and
  une étoile de badiane are counted whole.

- How finely a counted thing divides now follows the size of one of them against
  what a recipe puts in, and two families come out of that one comparison. Each
  family is read in both languages, because where a food falls on that
  comparison has nothing to do with the words a page uses for it.
- A crevette and a shrimp, a gamba, a langoustine, a moule and a mussel, a
  noisette and a hazelnut, a grain de poivre and a peppercorn, a baie de
  genièvre and a juniper berry, an anis étoilé and a star anise are counted
  whole. Each one is already a portion: a recipe counts five, twelve, twenty of
  them, and a smaller recipe puts one fewer in the pan. `12 crevettes` halved
  gave `6 crevettes` and still does, but `5 crevettes` halved gave
  `2 1/2 crevettes` where it now gives `3 crevettes`, and `1 hazelnut` halved
  gave `1/2 hazelnut` where it now keeps the hazelnut.
- Un gigot and a leg of lamb, une baguette, un camembert, un fromage and a
  cheese, un chorizo, un ananas and a pineapple, une pêche and a peach, un
  abricot and an apricot, un lait and a milk counted without a measure divide as
  far as the quarter. A recipe asks for one or for two, and the share it wants
  is decided by a knife. `1 gigot d'agneau` reduced to a quarter was clamped up
  to `1/2 gigot` and the line was told it no longer held its share; it now comes
  back as `1/4 gigot d'agneau`, exact.
- Un jus, and a juice, stops at the half, where it used to follow the fruit it
  names down to the quarter. Half the jus of a citron is taken by squeezing half
  the fruit, and a quarter of one has to be poured out and measured back, so
  `1 jus de citron` reduced to a quarter comes back as `1/2 jus de citron`.
- A counted thing coming down to one now takes the singular of its name.
  `2 clous de girofle` halved read `1 clous de girofle` and `2 kiwis` read
  `1 kiwis`, because a final -s was taken for the ending of a singular such as
  "jus" or "couscous". Both languages now name those words one by one, so the
  two lines read `1 clou de girofle` and `1 kiwi`, while `2 ananas` reads
  `1 ananas` and `1 asparagus` is left as it is. "anise" and "musk" read the
  same whatever the number, so `8 star anise` halved gives `4 star anise`, and
  an "étoilé" following the noun agrees with it in the same pass.
- A clou de girofle and a zeste are counted whole. `3 clous de girofle` halved
  came back as `1 1/2 clou`, and `1 zeste de citron` halved as `1/2 zeste`.
  Neither names an amount: a clou is a dried bud dropped into the pot and fished
  back out, and a zeste is what comes off one fruit in one go. They now land on
  a whole number, as an oeuf does.
- A pot, a bouteille, a bottle, a jar and a block divide as far as the quarter.
  All five stopped at the half, so `1 pot de crème fraîche` reduced to a quarter
  was clamped up to `1/2 pot` and the line was told it no longer held its share.
  Each holds enough that a quarter is still a portion someone serves, so the
  answer is now `1/4 pot de crème fraîche`, exact. The word is read wherever it
  stands, so `1 petit pot de crème` gets the same floor.
- Une tranche and a slice divide as far as the quarter. Each is already cut off
  something larger, and the board that produced one takes a corner off it in the
  same gesture, so a quarter of a tranche de pain is a crouton.
- Une pastèque and a watermelon, une pintade and a guinea fowl, un poulet and a
  chicken, un poireau and a leek, une banane and a banana, une mangue and a
  mango, un rôti and a roast, un avocat, un reblochon and une bûche divide as
  far as the quarter, joining the gigot and the ananas. `1 pastèque` and
  `1 watermelon` reduced to a quarter were clamped up to a half and the line was
  told it no longer held its share; each now comes back as `1/4`, exact.
- Une cuisse, une aile, un pilon, une escalope, un magret, a thigh, a drumstick,
  a wing and a cutlet stop at the half, joining the blanc and the breast. One of
  them is the portion the knife carving the animal already produced, and a
  quarter of one names a piece no one plates. This is what keeps
  `3 cuisses de poulet` at a half now that the whole poulet goes to the quarter.
- `clove` is read on the line that writes it, having named two foods with one
  answer between them. Garlic in the line makes it the gousse d'ail, which a
  knife splits in two, so `4 cloves garlic, minced` reduced to a quarter reads
  `1 clove garlic, minced`. On its own, or written `whole cloves`, it is
  the clou de girofle dropped into the pot and fished back out: nothing about it
  is measured, so `4 whole cloves` halved reads `2 whole cloves` where it read
  `1 whole clof`. The French words need none of this, each naming one food and
  one only.
- A zest is counted whole, as a zeste is. `1 lemon zest` halved came back as
  half of one, and a zest is what comes off one fruit in one go, so a share of
  one names no amount a cook stops at.
- An English plural in -ves is turned back into its singular only for the names
  that carry a -f or a -fe, which are listed one by one. `4 olives` halved read
  `2 olives` and `1 olive` read `1 olif`.
- A dozen, and a douzaine, states a number of things rather than a measure of
  them. `2 dozen mushrooms` reduced by a quarter came back as
  `1 1/2 dozen mushrooms`, a count no kitchen works with, and the divisibility
  of the line was being read off a word that names no food. The multiplier is
  now folded into the count: the same line comes back as `18 mushrooms`, and it
  divides the way a mushroom does. A line writing the count as a word,
  `a dozen eggs`, is read the same way where it used to carry no quantity.
- A blanc is divided by which blanc the line names. `1 blanc de poulet` halved
  came back whole, because the reading meant for the white of an oeuf was
  catching every blanc introduced the same way. The white of an oeuf stays
  whole, with the oeuf and the jaune; a blanc de poulet or de dinde is meat and
  halves, as a chicken breast does.
- `ea` no longer appears in the line that is written back. It is short for
  "each", a marker announcing that the figure counts pieces, and it names no
  measure of any one of them, so `3 ea. tamarind pods` tripled read
  `9 ea tamarind pods` where it now reads `9 tamarind pods`. The count is
  unchanged, and the divisibility now comes from the thing counted, so
  `1 ea. onion` goes to a quarter and `12 ea. eggs` lands on a whole number.

### Fixed

- A French produce name opening on an accent is recognised again. A word
  boundary sits between ASCII letters, so the pattern never matched at the start
  of "échalote", and a shallot reduced to a quarter was clamped up to a half and
  told it no longer held its share. The name is now read with its accents folded
  away, so it comes back as "1/4 échalote", exact.

- A second quantity left at its published size is reported on a French line. The
  vocabulary is keyed without accents and the line writes "cuillère à soupe" with
  them, so the sentence was never reached.

- Rounding happens in the smaller of the two units when the answer moves to a
  bigger one, so a promotion no longer costs precision the page had.

## [1.0.0] - 2026-02-06

First release.

### Added

- `search_recipes`: asks every registered source at the same time and returns one
  merged list. Every row carries an identifier naming the source it came from.
  Rows alternate one source at a time, and the answer says how the order was
  built.
- `get_recipe`: reads one recipe from the source its identifier names, optionally
  rescaled to a number of servings. Sections are opt-in and the omitted ones are
  named, a raw identifier is routed by its shape and the answer says how, and a
  page stating no yield comes back as published with the reason.
- `scale_ingredients`: multiplies a list a caller already holds, offline, with no
  request to any site. Reads French and English lines in one call, each in its
  own language.
- `compare_recipes`: takes a dish, reads each source's closest version, rescales
  them all to the same yield, and states what differs between them. Where the
  versions agree, it says nothing.
- A bilingual scaler. An egg stays whole and anything that pours, weighs or cuts
  can halve, a measurement moves to a smaller unit before it is rounded, an
  approximate measure has its count multiplied while the size of one stays the
  cook's, and every branch of a line offering a choice is scaled. Each line
  reports whether the arithmetic was exact, rounded, or impossible.
- Argument names checked rather than filtered. Every tool refuses an argument it
  does not declare, under the `invalid_input` code, naming the argument and
  offering the declared name when one is close: `limit` on `search_recipes` is
  refused and answered with `limit_per_source`. The schema each tool publishes
  carries `additionalProperties: false`, so a client reads the rule before it
  calls. A name that is read and dropped costs a caller an answer computed on
  the defaults and presented as an answer to what they asked.
- Per-source reporting on every tool that calls out: which sources answered,
  which failed and why, and what each source's own count means in its own
  terms.
- A published client entry point (`mcp-recipes/client`) and a published scaler
  entry point (`mcp-recipes/scale`), both usable as plain libraries with no
  protocol attached.
- Pacing with a floor that configuration cannot go below, and a User-Agent that
  always carries a way to reach a human.
- A source registry, so adding a corpus is an adapter and an entry rather than a
  branch in every tool.
- A nightly canary against the real sites, which opens an issue when one of them
  changes something this server reads.

[1.1.0]: https://github.com/smeet666/mcp-recipes/releases/tag/v1.1.0
[1.0.0]: https://github.com/smeet666/mcp-recipes/releases/tag/v1.0.0
