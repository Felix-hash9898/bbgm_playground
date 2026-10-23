# BBGM Rotation — Independent Holistic Decision Review

**Review date:** 2026-10-23  
**Research baseline:** `ac9345383dcf4fe555a121cfe6bbe9bfb1b8cf54`  
**Fixed candidate:** `755f0c2bfa63565c3787307816c45efb0b021bb2`  
**Decision:** **HOLD — do not approve formal integration yet.** The current evidence does not show broad performance harm, but the exact Review Code Package v1.1 is unavailable and four retained behavioral tests still encode unresolved product contracts. Do not change those assertions to make the candidate green.

## Executive findings

1. **Core/Depth are not broadly inert.** In same-roster, same-input tests, healthy Auto produced nine distinct plans for nine profiles in every tested team and information mode. Healthy Custom remained exactly fixed across all nine profiles, as it should. During injury redistribution, both settings changed output in many configurations; Locks and valid Current Overrides constrained those changes. The earlier 0.08 Long-minus-Short statistic mixed unlike situations and was not a causal test.
2. **The AI point-differential decline is not an independent AI-loss signal.** Across each paired full season, the sum of all 30 teams' point-differential changes is zero; the controlled-team and AI group changes are algebraic complements. Wins also sum to a fixed league total. The two-by-two fixed-opponent GameSim crossover showed mixed directions by matchup, not a general AI-specific decline.
3. **There is no credible evidence of broad long-term deterioration.** The 96 existing multi-team season pairs are mixed-to-positive for the controlled teams and show lower low-energy exposure and fewer 40+ minute player-games in every profile cell. The 40-season NYK mean is −1.05 wins (95% CI −2.85 to +0.75); the −14-win outlier co-occurred with a much worse random injury path and is consistent with ordinary paired-season variability. This does not rule out moderate team-specific effects.
4. **The two original mechanisms remain improved in their known fixtures, not proven universally fixed.** The fixed candidate preserved the earlier LAL 0→1 and rank-swap improvements and reduced the known IND/ORL reserve overloads. This review reused those prior cases rather than repeating the large runs. The current factorial adds broader same-roster evidence but only three real roster matchups.
5. **Four semantic tests remain red.** Their current failures reproduce on the exact candidate. They do not establish four separate GameSim safety defects; they expose unresolved policy choices about zero-minute Custom reserves, Short's preferred size, and a fixed weak-reserve cap. The assertions remain unchanged. A separate 5-second test timeout passed when rerun alone with a 60-second timeout.
6. **No merge approval.** Continue only after the project supplies the v1.1 review package and decides whether a healthy Custom zero is merely a baseline preference or a hard DNP during injury cover. The isolated 3/9 Rated Long-versus-Short reserve-count reversal is low impact in these cases, but should be addressed by a behavior-level expectation rather than a fixed headcount.

## Review basis and evidence types

**Verified facts:** exact commit/tree, source paths, test results below, archived raw season summaries, and the new 5,328 full `GameSim.run()` calls.  
**Interpretation:** basketball-quality and UI-preference judgments, explicitly identified as such.  
**Unknown:** events in the unavailable original League Save, rare roster/season combinations, and whether the product intends a zero-minute Custom entry to prohibit all injury promotion.

The requested `review-code-package-v1.1.md` was checked at the repository root on the fixed candidate and returned 404. The available archived package is v1. I therefore cannot claim literal v1.1 compliance. This review applies the user-provided Goal-First, System-Wide, Independent, Adversarial and Decision-Relevance principles, and records the missing protocol as an approval limitation.

No formal `main`, live League Save, candidate source, or existing candidate commit was edited. The new experiment harness stayed in the research worktree. This document is a report-only child of the fixed candidate on a separate review branch.

## Same-roster Core × Depth experiment

### Design

- Real 2024 BBGM player/roster snapshots: BOS–NYK, ORL–IND, MIN–DEN.
- Main: `ac9345383dcf4fe555a121cfe6bbe9bfb1b8cf54`; candidate: `755f0c2bfa63565c3787307816c45efb0b021bb2`.
- All nine High/Balanced/Low × Short/Normal/Long profiles were run for each team in Rated and Challenge No Ratings.
- Four conditions were kept separate: healthy Auto; healthy Custom; Custom with the top three positive healthy-plan players injured; and that same injury state with two healthy players protected by Lock plus one valid Current Override pin at 5 minutes.
- Each cell used the same roster, healthy Custom plan, unavailable players, pin/Lock input, and 12 seeds (`202610230`–`202610241`) for both allocation policies. GameSim was the production `GameSim.run()` with its normal possession, dynamic substitution, foul, fatigue, overtime and score logic. The three pregame injuries were fixed and `baseInjuryRate=0` isolated the one-game allocation effect from new stochastic injuries.
- The allocator output was injected as the target minutes for both sides; the GameSim engine itself was held constant. Thus these games isolate rotation-plan consequences, not other candidate engine changes. The 144 crossover games used seeds `202619000`–`202619011`, injured the top three healthy-plan players on both teams, and crossed Main/Main, Candidate/Candidate, Main/Candidate, Candidate/Main.
- 432 factorial cells × 12 games = 5,184 full games; plus 144 crossover games = **5,328**. Per-seed scores, target/actual minutes, player positions, energy and lineups are in the raw research result. The score seeds are reproducible PRNG seeds, but changing a rotation changes random-number consumption; they are not possession-by-possession paired outcomes.

### What the factor test establishes

| Situation | Observed effect | Decision-relevant reading |
|---|---|---|
| Healthy Auto | 9/9 distinct target vectors per roster in all three teams and both information modes. Core and Depth pairwise profile changes were 9/9. Candidate and Main health-Auto targets matched. | Core/Depth settings are active in Auto. They are preferences, not fixed player-count rules. |
| Healthy Custom | Exactly one target vector across all nine profiles for every roster and information mode; Main and Candidate match. | Correct preservation of the user's saved Custom plan. The 0.08 season statistic could not have tested this separately. |
| Injured Custom, Rated | Candidate had 6/9, 9/9, and 6/9 unique profiles for BOS, ORL, and MIN; all 27/27 Core comparisons and 21/27 Depth comparisons changed a target vector. | Core/Depth operate under injuries but effects depend on roster, ability and injuries. The six unchanged Depth pairs are conditional preferences, not proof of global failure. |
| Injured Custom, No Ratings | All 9/9 profiles were distinct for each team; both Main and Candidate had 27/27 Core and 27/27 Depth pairs change. | The planning path remains responsive without exposing hidden ratings. |
| Injured Custom with Locks and pin, Rated | Candidate had 3/9, 9/9, and 5/9 unique plans for BOS, ORL, MIN; Locked/pinned choices suppressed many differences. All 108 tested allocations across arms and information modes obeyed Lock caps and the exact 5-minute pin; no infeasible allocation or override error was reported. | A hard user constraint can properly remove the remaining setting freedom. The UI preference should not override a pin or protection. |
| Injured Custom with Locks and pin, No Ratings | 9/9 unique profiles in each team. | The profile remains available under hidden-rating protection, within the tested inputs. |

The candidate's Rated injured-plan Core High versus Low shifted 2.4–3.9 minutes out of the top five per game across these rosters; this was accompanied by changes in who filled the reserve roles. That is a modest but visible preference effect. In the candidate's No Ratings injury cases, Long versus Short increased the count of players with >1 target minute from 9 to 12 for each roster. In Rated injury cases, Long activated fewer players than Short in 4 of 9 team/Core comparisons, the same count in 5, and more in none. Those reversals were concentrated in marginal roles, not the primary allocation.

### Adversarial Long/Short reversal: MIN–DEN, Rated, injured Custom

The candidate's Low/Short plan assigns about 1.1, 0.9 and 0.6 minutes to T.J. Warren (F, OVR 41), Jaylen Clark (SG, OVR 41), and Leonard Miller (SF, OVR 34). Under Low/Long it drops those three targets to zero and raises Wendell Moore Jr. (SG, OVR 42) from 2.5 to 7.7 minutes. Positive targets fall from 14 to 11; the total for targets after the top five stays the same. The 12-game mean margin moved by +4.33 points Long minus Short, with large game-to-game variance and a descriptive 95% interval about −5.69 to +14.36. This is not evidence of a scoring advantage.

This direction is not automatically a defect: the UI says Depth guides a preferred rotation size and how readily zero-minute reserves join injury cover, not a hard cap; the candidate selects one slightly more capable reserve over three very marginal roles. It is nevertheless a visible preference reversal and should be explicitly represented in any accepted behavior contract. No extra algorithm patch is justified from this low-impact, role-dependent example alone.

## Complete real-team injury example

ORL–IND, Rated, Custom, Low Core / Short Depth, ORL's top three healthy-plan players unavailable (Paolo Banchero, Jalen Suggs, Franz Wagner), no Lock and no pin. Same 12 game seeds in both arms. The healthy column is the same fixed pre-injury plan. OVR is shown only as one diagnostic field, not a universal measure of basketball value. The game continued to use the real ratings/composites and dynamic GameSim logic.

| Player | Pos | OVR | Healthy target | Main target / actual | Candidate target / actual | Lowest energy, Main → Candidate | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| Cole Anthony | PG | 56 | 18 | 23.8 / 24.8 | 27.4 / 28.5 | .83 → .74 | Healthy |
| Paolo Banchero | PF | 65 | 34 | 0 / 0 | 0 / 0 | 1.00 → 1.00 | Injured |
| Goga Bitadze | C | 55 | 14 | 18.5 / 20.9 | 25.0 / 25.8 | .84 → .85 | Healthy |
| Anthony Black | PG | 54 | 7 | 9.3 / 11.7 | 30.7 / 30.0 | .93 → .85 | Healthy |
| Wendell Carter Jr. | FC | 58 | 30 | 38.0 / 36.8 | 31.0 / 31.2 | .61 → .74 | Healthy |
| Markelle Fultz | G | 56 | 27 | 35.0 / 34.2 | 28.0 / 29.0 | .65 → .83 | Healthy |
| Gary Harris | SG | 58 | 21 | 27.8 / 28.0 | 29.5 / 29.9 | .76 → .82 | Healthy |
| Kevon Harris | SG | 41 | 0 | 10.5 / 12.0 | 0 / 0.0 | .89 → 1.00 | Healthy |
| Caleb Houstan | SF | 42 | 0 | 7.2 / 7.9 | 0 / 0.3 | .95 → .97 | Healthy |
| Jett Howard | SF | 41 | 0 | 6.0 / 0.8 | 0 / 0 | 1.00 → 1.00 | Healthy |
| Joe Ingles | F | 54 | 4 | 5.3 / 4.6 | 16.3 / 15.9 | .89 → .84 | Healthy |
| Jonathan Isaac | PF | 54 | 9 | 11.9 / 14.3 | 25.5 / 24.7 | .87 → .75 | Healthy |
| Chuma Okeke | F | 42 | 0 | 6.0 / 6.5 | 0 / 0.4 | .85 → .94 | Healthy |
| Trevelin Queen | SG | 49 | 0 | 26.6 / 26.3 | 2.7 / 3.1 | .81 → .93 | Healthy |
| Admiral Schofield | F | 41 | 0 | 6.0 / 2.0 | 0 / 0 | .83 → 1.00 | Healthy |
| Jalen Suggs | G | 67 | 33 | 0 / 0 | 0 / 0 | 1.00 → 1.00 | Injured |
| Franz Wagner | SF | 69 | 37 | 0 / 0 | 0 / 0 | 1.00 → 1.00 | Injured |
| Moritz Wagner | C | 53 | 6 | 7.9 / 11.4 | 23.9 / 23.5 | .87 → .82 | Healthy |
| **Total / team result** |  |  | **240 target** | **240 target / 242.1 actual** | **240 target / 242.1 actual** | **0.353 low-energy player-min/game → 0** |  |

Main gave Trevelin Queen 26.6 target minutes; Candidate gives him 2.7 and uses Anthony Black, Jonathan Isaac, Goga Bitadze and Moritz Wagner more. This is a role/roster reallocation, not a flat minute cut. ORL positive targets (>1 min) fell 15→10; its top-five target total moved 151.3→146.6 and deep target minutes 88.7→93.4. No player exceeded a 38-minute target. One of the 12 seeds went to overtime in both arms, so actual team minutes averaged 242.1 even though regulation targets summed to 240. Across these 12 seeds ORL scored 107.67 vs 115.00 in Main and 99.83 vs 107.50 in Candidate: margin −7.33 vs −7.67 (Candidate-minus-Main −0.33). The paired-seed interval is very wide (about −11.5 to +10.8 points); this small sample does not establish a performance change. The maximum player mean actual minute fell from 36.79 to 31.15, and low-energy player-minutes fell by 0.353 per team-game in this case. This is a useful targeted improvement, not proof of general superiority.

### Four-way fixed-opponent crossover

Mean score across 12 seeds; first number is the first named team. `M` is Main allocator and `C` Candidate allocator on that side.

| Matchup | M–M | C–C | M–C | C–M |
|---|---:|---:|---:|---:|
| BOS–NYK | 100.3–113.2 | 106.1–101.8 | 98.8–110.0 | 103.8–110.5 |
| ORL–IND | 99.2–92.2 | 103.3–100.4 | 104.3–108.7 | 100.8–96.9 |
| MIN–DEN | 104.3–104.6 | 98.2–98.9 | 101.4–99.0 | 101.3–95.5 |

The sign changes by team and opponent policy. Sample variation is large relative to these differences. No general AI/opponent-specific damage or candidate dominance follows from these 36 policy cells.

## AI zero-sum audit

The 96 archived season pairs contain 30 teams, 82 games per team, and 1,230 games per arm per season. The nine controlled TIDs are fixed by split in the archived analyzer. For every unique season pair, independently re-summing the team records gives:

- maximum absolute league sum of candidate-minus-Main point-differential changes: `1.44e-15` points/game;
- maximum absolute league sum of win changes: `0`;
- maximum error in `9 × controlled mean + 21 × AI mean = 0`: `1.78e-15` points/game, and exactly `0` wins.

Across the 96 pairs, controlled teams averaged +0.460 point-differential/game and +0.442 wins/team; AI teams averaged −0.197 point-differential/game and −0.189 wins/team. Those group signs are mathematically linked because each league game gives one team the opponent's exact negative point differential and exactly one total win. They cannot be described as independent AI degradation.

Other AI outcomes are not zero-sum. Across the 96 pairs, AI points/game change was −0.063 (descriptive 95% CI −0.164 to +0.037); new injury events changed +0.148 per 1,000 player-games (−0.017 to +0.313); low-energy minutes/player-game changed −0.0047; 40+ minute player-games changed −0.166 per 1,000 (−0.358 to +0.026). These are small and uncertain; they do not support either an AI injury claim or a claim of no possible AI issue. The AI plan path does use candidate Auto generation; the zero-sum result is not evidence that AI code was unchanged.

## Long-term counterfactual review

### Existing 96 multi-team season pairs

These are reused, not rerun. They cover two roster years, Rated/No Ratings, pins/no pins, all 30 teams, all nine profiles assigned across the controlled teams, fixed schedule/initial form draws, and full season feedback. Injury and random-number paths can diverge after rotation changes; same initial seed does not align every later injury or possession.

For 2024 Rated / no pins, controlled teams changed +0.80 wins/team (95% CI −0.05 to +1.64), +0.70 point differential/game (+0.35 to +1.05), and +0.56 points/game (+0.21 to +0.92). AI point differential was −0.30 as the exact league counterpart above; AI points/game changed +0.02. Actual ≥40-minute player-games fell for controlled teams by 2.76/1,000 player-games and by 0.18/1,000 for AI (the AI interval crossed zero). Low-energy minutes/player-game fell for both groups. New injuries/unavailable player-games were not consistently improved or worsened. Other profile cells are mixed; the full table and uncertainty are in the original season report. No aggregate outcome demonstrates a broad, uncontrolled decline.

### Existing 40-season NYK study

| Measure | Candidate − Main | 95% paired-season interval |
|---|---:|---:|
| Wins/team | −1.05 | [−2.85, +0.75] |
| Point differential/game | −0.076 | [−0.769, +0.617] |
| New injury events | +0.525 | [−1.075, +2.125] |
| Unavailable player-games | −9.5 | [−20.43, +1.43] |
| Injury-days | −20.775 | [−44.292, +2.742] |
| Low-energy minutes | −12.547 | [−20.512, −4.583] |
| Player-games with 40+ minutes | −1.0 | [−1.964, −0.036] |

Candidate won fewer games in 22/40 seasons and more in 18/40. The worst result was −14 wins, the best +9; the 10th percentile was −8, and paired-season SD was 5.62 wins. A normal approximation using the observed mean/SD predicts 2.23 of 40 seasons at −10 wins or worse; 2 occurred. −14 is about 2.3 SD below the mean and is not an unusual single tail for this sample size. This approximation is a diagnostic, not a proof of a normal tail.

In the −14 seed (`s01`), injury paths first diverged in round 5. Candidate had +9 new events, +53 unavailable player-games and +120 injury-days, while low-energy time was 6.7 minutes lower and 40+ exposure 3 player-games lower. By round 80, Main had 47 NYK wins and Candidate 36, with 19 versus 27 injury events and 217 versus 320 injury-days. A second −12-win season first diverged in injury status in round 1. Across the 40 seeds, wins correlated with injury-event differences (−0.29), unavailable games (−0.57) and injury-days (−0.60). This is endogenous association: injuries alter rotations and availability, while rotations alter exposure and subsequent random paths. It cannot allocate the worst season's loss entirely to either direct tactics or injury chance.

**Long-term conclusion:** no replicated system-wide adverse effect is supported. The NYK interval still allows a moderate negative mean, and the injury-mediated tail is a residual risk. More full seasons would have low decision value until the hard-contract/test questions below are settled; simply increasing the count until a CI crosses zero would be inappropriate.

## Four retained red tests

Reran the four assertions in isolation on the clean exact candidate checkout (`review-ready` at `755f0c2…`). Result: **4 failed as expected**, 91 unrelated tests skipped. Assertions were not modified.

| Test / current failure | What it actually proves | Review decision |
|---|---|---|
| `basketballMinutes.test.ts:909` — weak OVR-20 reserve expected ≤10, actual 22.648. | Candidate gives the only remaining sixth healthy player material minutes after one player is unavailable. A universal 10-minute cap is not a stable product contract in a six-player mathematical pool; it could force the stars through a much larger load. The second assertion that a stronger version receives >15 more still holds. | Retain red until rewritten as a whole-roster behavior test. Do not cap at 10 just to satisfy it. Test a weak fringe reserve against a sufficiently capable/position-fitting alternative, while allowing unavoidable emergency minutes. |
| `basketballMinutes.test.ts:1212` — expected exactly two active deep players in Short, observed one before the test reaches its Override subcases. | The failure is an exact legacy headcount expectation, not a failed pin, Lock or total. It prevents that test from verifying its later clauses. | Do not change the product to a hard player count. Replace with a preference/role behavior contract and separately test exact pin invariance. |
| `basketballMinutes.test.ts:1355` — expected exactly 2/3/5 deep players by Short/Normal/Long, observed one for the first profile. | This encodes a fixed roster shape and strict zero masks. The UI does not say these are hard limits. A Custom zero is preserved as the healthy plan, but may become an injury reserve in the temporary game-only plan. | Keep assertion untouched pending product decision on Custom zero semantics. Build a test where a zero-minute reserve is promoted only to solve a real vacancy and is not silently persisted into the healthy plan. |
| `dynamicMinutesGameSim.test.ts:368` — expected pid 9 at zero, actual target 11.024 with a valid Override on pid 1. | Candidate chooses a different emergency reserve; the pin and exact 240 total hold. This does not by itself prove the user's zero meant a permanent injury DNP. Existing temporary injury redistribution already promotes some healthy zero-minute reserves. | Do not label harmless or change the test yet. Decide whether a Custom zero is a hard exclusion or a healthy-game DNP preference; then test valid Override, injury coverage, positions and saved-plan immutability accordingly. |

The separate `dynamicMinutesGameSim.test.ts:744` monotonic high-minute-curve test timed out at the suite's 5-second default during a previous loaded batch. A direct isolated run with `--testTimeout=60000` passed (1 passed, 23 skipped, 10.87 seconds wall time). This is a harness timeout, not a confirmed semantic failure.

## Independent system-wide risk ranking

| Rank | Risk / evidence | Status |
|---|---|---|
| 1 | **Custom zero-minute meaning and zero-reserve promotion.** Three red assertions point to a user-visible distinction; current behavior promotes a healthy zero reserve in temporary injury planning while keeping the saved healthy plan unchanged. | **Product contract unresolved.** This is the principal approval blocker. |
| 2 | **Depth preference can reverse on marginal Rated injury roles.** 4/9 candidate Rated Long-vs-Short team/Core cases had fewer >1-minute targets under Long; the MIN example traded three sub-minute/near-zero roles for one stronger reserve. | **Real but low-impact, plausibly quality-driven.** No automatic patch; include an accepted behavior test. |
| 3 | **Prior large per-team tail in NYK.** One −14 win path coincided with much worse random injury experience; 40 seasons do not support systematic harm, but cannot exclude a team-specific moderate effect. | **Unresolved stochastic risk, no repeated causal harm found.** |
| 4 | **Core/Depth or AI score averages.** Same-roster tests and zero-sum checks disprove the earlier broad “settings dead” and “AI point differential independently harmed” conclusions. | **Earlier conclusions corrected; no fix warranted from those metrics.** |
| 5 | **Main targeted injury cases and candidate complexity.** Earlier exact LAL/IND/ORL experiments show intended improvements, but only three rosters were newly factorized here. | **Good evidence to continue review, insufficient for universal adoption.** |

The candidate keeps the original Dynamic GameSim substitution, energy, foul, injury and possession logic; it changes targets. No evidence here supports a V1.5 architecture replacement. No source fix was made in this audit because changing reserve eligibility without a zero-minute product contract risks violating user intent.

## Decision relevance and approval criteria

The current result is **not an integration Go**. The performance evidence is reassuring enough that another large season batch is not the highest-value next step. The next decision-bearing work is: (a) obtain the exact v1.1 review package, and (b) define Custom zero, injury-only reserve promotion and Short/Long preference semantics so the four red tests can be replaced with meaningful behavior tests after approval.

For any later validation, an automatic No-Go is a reproducible violation of a valid Current Override, Prevent-injury-increase hard cap, saved healthy Custom plan, No Ratings information boundary, or legal game-completion constraint. Performance would change this decision if a held-out fixed-injury matchup reproducibly loses at least 1 point/game without a measured workload/health or user-preference benefit, or if broad paired full seasons show at least 2 wins/82 games lost with a 95% interval below zero. These are prospective decision thresholds stated now, not preregistered thresholds for the already-run studies. A single negative random season or an unpaired same-seed box score is not enough.

## Source and artifact map

Candidate code commit: [`755f0c2bfa63565c3787307816c45efb0b021bb2`](https://github.com/Felix-hash9898/bbgm_playground/commit/755f0c2bfa63565c3787307816c45efb0b021bb2)

- `src/worker/core/team/basketballMinutes.ts`: Auto profile and depth reach (`617–685`); injury allocation and exact valid pin setup (`1296–1413`); role demand, reserve quality/endurance/fit and capacity (`1447–1508`); reference plans and ordinary/fallback/extended/emergency phases (`1511–1683`); infeasible protected allocation error (`1684–1718`).
- `src/worker/core/game/loadTeams.ts:429–498`: API/roster plan normalization, user-versus-AI control inputs, No Ratings `value` omission, injury availability, Lock/Depth/Core/Override passed to the effective allocator, and target minutes loaded into the unchanged GameSim.
- `src/worker/views/roster.ts:395–488`: UI health/Auto/effective preview uses the same effective allocator and reports unavailable players and allocation errors.
- `src/ui/views/Roster/index.tsx:796–849`: Depth and Core are expressly documented as preferred target behavior, not hard caps/workload limits.
- Red assertions: `src/worker/core/team/basketballMinutes.test.ts:885–920`, `:1180–1235`, `:1309–1370`; `src/worker/core/GameSim.basketball/dynamicMinutesGameSim.test.ts:344–382`, and timeout case `:744–770`.
- Reused full-season analysis: `holistic-review/season-analysis-v3.md`; raw pair manifest/data: `holistic-review/RUNS-v3.jsonl`, `holistic-review/results-v3/`, `holistic-review/analyze-seasons-v3.py`.
- New factorial raw output: `holistic-review/depth-core-factorial.json`; the review branch also carries a compact, reviewer-readable JSONL export with all 432 factor cells and 144 cross-play seeds, plus its SHA manifest. It records every player's target, average actual minutes and energy by cell, and each seed's score. Rated-only OVR arrays are omitted from No Ratings rows. Fixture: `holistic-review/fixtures/holdout2024.json`; temporary runner: `repair-auto/tools/research/holisticDecisionGate.test.ts` (research path, not part of the candidate commit).

### Reproduction

On Node 24 / installed project dependencies, run the two selected red source files using `vitest --run` filtered to the four test names in the table. Run the timeout test alone with `--testTimeout=60000`. For the factorial, the recorded harness imports the exact base allocator snapshot and the candidate allocator, then calls production `GameSim.run()` on the fixed 2024 real-roster fixture. The old 136 paired seasons remain untouched.

### SHA-256

The report-only GitHub audit branch carries this review. Local raw files remain under the current Cloud workspace; their hashes are included here to identify the evidence used:

```
factorial output:  87a02957bd40342e4b6b60aae977121bd0ec1f60d9822ec1c707fb2b9a5c9161
season pair index: 92929fddd75625e9315e7b54ce0d7c61ce42c99e8bc01b54cb20ad9882fa9bae
factorial runner:  595303aee85292474d55a1ed928a03d61f1599bb1434b46670e6d7ba003a5868
factorial review-data manifest: 22b3636572e0ee08602072c8cd4adc04bcd02e5122b8678d49d9577a0c01a844
candidate allocator source: f3cd3e48f586e92af19707a82019b08ef88019165d38b97616eb9bb9ed29f571
```
