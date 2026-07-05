# Blind Validation30 Input Validation

- candidates CSV parse: ok
- human notes JSON parse: ok
- candidate_n: 30
- notes_n: 30
- completed_n: 30
- total_n: 30
- aligned_n: 30
- parseable_human_range_n: 27

## Alignment Issues

_None._

## Missing Or Abnormal Fields

| caseId  | pid  | name                    | missing_or_blank                   |
| ------- | ---- | ----------------------- | ---------------------------------- |
| BV30-01 | 204  | De'Aaron Fox            | human_min_m;human_max_m            |
| BV30-02 | 1335 | Jaden Ivey              | human_min_m;human_max_m;confidence |
| BV30-03 | 14   | Kyle Anderson           | human_min_m;human_max_m;confidence |
| BV30-04 | 1818 | Mark Williams           | human_min_m;human_max_m;confidence |
| BV30-05 | 468  | Jamal Murray            | human_min_m;human_max_m;confidence |
| BV30-06 | 1384 | Georgios Kalaitzakis    | human_min_m;human_max_m;confidence |
| BV30-07 | 462  | Emmanuel Mudiay         | human_min_m;human_max_m;confidence |
| BV30-08 | 102  | Clint Capela            | human_min_m;human_max_m;confidence |
| BV30-09 | 1434 | Didi Louzada            | human_min_m;human_max_m;confidence |
| BV30-10 | 1311 | Aaron Holiday           | human_min_m;human_max_m;confidence |
| BV30-11 | 865  | Bilal Coulibaly         | human_min_m;human_max_m            |
| BV30-12 | 1406 | Christian Koloko        | human_min_m;human_max_m;confidence |
| BV30-13 | 1200 | Justin Edwards          | human_min_m;human_max_m;confidence |
| BV30-14 | 8    | Jarrett Allen           | human_min_m;human_max_m;confidence |
| BV30-15 | 447  | Malik Monk              | human_min_m;human_max_m;confidence |
| BV30-16 | 210  | Markelle Fultz          | human_min_m;human_max_m;confidence |
| BV30-17 | 116  | Marquese Chriss         | human_min_m;human_max_m;confidence |
| BV30-18 | 1802 | Cam Whitmore            | human_min_m;human_max_m            |
| BV30-19 | 530  | Otto Porter Jr.         | human_min_m;human_max_m;confidence |
| BV30-20 | 1634 | Zaccharie Risacher      | human_min_m;human_max_m            |
| BV30-21 | 906  | Ayo Dosunmu             | human_min_m;human_max_m;confidence |
| BV30-22 | 567  | Terry Rozier            | human_min_m;human_max_m;confidence |
| BV30-23 | 1699 | Nick Smith Jr.          | human_min_m;human_max_m            |
| BV30-24 | 1197 | Anthony Edwards         | human_min_m;human_max_m            |
| BV30-25 | 741  | RJ Barrett              | human_min_m;human_max_m;confidence |
| BV30-26 | 219  | Paul George             | human_min_m;human_max_m;confidence |
| BV30-27 | 1250 | Shai Gilgeous-Alexander | human_min_m;human_max_m;confidence |
| BV30-28 | 347  | Luke Kennard            | human_min_m;human_max_m;confidence |
| BV30-29 | 108  | Willie Cauley-Stein     | human_min_m;human_max_m;confidence |
| BV30-30 | 1780 | Kel'el Ware             | human_min_m;human_max_m            |

## Human Range Parse Notes

| caseId  | pid  | name                    | status             | source                               | role_note                                                                                                   | parsed_min_m | parsed_max_m |
| ------- | ---- | ----------------------- | ------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------ | ------------ |
| BV30-01 | 204  | De'Aaron Fox            | parsed_role_note   | role_note:n-n                        | 16-24                                                                                                       | 16           | 24           |
| BV30-02 | 1335 | Jaden Ivey              | parsed_role_note   | role_note:n-n                        | 25-33                                                                                                       | 25           | 33           |
| BV30-03 | 14   | Kyle Anderson           | parsed_role_note   | role_note:底薪->minContractForPlayer | 底薪                                                                                                        | 3.71         | 3.71         |
| BV30-04 | 1818 | Mark Williams           | parsed_role_note   | role_note:n-n                        | 2-4，我觉得，如果给的时间多一点的话能拿多点。只是他现在确实没有时间。只不过在有限出场时间内打的是很不错的。 | 2            | 4            |
| BV30-05 | 468  | Jamal Murray            | parsed_role_note   | role_note:n-n                        | 16-24                                                                                                       | 16           | 24           |
| BV30-06 | 1384 | Georgios Kalaitzakis    | parsed_role_note   | role_note:n-n                        | 16-24                                                                                                       | 16           | 24           |
| BV30-07 | 462  | Emmanuel Mudiay         | parsed_role_note   | role_note:n-n                        | 8-14                                                                                                        | 8            | 14           |
| BV30-08 | 102  | Clint Capela            | parsed_role_note   | role_note:底薪->minContractForPlayer | 底薪                                                                                                        | 3.71         | 3.71         |
| BV30-09 | 1434 | Didi Louzada            | parsed_role_note   | role_note:n-n                        | 8-14                                                                                                        | 8            | 14           |
| BV30-10 | 1311 | Aaron Holiday           | parsed_role_note   | role_note:n-n                        | 6-10                                                                                                        | 6            | 10           |
| BV30-11 | 865  | Bilal Coulibaly         | parsed_role_note   | role_note:n-n                        | 8-20                                                                                                        | 8            | 20           |
| BV30-12 | 1406 | Christian Koloko        | parsed_role_note   | role_note:n-n                        | 3-6                                                                                                         | 3            | 6            |
| BV30-13 | 1200 | Justin Edwards          | parsed_role_note   | role_note:n-n                        | 4-8                                                                                                         | 4            | 8            |
| BV30-14 | 8    | Jarrett Allen           | parsed_role_note   | role_note:n-max                      | 34-max                                                                                                      | 34           | 46.4         |
| BV30-15 | 447  | Malik Monk              | parsed_role_note   | role_note:max                        | max                                                                                                         | 46.4         | 46.4         |
| BV30-16 | 210  | Markelle Fultz          | parsed_role_note   | role_note:n-n                        | 16-24                                                                                                       | 16           | 24           |
| BV30-17 | 116  | Marquese Chriss         | parsed_role_note   | role_note:n-n                        | 10-18                                                                                                       | 10           | 18           |
| BV30-18 | 1802 | Cam Whitmore            | parsed_role_note   | role_note:n-n                        | 8-16                                                                                                        | 8            | 16           |
| BV30-19 | 530  | Otto Porter Jr.         | parsed_role_note   | role_note:n-n                        | 10-16                                                                                                       | 10           | 16           |
| BV30-20 | 1634 | Zaccharie Risacher      | unparsed_role_note | role_note:unparsed                   | 太年轻了，新秀不会有20岁这么高高潜力的球员流入到市场中                                                      |              |              |
| BV30-21 | 906  | Ayo Dosunmu             | parsed_role_note   | role_note:n-n                        | 27-39                                                                                                       | 27           | 39           |
| BV30-22 | 567  | Terry Rozier            | parsed_role_note   | role_note:n-n                        | 18-30                                                                                                       | 18           | 30           |
| BV30-23 | 1699 | Nick Smith Jr.          | unparsed_role_note | role_note:unparsed                   | 依旧和之前一样的原因，不会有这么年轻的球员来，所以不太好判断。我说实话.                                     |              |              |
| BV30-24 | 1197 | Anthony Edwards         | parsed_role_note   | role_note:n-n                        | 25-35                                                                                                       | 25           | 35           |
| BV30-25 | 741  | RJ Barrett              | parsed_role_note   | role_note:n-n                        | 25-35                                                                                                       | 25           | 35           |
| BV30-26 | 219  | Paul George             | parsed_role_note   | role_note:n-n                        | 12-20                                                                                                       | 12           | 20           |
| BV30-27 | 1250 | Shai Gilgeous-Alexander | parsed_role_note   | role_note:n-n                        | 14-22                                                                                                       | 14           | 22           |
| BV30-28 | 347  | Luke Kennard            | parsed_role_note   | role_note:n-n                        | 28-38                                                                                                       | 28           | 38           |
| BV30-29 | 108  | Willie Cauley-Stein     | parsed_role_note   | role_note:n-n                        | 4-8                                                                                                         | 4            | 8            |
| BV30-30 | 1780 | Kel'el Ware             | unparsed_role_note | role_note:unparsed                   | 和之前那几个年轻人的总结结论一样                                                                            |              |              |

## Scope

This run is artifact-only eval. It reads candidates and human notes, writes only blind_validation30_eval artifacts, and does not modify formal src or tier scoring code.
