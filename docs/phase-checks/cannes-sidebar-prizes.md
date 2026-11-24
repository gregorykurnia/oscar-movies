# Cannes sidebar prizes

## 13.2 · Historical import

Imported 87 winning results across seven prizes and added 27 film records. Every winner has an IMDb ID. The first offline pass hit a missing film lookup. The cache-backed pass fetched the missing records, and the final offline replay made zero network requests and reproduced the same data diff.

### Second-source comparison

The Cannes year articles supplied the results. The five prize histories below supplied the second record. Each comparison resolved the second article's film link through Wikidata and compared IMDb IDs. The [winner test fixture](../../scripts/research/sources/cannes-sidebar-winners.json) records all 87 accepted IDs and the 18 empty prize-years.

- UCR Prize and Jury Prize covered by [Un Certain Regard](https://en.wikipedia.org/wiki/Special:PermanentLink/1386194360).
- Both critics' prizes covered by the French [Cannes FIPRESCI prize history](https://fr.wikipedia.org/wiki/Special:PermanentLink/240393734).
- Critics' Week Grand Prize covered by [Critics' Week](https://en.wikipedia.org/wiki/Special:PermanentLink/1375933720).
- Directors' Fortnight Audience Award covered by [Directors' Fortnight](https://en.wikipedia.org/wiki/Special:PermanentLink/1385617027).
- Ecumenical Jury prize covered by [Prize of the Ecumenical Jury](https://en.wikipedia.org/wiki/Special:PermanentLink/1386197884).

| Year | UCR Prize | UCR Jury Prize | FIPRESCI Competition | FIPRESCI UCR | Critics' Week Grand Prize | Fortnight Audience Award | Ecumenical Jury |
|---|---|---|---|---|---|---|---|
| 2012 | agrees | agrees | agrees | agrees | agrees | no second source | agrees |
| 2013 | agrees | agrees | agrees | agrees | agrees | no second source | agrees |
| 2014 | agrees | agrees | agrees | agrees | agrees | no second source | agrees |
| 2015 | agrees | agrees | agrees | agrees | agrees | no second source | agrees |
| 2016 | agrees | agrees | agrees | agrees | agrees | no second source | agrees |
| 2017 | agrees | agrees | agrees | agrees | agrees | no second source | agrees |
| 2018 | agrees | agrees | agrees | agrees | agrees | no second source | agrees |
| 2019 | agrees | differs: history also lists Liberté¹ | agrees | agrees | agrees | no second source | agrees |
| 2021 | agrees | agrees | agrees | agrees | agrees | no second source | agrees |
| 2022 | agrees | agrees | agrees | agrees | agrees | no second source | agrees |
| 2023 | agrees | agrees | agrees | agrees | agrees | no second source | agrees |
| 2024 | agrees | agrees | agrees | agrees | agrees | agrees | agrees |
| 2025 | agrees | agrees | agrees | agrees | agrees | agrees | agrees |
| 2026 | agrees | differs: history also lists Iron Boy² | agrees | agrees | agrees | agrees | agrees |

1. The 2019 import follows the year article and official Cannes record, which give the Jury Prize to *Fire Will Come* and the separate Special Jury Prize to *Liberté*. [Cannes 2019 awards](https://www.festival-cannes.com/en/retrospective/2019/palmares/)
2. The 2026 import follows the year article and official Cannes record, which give the Jury Prize to *Elephants in the Fog* and the separate Special Jury Prize to *Iron Boy*. [Cannes 2026 Un Certain Regard awards](https://www.festival-cannes.com/en/press/press-releases/un-certain-regard-winners-list-2026/)

In 2012 both records give *Le grand soir* the sole prize carrying the Jury Prize name, then called the Special Jury Prize. The existing classifier maps that historical label to UCR Jury Prize. The seven imported categories had zero ties. [Cannes 2012 Un Certain Regard awards](https://www.festival-cannes.com/en/2012/un-certain-regard-2012-awards/)

The Fortnight cells with “no second source” have no result to compare. The prize began in 2024, so the empty Fortnight years are 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022 and 2023. [Directors' Fortnight audience award history](https://www.quinzaine-cineastes.fr/en/news/peoples-choice-55)

All seven prize rows are absent in 2020. Cannes cancelled the festival and announced an Official Selection. The autumn event gave prizes in the short film and Cinéfondation competitions. [Cannes festival history](https://www.festival-cannes.com/en/the-festival/the-history-of-the-festival/), [2020 autumn event](https://www.festival-cannes.com/en/press/press-releases/the-2020-official-selection-across-the-world/)

### Film identities

- The 2013 Critics' Week year line needed an explicit link. Title, release year and the two directors, Fabio Grassadonia and Antonio Piazza, led to *Salvo* (IMDb `tt1971514`). [Wikidata Q13553892](https://www.wikidata.org/wiki/Q13553892), [IMDb film record](https://www.imdb.com/title/tt1971514/)
- The 2021 Critics' Week year line needed an explicit link. Title, release year and director Omar El Zohairy led to *Feathers* (IMDb `tt14805128`). Several Wikidata items had the same IMDb ID. The source override uses the item linked to the English film article. [Wikidata Q108937887](https://www.wikidata.org/wiki/Q108937887), [Critics' Week film record](https://www.semainedelacritique.com/en/edition/2021/movie/feathers)
- The 2015 year article's *Mia Madre* and the imported *My Mother* share IMDb `tt3013610`. The new film record uses Italian as its primary language. It also has English dialogue. [Cannes film record](https://www.festival-cannes.com/en/f/mia-madre/), [New York Film Festival film record](https://www.filmlinc.org/films/mia-madre/)

### Skipped year-page lines

Reviewed all 218 lines from the classifier's 13.1 skip report. The counts include nested mentions and continuation lines.

| Year-page heading | Lines | What the lines name |
|---|---:|---|
| Un Certain Regard | 60 | Acting, directing, screenplay, first-film, ensemble and talent awards. Also Special Distinction, Special Prize, the Promising Future prizes, Poetry of Cinema, Coup de Cœur, Courage, Originality, Freedom, New Voice, Youth and Special Mentions. *Liberté* and *Iron Boy* are the two separate Special Jury Prizes above. The shared 2024 directing prize belongs to the directing award. |
| FIPRESCI Prize / FIPRESCI Prizes | 14 | Each names the third critics' prize for Critics' Week, Directors' Fortnight, or the parallel sections and their first features. |
| Critics' Week | 68 | France 4 Visionary, SACD, ACID/CCAS, Special Mention, Discovery and Canal+ shorts, Gan distribution, Louis Roederer rising-star and French Touch jury awards. The 22 blank parsed labels have full award names in their text and are French Touch, Gan, Leitz, Roederer or Canal+ lines. |
| Directors' Fortnight | 61 | Art Cinema, Europa Cinemas Label, SACD, Illy shorts, their special mentions and the Carrosse d'Or/Golden Coach career honor. The four blank parsed labels are three Golden Coach honors and a SACD prize. |
| Prize of the Ecumenical Jury | 15 | Special mentions and commendations, including the two 2013 continuation lines for *Miele* and *Like Father, Like Son*. |

### Test load

The initial test dry run planned 121 inserts (7 categories, 27 films and 87 results across 14 editions). It had zero updates, removals or screening writes. The file diff also preserved every existing Cannes result and screening and every existing movie record.

- `npm run data:check` passed. The existing warning is that *Disposable Humanity* in 2025 has no country.
- The test branch committed all 121 inserts in one transaction and recomputed 301 accuracy categories and 2,369 prediction rows. The test cache revalidation endpoint returned HTTP 404 after the commit.
- The second `npm run load -- --target test --dry-run` planned zero writes. `npm run race:check -- --target test` confirmed the test branch matches the files.
- Comparing the pre-load race calculation to the stored post-load predictions found zero added or dropped contender rows. The existing International race narrows the field to Oscar lists as they become available. The current season already has submissions.
