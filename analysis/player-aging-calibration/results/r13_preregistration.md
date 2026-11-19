# Round 13 pre-registration (written before the runs named here)

## Harness integration (done before this file; results in REPORT round 13)
Full-league GameSim research arm (FULL_GS_ARM, --config sim/r5.config.ts): prepare + install at every regular-season
start (mocked newPhaseRegularSeason wrapper), mid-season signings fall back to production, previous-season choice counts
carried onto the player's own stats row, per-season hook log gamesim_hooks.jsonl, run fails if the arm never fires.

## Independent static validation of the start-season behaviour of three_anchor_rel (= three_era_p at the start season)
Seasons never used for any three-point run: 2025 (BBGM real ratings 2025, hindsight; modern default presets = the 2020
preset values the product applies after its last preset); secondary 2021 (appeared as year 2 of the round-11 B5 loop for
the 2019 roster: partially seen, reported separately).  Early era: a pre-2005 static set is NOT built (29-team seasons
break the 30-team builder template) -- stated limitation.
Arms unchanged vs three_era_p, seeds 2511 / 2612 (2025) and 2111 / 2212 (2021); criteria G1-G5 of results/r11_preregistration.md
(G1 dispersion slope and >= 0.55 share closer to NBA; G2 per-player 3PA error lower; G3 TS MAE not worse by > 0.003 and
league TS gap not worse by > 0.005; G4 no spill to non-shooters; G5 plays36 MAE not worse by > 0.05 and league 3P% gap
not worse by > 0.005).  GO for the start-season component on independent data = G1-G5 in 2025.

## Results before the experiment design (all recorded in REPORT round 13)
- Harness isolation: control under the hook-transformed config reproduces the cloud (untransformed) smoke season
  exactly (503 / 503 player rows identical).  Hooks active every season (gamesim_hooks.jsonl; 1.5% / 0.1% of decisions
  by late signings fall back to production).
- Independent static 2025: three_era_p G1, G2, G3, G5 pass; G4 FAILS by 0.001 (non-shooters' 3PA share 0.049 vs
  production 0.028, NBA 0.013) -> NO-GO by rule on the cleanest independent data.  2021 (secondary): all pass.
- Open-league smokes (1 seed, 1 season): 2005 and 2021 both improve dispersion / specialists / per-player 3PA error;
  per-player TS error +0.0013 / +0.0028 (watch item).

## Proposed modern open-league experiment R13-M (NOT run; requires authorisation to push and run on GitHub Actions)
Real league 2021 preseason (rpd 0, real draft classes while available), production GameSim config sim/r5.config.ts.
Arms and why each is needed:
  A  playground                        control (production growth + production GameSim)
  B  playground + three_anchor_rel     the candidate (GameSim three-point component)
  C  v9s_l4 + three_anchor_rel         interaction with the growth-structure candidate (both are candidates to combine)
Official is not needed for this question (growth baselines exist in the 2005 archives).
Seeds 21 / 22 / 23, 5 seasons (2021 -> 2025, NBA truth for every season); plus a long-horizon stability run A / B x 1
seed x 15 seasons (2021 -> 2036, no truth: drift / explosion bounds only).
Fixed cohorts per season (start-roster players >= 500 NBA min and >= 300 min in every run), pooled seeds.
Hard criteria (B vs A):
 T1 per-player 3PA-share error lower in every season 2021-2025;
 T2 share >= 0.55 closer to NBA in every season; T3 league 3PA share closer to NBA in every season;
 T4 non-shooters (NBA 3PA share < 0.05): mean sim 3PA share not higher than A by > 0.02;
 T5 per-player TS MAE not worse by > 0.003 (the smokes' +0.0013 / +0.0028 were seen before this threshold, stated);
    league TS gap not worse by > 0.005;
 T6 per-player plays36 MAE not worse by > 0.10;
 T7 ecology: star persistence (scripts/102 metric, top 10% / top 30% at t+3) and exit hazard by age x tier within
    +-0.05 of A; generated-player minutes share not higher by > 0.02.
Long run (B): league 3PA share within +-0.03 of A in every season; share >= 0.55 between 0.10 and 0.35; generated
rookies' share >= 0.55 not above 2x that of real players of the same age.
C is reported against A and B with the same metrics plus the R11 O1-O5; no GO decision is made for C here.

## R13.1 (written 2026-11-19 BEFORE any modern multi-season run; supersedes the R13-M arm list above)
Status of evidence: the R13 2025 held-out NO-GO of three_anchor_rel / three_era_p (G4 spill) stays on record.  The fix
`priorCapPg = 2` (ratings prior <= 2 x production choice; scripts/104-106) was developed with 2021 / 2025 visible and
checked on 2007 / 2009 / 2011 -> those are development / regression seasons now, NOT held-out.  Any further static season
used afterwards is only "not used for tuning cap2" (all have been seen by earlier three-point arms).

Arms (2021 start, real draft classes, seeds 21 / 22 / 23, 5 seasons -> truth seasons 2021-2025):
  A  playground                                  control
  B  playground + three_anchor_rel_cap2          candidate (three-point component, non-shooter fix)
  C  v9s_l4 + three_anchor_rel_cap2              growth-structure x GameSim interaction; reported, no GO decision
  D  playground + three_anchor_rel_cap2_mix      + R5 two-point mix / make / foul calibration (`final` parts): the TS
                                                 root cause (R13.1 task 2); exploratory, no GO decision
Long run: A / B x seed 31 x 15 seasons.  2005 guard: B x seeds 11 / 12 / 13 x 8 seasons, paired with the existing R11
controls (sim/output_full_r11 playground 11-13, same harness; control transform = exact no-op).

Hard criteria for B vs A (unchanged from R13 except the guard, which is new):
 T1 per-player 3PA-share MAE lower in every season 2021-2025;  T2 share >= 0.55 closer to NBA in every season;
 T3 league 3PA share closer to NBA in every season;  T4 non-shooters (NBA share < 0.05; label for scoring only):
 mean sim share not higher than A by > 0.02 in any season;  T5 per-player TS MAE not worse by > 0.003, league TS gap
 not worse by > 0.005;  T6 per-player plays36 MAE not worse by > 0.10;  T7 ecology: star persistence (scripts/102,
 top 10% / 30% at t+3) and exit hazard by age x tier within +-0.05 of A; generated-player minutes share not higher by
 > 0.02.
 Long run (B): league 3PA share within +-0.03 of A every season; share >= 0.55 in [0.10, 0.35]; generated rookies'
 share >= 0.55 not above 2x real players of the same age.
 Guard 2005 (B vs R11 controls, seasons 2006-2012, scripts/97 metrics on the open league): per-player 3PA MAE not
 worse in any season; share >= 0.40 in 2012 >= control's and >= 0.5 x NBA (R11 B2 failure mode: specialists vanish
 in loops); league TS gap not worse by > 0.005; non-shooter spill <= +0.02; survivor-free growth / star metrics of
 scripts/102 within +-0.05 of the control.
D is worth a dedicated follow-up only if league TS gap shrinks by >= 0.010 in every season 2021-2025 AND the drift of
the mid-range share of 2PA over 2022 -> 2025 is within 0.03 of the NBA's (R7 failure mode: style drift in loops).
GO for B requires every hard criterion; any failure is NO-GO for B (no re-tuning on these runs).
