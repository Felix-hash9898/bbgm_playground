"""Individual trajectories: what declines, what is permanent, whether roles last, long-run skill combinations, continuity of growth.

Everything is measured the same way in the NBA (2005-26) and in the leagues, from production and minutes relative to the league
season. BBGM's real ratings are shown only as a second opinion (two eras): their authors' method changed in 2019-20 and they are
not a measurement of ability. Input is the panel of scripts/157. Usage (pandas venv): 159_... PANEL.parquet [OUTPUT.json]"""
import json
import sys

import numpy as np
import pandas as pd

SKILLS = ["stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"]
COMP = ["stl36", "blk36", "def36", "fga36", "off36", "ts", "ast36"]
OLD, YOUNG = ((28, 30), (31, 33), (34, 37)), ((19, 21), (22, 24))
ROLES = {"rim protector": "blk36_rel", "ball hawk": "stl36_rel", "scorer": "fga36_rel", "creator": "ast36_rel", "shooter": "tpa36_rel", "glass": "drb36_rel"}


def base(d):
    """Seasons the league itself decided: everything after the first season of a league."""
    d = d[(d["min"] >= 500) & d["rank"].notna() & ((d.src == "NBA") | (d.season >= d.start + 1))].copy()
    g = d.groupby(["src", "league", "season"])
    d["z"] = g.net36_rel.transform(lambda v: (v - v.mean()) / v.std())
    d["per_rank"] = g.net36_rel.rank(ascending=False)
    d["off_rank"], d["def_rank"] = g.off36_rel.rank(ascending=False), g.def36_rel.rank(ascending=False)
    for r, c in ROLES.items():
        d["p_" + r] = g[c].rank(pct=True)
    return d


def ahead(d, k, cols, how="inner"):
    n = d[["src", "league", "id", "season", *cols]].copy()
    n["season"] -= k
    m = d.merge(n, on=["src", "league", "id", "season"], how=how, suffixes=("", "_n"))
    last = d.groupby(["src", "league"]).season.max()
    m["last"] = m.set_index(["src", "league"]).index.map(last)
    return m[m.season + k <= m["last"]]


def composition(d, bands, scale):
    m = ahead(d, 1, ["min"] + [s + "_rel" for s in COMP])
    w = 2 / (1 / m["min"] + 1 / m.min_n)
    out = {}
    for lo, hi in bands:
        i = m.age.between(lo, hi)
        for s in COMP:
            out[f"{s} {lo}-{hi}"] = float(np.average((m[s + "_rel_n"] - m[s + "_rel"])[i], weights=w[i])) / scale[s]
    return out


def roles(d, k=3):
    m = ahead(d[d["rank"] <= 400], k, ["p_" + r for r in ROLES])
    m = m[m["rank"] <= 200]
    return {f"{r} {lo}-{hi}": float((x["p_" + r + "_n"] >= .7).mean()) for lo, hi in ((29, 32), (33, 36)) for r in ROLES
            for x in [m[m.age.between(lo, hi) & (m["p_" + r] >= .8)]]}


def persistence(d):
    out = {}
    for k in (1, 3, 5):
        m = ahead(d, k, ["z"])
        for lo, hi in ((22, 25), (26, 28), (29, 31), (32, 35)):
            x = m[m.age.between(lo, hi)]
            out[f"{lo}-{hi} k{k}"] = float(x.z.corr(x.z_n))
    return out


def variance_growth(d):
    out = {}
    for lo, hi in ((20, 24), (25, 29), (30, 33)):
        v = {}
        for k in (1, 5):
            m = ahead(d, k, ["net36_rel"])
            x = m[m.age.between(lo, hi)]
            c = x.net36_rel_n - x.net36_rel
            v[k] = float((c - c.groupby(x.age).transform("mean")).var())
        out[f"{lo}-{hi} permanent/yr"] = (v[5] - v[1]) / 4
        out[f"{lo}-{hi} one year"] = v[1]
    return out


def continuity(d):
    """Corr of two non-overlapping yearly changes (years 1 and 3 apart by one season): no shared season, so noise cannot fake it."""
    m = ahead(d, 1, ["net36_rel"]).rename(columns={"net36_rel_n": "x1"})
    for j in (2, 3):
        n = d[["src", "league", "id", "season", "net36_rel"]].rename(columns={"net36_rel": f"x{j}"})
        n["season"] -= j
        m = m.merge(n, on=["src", "league", "id", "season"])
    out = {}
    for lo, hi in ((19, 22), (23, 25), (26, 29), (30, 40)):
        x = m[m.age.between(lo, hi)]
        a, b = x.x1 - x.net36_rel, x.x3 - x.x2
        out[f"{lo}-{hi}"] = float((a - a.groupby(x.age).transform("mean")).corr(b - b.groupby(x.age).transform("mean")))
        fall = x[x.x1 - x.net36_rel <= -2.5]
        out[f"{lo}-{hi} one-year collapse share"] = float((x.x1 - x.net36_rel <= -2.5).mean())
        if len(fall) >= 12:
            out[f"{lo}-{hi} recovered next year"] = float((fall.x2 - fall.x1).mean() / -(fall.x1 - fall.net36_rel).mean())
    return out


def combos(d, full):
    out = {}
    yr = d.season - d.start + 1
    spans = {"all": d.season > 0} if (d.src == "NBA").all() else {"seasons 3-8": yr.between(3, 8), "seasons 9-18": yr.between(9, 18)}
    for lab, use in spans.items():
        x = d[use]
        n = x.groupby(["league", "season"]).ngroups
        r = x[x["min"] >= 1000]
        out[f"two-way (off top 30 and def top 60) per season, {lab}"] = float(((r.off_rank <= 30) & (r.def_rank <= 60)).sum() / n)
        out[f"corr offence-defence, {lab}"] = float(r.off36_rel.corr(r.def36_rel))
        have = r[r.r_oiq.notna()]
        out[f"oiq and diq 70+ per season, {lab}"] = float(((have.r_oiq >= 70) & (have.r_diq >= 70)).sum() / n)
        for k in ("diq", "oiq", "spd"):
            out[f"sd {k} of regulars, {lab}"] = float(have["r_" + k].std())
            out[f"mean {k} of regulars, {lab}"] = float(have["r_" + k].mean())
    return out


def independence(d):
    m = ahead(d, 1, [s + "_rel" for s in ("stl36", "blk36", "drb36", "ast36", "fga36", "ts", "ftr", "tpar", "off36", "def36")])
    cols = ["stl36", "blk36", "drb36", "ast36", "fga36", "ts", "ftr", "tpar"]
    out = {}
    for lo, hi in ((19, 24), (25, 29), (30, 40)):
        x = m[m.age.between(lo, hi)]
        c = pd.DataFrame({k: x[k + "_rel_n"] - x[k + "_rel"] for k in (*cols, "off36", "def36")})
        c = c - c.groupby(x.age).transform("mean")
        r = c[cols].corr().to_numpy()
        out[f"mean |r| of changes {lo}-{hi}"] = float(np.abs(r[np.triu_indices(len(cols), 1)]).mean())
        out[f"offence-defence change corr {lo}-{hi}"] = float(c.off36.corr(c.def36))
    return out


def skill_drops(full):
    """Second opinion only. Share of regulars (500+ minutes in both seasons) losing 9+ points of a skill in a year, real players."""
    d = full[full.real & (full["min"] >= 500) & full.r_spd.notna() & ((full.src == "NBA") | (full.season >= full.start))]
    m = ahead(d, 1, ["min"] + ["r_" + k for k in SKILLS])
    m = m[~((m.src == "NBA") & m.season.isin([2018, 2019, 2022]))]
    out = {}
    for lo, hi in ((29, 32), (33, 36)):
        x = m[m.age.between(lo, hi)]
        c = pd.DataFrame({k: x[f"r_{k}_n"] - x["r_" + k] for k in SKILLS})
        out[f"speed -9 {lo}-{hi}"] = float((c.spd <= -9).mean())
        out[f"any skill -9 {lo}-{hi}"] = float((c.min(axis=1) <= -9).mean())
        for k in ("spd", "jmp", "diq", "oiq", "tp", "dnk"):
            out[f"{k} per year {lo}-{hi}"] = float(c[k].mean())
    return out


def star_three_years(full):
    """The opening's 29-32 year olds at OVR 65+, three seasons later (real ratings for the NBA row)."""
    out = {}
    for start in (2021, 2024) if (full.src != "NBA").all() else (2021,):
        x = full[full.real & ((full.start == start) | (full.src == "NBA")) & (full.season == start) & full.age.between(29, 32) & (full.ovr >= 65)]
        m = x.merge(full.assign(season=full.season - 3)[["league", "id", "season", "ovr"] + ["r_" + k for k in SKILLS]], on=["league", "id", "season"], suffixes=("", "_n"))
        if len(m):
            out[f"{start} opening, n {len(m) / max(1, m.league.nunique()):.0f}"] = {k: round(float((m[k + "_n"] - m[k]).mean()), 1) for k in ("r_spd", "r_jmp", "r_diq", "r_oiq", "r_tp", "ovr")}
    return out


def measure(full, scale):
    d = base(full)
    return dict(old=composition(d, OLD, scale), young=composition(d, YOUNG, scale), roles=roles(d), persistence=persistence(d), variance=variance_growth(d),
                continuity=continuity(d), combos=combos(d, full), independence=independence(d), ratings=skill_drops(full), stars=star_three_years(full))


def scale_of(full):
    nba = base(full[full.src == "NBA"])
    return {s: float(nba[s + "_rel"].std()) for s in COMP}


def errors(arm, nba):
    """Mean absolute distance to the NBA of each group of measures."""
    gap = lambda part, keys=None: float(np.mean([abs(arm[part][k] - nba[part][k]) for k in (keys or nba[part]) if k in arm[part]]))
    role = lambda names: float(np.mean([abs(arm["roles"][k] - nba["roles"][k]) for k in nba["roles"] if k.rsplit(" ", 1)[0] in names]))
    old5 = [k for k in nba["persistence"] if k.endswith("k5") and k[:2] in ("29", "32")]
    return dict(composition_old=gap("old"), composition_young=gap("young"), roles_defence=role(("rim protector", "ball hawk")), roles_offence=role(("scorer", "creator", "shooter")),
                persistence_old_5y=gap("persistence", old5), persistence_other=gap("persistence", [k for k in nba["persistence"] if k not in old5]))


if __name__ == "__main__":
    full = pd.read_parquet(sys.argv[1])
    scale = scale_of(full)
    res = {s: measure(full[full.src == s], scale) for s in ["NBA"] + sorted(set(full.src) - {"NBA"})}
    for part in ("old", "young", "roles", "persistence", "variance", "continuity", "independence", "ratings"):
        print("\n" + part)
        print(pd.DataFrame({s: r[part] for s, r in res.items()}).round(3).to_string())
    print("\ncombos\n", pd.DataFrame({s: r["combos"] for s, r in res.items()}).round(2).to_string())
    for s, r in res.items():
        print(s, r["stars"])
    print("\nmean distance to the NBA\n", pd.DataFrame({s: errors(r, res["NBA"]) for s, r in res.items() if s != "NBA"}).round(3).to_string())
    if len(sys.argv) > 2:
        with open(sys.argv[2], "x") as f:
            json.dump(res, f, indent=1)
