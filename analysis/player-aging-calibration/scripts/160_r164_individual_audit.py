"""Audit veteran collapses and long-run ability combinations from frozen archives.

Rates use script 157's league-relative box formula. The source archives contain season
totals and dated simulated injuries, but have no game-level roles or shots faced.
"""
import argparse
import gzip
from importlib import import_module
import json
from pathlib import Path

import numpy as np
import pandas as pd

panel = import_module("157_r164_trajectory_panel")
traj = import_module("159_r164_trajectory_acceptance")
ROOT = panel.HERE
ARCHIVE = ROOT / "results/r164_cloud"
KEYS = ["src", "league", "id", "season"]
STATS = ["stl36", "blk36", "ast36", "off36", "def36", "fga36", "tpa36", "ts"]
SENS = ROOT / "results/r164_local/trajectory/skill_sensitivity_per_point.csv"


def paths():
    for run, arms in (("45643807853", "K"), ("45678905354", "FK"), ("45700795073", "LM")):
        for path in sorted((ARCHIVE / f"run_{run}/cells").glob("r164-cell-*/full__*.gz")):
            _, _, year, _, arm = path.parent.name.split("-")
            if arm in arms and year in ("2021", "2024"):
                yield arm, path


def simulated_context(src, path):
    with gzip.open(path, "rt") as file:
        run = json.load(file)
    league = f"{run['start']}-{run['seed']}"
    rows = []
    for p in run["players"]:
        sid = p["srID"] or f"generated_{p['pid']}"
        injuries = {}
        for injury in p["injuries"]:
            year = injury["season"]
            games, drop = injuries.get(year, (0, 0))
            injuries[year] = games + injury["games"], drop + injury["ovrDrop"]
        stats = {}
        for row in p["stats"]:
            if row["tid"] >= 0:
                stats.setdefault(row["season"], []).append(row)
        rated = {}
        for row in p["ratings"]:
            rated.setdefault(row["season"], []).append(row)
        for season, ratings in rated.items():
            if season < run["start"]:
                continue
            teams = stats.get(season, [])
            primary = max(teams, key=lambda t: t["min"])["tid"] if teams else None
            games, drop = injuries.get(season, (0, 0))
            rows.append(dict(src=src, league=league, id=sid, season=season, team=str(primary) if primary is not None else None,
                             injury_games=games, injury_ovr=drop, preseason_ovr=ratings[0]["ovr"],
                             started=sum(t["gs"] for t in teams),
                             drafted=p["draft"]["round"] in (1, 2), pot=ratings[0]["pot"]))
    return pd.DataFrame(rows)


def load():
    nba = pd.read_parquet(ROOT / "data/nba_player_seasons.parquet", columns=["slug", "season", "first_team", "last_team", "gs"])
    nba = nba.drop_duplicates(["slug", "season"]).rename(columns={"slug": "id", "last_team": "team", "gs": "started"})
    nba = panel.nba_rows().merge(nba[["id", "season", "team", "started"]], on=["id", "season"], how="left", validate="one_to_one")
    frames = [nba]
    for arm, path in paths():
        rows = panel.league_rows(arm, path)
        rows = rows.merge(simulated_context(arm, path), on=KEYS, how="left", validate="one_to_one")
        frames.append(rows)
    full = pd.concat(frames, ignore_index=True)
    full["min"] = full["min"].fillna(0)
    full["team"] = full["team"].astype("string")
    played = panel.finish(full)
    full = full.join(played[[c for c in played.columns if c not in full.columns]])
    full["usage36"] = (full.fga + .44 * full.fta + full.tov) * 36 / full["min"].where(full["min"] > 0)
    full["start_rate"] = full.started / full.gp.where(full.gp > 0)
    return full


def veteran_pairs(full):
    d = traj.base(full)
    keep = ["net36_rel", "off36_rel", "def36_rel", "min", "mpg", "gp", "team", "ovr", "preseason_ovr",
            "injury_ovr", "injury_games", "usage36", "tpar", "start_rate", "ts"]
    m = traj.ahead(d, 1, keep, how="left")
    m = m[m.age.between(30, 40)].copy()
    m["both"] = m.min_n >= 500
    m["collapse"] = (m.net36_rel_n - m.net36_rel) <= -2.5
    for k in ("net36_rel", "off36_rel", "def36_rel", "usage36", "tpar", "ts", "mpg", "gp", "ovr", "start_rate"):
        m[f"delta_{k}"] = m[f"{k}_n"] - m[k]
    m["offseason_ovr"] = m.preseason_ovr_n - m.ovr
    m["injured_permanently"] = m.injury_ovr.fillna(0).gt(0) | m.injury_ovr_n.fillna(0).gt(0)
    m["injured_10"] = m.injury_games.fillna(0).ge(10) | m.injury_games_n.fillna(0).ge(10)
    m["known_team"] = m.team.notna() & m.team_n.notna()
    m["same_team"] = m.known_team & m.team.eq(m.team_n)
    m["four_years"] = True
    for lag in (2, 3):
        follows = d[KEYS].copy()
        follows["season"] -= lag
        m["four_years"] &= pd.MultiIndex.from_frame(m[KEYS]).isin(pd.MultiIndex.from_frame(follows))
    m["steady_role"] = (m.same_team & m.delta_mpg.abs().le(4) & m.delta_usage36.abs().le(2)
                        & m.delta_start_rate.abs().le(.25))
    m["high_minutes"] = m["min"].ge(1200) & m.min_n.ge(1200)
    m["large_growth_loss"] = m.offseason_ovr.le(-4)
    # Value impact on the fixed 500-minute starting cohort, including those who subsequently leave the rotation.
    end = full[KEYS + ["min", "net36_rel"]].copy()
    end["season"] -= 1
    m = m.merge(end, on=KEYS, how="left", suffixes=("", "_actual"), validate="one_to_one")
    target_min = m.min_actual.fillna(0)
    end_net = m.net36_rel_actual.fillna(0)
    m["total_lost"] = (m.net36_rel + 1.5) * m["min"] / 36 - (end_net + 1.5) * target_min / 36
    m["minutes_component"] = (m.net36_rel + end_net + 3) * (m["min"] - target_min) / 72
    m["rate_component"] = (m.net36_rel - end_net) * (m["min"] + target_min) / 72
    # When there are no minutes, only the missed opportunity is observed.
    no_rate = m.net36_rel_actual.isna()
    m.loc[no_rate, "minutes_component"] = m.loc[no_rate, "total_lost"]
    m.loc[no_rate, "rate_component"] = 0
    assert np.allclose(m.total_lost, m.minutes_component + m.rate_component)
    return m


def veteran_tables(m):
    coverage = m.groupby("src").agg(starting_regulars=("collapse", "size"), two_regular_years=("both", "mean"))
    print("Fixed first-year regulars")
    print(coverage.round(3))
    rows, flags = [], []
    for name, group in m.groupby("src"):
        both = group[group.both]
        for label, q in {
            "all": both, "four regular years (original metric)": both[both.four_years],
            "1200+ both": both[both.high_minutes], "same primary team": both[both.same_team],
            "same team, steady role": both[both.steady_role], "moved": both[both.known_team & ~both.same_team],
            "2005–14 NBA / through sim year 8": both[(both.season.le(2014) if name == "NBA" else both.season.lt(both.start + 8))],
            "2015–26 NBA / from sim year 9": both[(both.season.ge(2015) if name == "NBA" else both.season.ge(both.start + 8))],
            "no recorded permanent loss": both[~both.injured_permanently] if name != "NBA" else both.iloc[:0],
            "no recorded 10-game or permanent injury": both[~(both.injured_10 | both.injured_permanently)] if name != "NBA" else both.iloc[:0],
            "OVR aging loss <= 3": both[~both.large_growth_loss] if name != "NBA" else both.iloc[:0],
            "OVR aging loss >= 4": both[both.large_growth_loss] if name != "NBA" else both.iloc[:0],
        }.items():
            if len(q):
                rows.append(dict(arm=name, cohort=label, n=len(q), collapse=q.collapse.mean(),
                                 mean_delta=q.delta_net36_rel.mean(), gain_tail=q.delta_net36_rel.ge(2.5).mean()))
        for label, q in (("collapse", both[both.collapse]), ("other", both[~both.collapse])):
            if q.empty:
                continue
            row = dict(arm=name, cohort=label, n=len(q), team_coverage=q.known_team.mean(),
                       same_team=q[q.known_team].same_team.mean(), steady_role=q[q.known_team].steady_role.mean(),
                       d_gp=q.delta_gp.mean(), d_mpg=q.delta_mpg.mean(), d_usage36=q.delta_usage36.mean(),
                       d_ts=q.delta_ts.mean(), d_off36=q.delta_off36_rel.mean(), d_def36=q.delta_def36_rel.mean(),
                       lost_total=q.total_lost.mean(), minutes_component=q.minutes_component.mean(), rate_component=q.rate_component.mean())
            if name != "NBA":
                row.update(injury_permanent=q.injured_permanently.mean(), injury_10=q.injured_10.mean(),
                           large_growth_loss=q.large_growth_loss.mean(), d_ovr_age=q.offseason_ovr.mean(),
                           d_ovr_all=q.delta_ovr.mean())
            flags.append(row)
    return coverage.reset_index(), pd.DataFrame(rows), pd.DataFrame(flags)


def ability_combinations(full):
    sensitivity = pd.read_csv(SENS, index_col=0)
    d = full.copy()
    for field in ("off36", "def36", "net36"):
        d["ability_" + field] = d[["r_" + k for k in sensitivity.index]].to_numpy() @ sensitivity[field].to_numpy()
    d["period"] = np.select(
        [d.src.eq("NBA"), (d.season - d.start).between(2, 7), (d.season - d.start).between(8, 17)],
        ["NBA", "seasons 3–8", "seasons 9–18"], default="other",
    )
    d = d[d.period.ne("other") & d.ovr.notna()]
    d["experience"] = d.season - d.draft
    d = d[d.experience.ge(1)]
    # Skills before observed minutes are compared to the same ability group after selection.
    # Generated undrafted prospects have ratings records too; restrict the entry panel to actual draft picks below.
    age = pd.cut(d.age, [17, 22, 25, 29, 40])
    height = pd.cut(d.r_hgt, [-1, 33, 58, 101])
    d["age_height"] = age.astype(str) + "/" + height.astype(str)
    rows = []
    for (arm, period, real), group in d.groupby(["src", "period", "real"]):
        for label, q in (
            ("young drafted entry", group[group.experience.eq(1) & (group.drafted.eq(True) | group.src.eq("NBA")) & group.age.between(19, 23)]),
            ("played", group[group["min"].ge(100)]),
            ("500+ minutes", group[group["min"].ge(500)]),
            ("1000+ minutes", group[group["min"].ge(1000)]),
            ("2000+ minutes", group[group["min"].ge(2000)]),
        ):
            if len(q) < 30:
                continue
            x, y = q.ability_off36, q.ability_def36
            blocks = q.groupby("age_height")
            rows.append(dict(arm=arm, era=period, real=bool(real), cohort=label, n=len(q),
                             predicted_corr=x.corr(y), predicted_corr_within_age_height=(
                                 x - blocks.ability_off36.transform("mean")).corr(y - blocks.ability_def36.transform("mean")),
                             iq_corr=q.r_oiq.corr(q.r_diq), iq_corr_within_age_height=(
                                 q.r_oiq - blocks.r_oiq.transform("mean")).corr(q.r_diq - blocks.r_diq.transform("mean")),
                             actual_corr=q.off36_rel.corr(q.def36_rel), ovr_mean=q.ovr.mean(), ovr_sd=q.ovr.std(),
                             sd_oiq=q.r_oiq.std(), sd_diq=q.r_diq.std()))
    return pd.DataFrame(rows)


def main():
    arg = argparse.ArgumentParser(description=__doc__)
    arg.add_argument("output", type=Path)
    args = arg.parse_args()
    args.output.mkdir()
    full = load()
    full.to_parquet(args.output / "panel.parquet", index=False)
    coverage, rates, flags = veteran_tables(veteran_pairs(full))
    for label, frame in dict(veteran_coverage=coverage, veteran_rates=rates, veteran_flags=flags,
                             ability_combinations=ability_combinations(full)).items():
        frame.to_csv(args.output / f"{label}.csv", index=False)


if __name__ == "__main__":
    main()
