# V3-AB Blind Validation 30 Selection Report

This is a blind validation/test set, not a calibration set. Do not tune rules while labeling.

## Summary

- Total selected: 30
- Random seed: 20260705
- Excluded prior labeled/development players by pid/name from boundary40, validation20, and existing comparable eval artifacts.
- Excluded pids count: 60
- Excluded names count: 60
- Candidate pool after exclusion: 406
- Diversity guard: max 3 players per team where possible; position groups monitored during greedy selection.
- This is not pure random because pure random over all active players over-samples minimum/fringe players. It is stratified to cover high-end, starter, rotation, and low-salary cases.
- User should label blind first because debug/model fields can anchor the human estimate.

## Hidden Stratum Counts

| hidden stratum            | count |
| ------------------------- | ----: |
| elite_maxish              |     3 |
| high_end_rotation_v3_ab   |     5 |
| low_end_starter_retained  |     5 |
| low_salary_minimum_fringe |     4 |
| mid_rotation_mixed        |     5 |
| solid_starter_v3_ab       |     4 |
| young_proven_high_starter |     4 |

## Requested Quotas

| hidden stratum            | quota | purpose                                                                   |
| ------------------------- | ----: | ------------------------------------------------------------------------- |
| elite_maxish              |     3 | Validate that top-end/max-ish asks are not materially low/high.           |
| young_proven_high_starter |     4 | Validate the 17%-22.5% neighborhood for young/high starters.              |
| solid_starter_v3_ab       |     4 | Blind check of the temporary 12%-17% V3-AB SOLID_STARTER lane.            |
| low_end_starter_retained  |     5 | Check whether the remaining low-end starters are still priced reasonably. |
| high_end_rotation_v3_ab   |     5 | Blind check of the temporary 7%-12% V3-AB high-end rotation lane.         |
| mid_rotation_mixed        |     5 | Check mid-rotation players not lifted by V3-AB.                           |
| low_salary_minimum_fringe |     4 | Keep a small low-end sanity sample without dominating the set.            |

## Shortfalls / Fallbacks

No quota shortfalls.

## Per-Team Counts

| team | count |
| ---- | ----: |
| BKN  |     2 |
| BOS  |     1 |
| CHA  |     1 |
| CHI  |     1 |
| DEN  |     2 |
| DET  |     1 |
| GSW  |     1 |
| HOU  |     2 |
| LAC  |     1 |
| MEM  |     1 |
| MIL  |     1 |
| MIN  |     1 |
| NOL  |     1 |
| NYK  |     1 |
| OKC  |     2 |
| ORL  |     2 |
| PHI  |     1 |
| SA   |     2 |
| SAC  |     1 |
| UTA  |     2 |
| WAS  |     3 |

## Age Distribution

| age group | count |
| --------- | ----: |
| 24-27     |    11 |
| 28-31     |     8 |
| 32+       |     4 |
| age<=23   |     7 |

## Position Distribution

| position group | count |
| -------------- | ----: |
| big            |     6 |
| forward        |    11 |
| guard          |    13 |

## Height Distribution

| height group | count |
| ------------ | ----: |
| height<45    |    13 |
| height>=65   |     6 |
| height45-54  |     7 |
| height55-64  |     4 |

## Selected Cases

| case    | name                    | team | age | pos | hidden stratum            |
| ------- | ----------------------- | ---- | --: | --- | ------------------------- |
| BV30-01 | De'Aaron Fox            | SAC  |  28 | PG  | solid_starter_v3_ab       |
| BV30-02 | Jaden Ivey              | GSW  |  23 | SG  | young_proven_high_starter |
| BV30-03 | Kyle Anderson           | WAS  |  32 | F   | low_salary_minimum_fringe |
| BV30-04 | Mark Williams           | OKC  |  24 | C   | low_salary_minimum_fringe |
| BV30-05 | Jamal Murray            | DEN  |  28 | G   | solid_starter_v3_ab       |
| BV30-06 | Georgios Kalaitzakis    | LAC  |  26 | SF  | high_end_rotation_v3_ab   |
| BV30-07 | Emmanuel Mudiay         | DEN  |  29 | PG  | high_end_rotation_v3_ab   |
| BV30-08 | Clint Capela            | HOU  |  31 | C   | low_salary_minimum_fringe |
| BV30-09 | Didi Louzada            | SA   |  26 | GF  | low_end_starter_retained  |
| BV30-10 | Aaron Holiday           | NOL  |  29 | PG  | high_end_rotation_v3_ab   |
| BV30-11 | Bilal Coulibaly         | ORL  |  21 | SF  | mid_rotation_mixed        |
| BV30-12 | Christian Koloko        | UTA  |  25 | C   | low_salary_minimum_fringe |
| BV30-13 | Justin Edwards          | BKN  |  22 | SF  | mid_rotation_mixed        |
| BV30-14 | Jarrett Allen           | BKN  |  27 | C   | elite_maxish              |
| BV30-15 | Malik Monk              | CHA  |  27 | SG  | elite_maxish              |
| BV30-16 | Markelle Fultz          | PHI  |  27 | G   | solid_starter_v3_ab       |
| BV30-17 | Marquese Chriss         | MIL  |  28 | PF  | low_end_starter_retained  |
| BV30-18 | Cam Whitmore            | NYK  |  21 | SF  | mid_rotation_mixed        |
| BV30-19 | Otto Porter Jr.         | WAS  |  32 | F   | low_end_starter_retained  |
| BV30-20 | Zaccharie Risacher      | ORL  |  20 | SF  | mid_rotation_mixed        |
| BV30-21 | Ayo Dosunmu             | HOU  |  25 | SG  | young_proven_high_starter |
| BV30-22 | Terry Rozier            | BOS  |  31 | G   | solid_starter_v3_ab       |
| BV30-23 | Nick Smith Jr.          | UTA  |  21 | SG  | high_end_rotation_v3_ab   |
| BV30-24 | Anthony Edwards         | MIN  |  24 | SG  | young_proven_high_starter |
| BV30-25 | RJ Barrett              | CHI  |  25 | GF  | young_proven_high_starter |
| BV30-26 | Paul George             | WAS  |  35 | GF  | low_end_starter_retained  |
| BV30-27 | Shai Gilgeous-Alexander | OKC  |  27 | G   | low_end_starter_retained  |
| BV30-28 | Luke Kennard            | DET  |  29 | SG  | elite_maxish              |
| BV30-29 | Willie Cauley-Stein     | MEM  |  32 | C   | high_end_rotation_v3_ab   |
| BV30-30 | Kel'el Ware             | SA   |  21 | C   | mid_rotation_mixed        |
